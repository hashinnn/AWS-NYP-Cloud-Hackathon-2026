'use strict';

/**
 * UC-009 — the priority engine.
 *
 * Runs with no AWS mock, no network and no clock: `node --test`.
 * If this file passes, the ranking a judge sees on stage is the ranking this
 * arithmetic produces, every time.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const score = require('../lib/scoring');
const urgency = require('../lib/scoring/urgency');
const stakes = require('../lib/scoring/stakes');
const effortPressure = require('../lib/scoring/effortPressure');
const progressDeficit = require('../lib/scoring/progressDeficit');
const clashPenalty = require('../lib/scoring/clashPenalty');
const { normaliseWeights, compareTasks, DEFAULT_WEIGHTS } = require('../lib/scoring/normalise');
const { availableHoursBetween, dailyAvailableHours } = require('../lib/scoring/availability');

// 2026-08-17 00:00 Asia/Singapore — a Monday midnight, so whole-day windows
// contain whole weekdays and every figure below can be checked by hand.
const NOW = Date.parse('2026-08-16T16:00:00.000Z');

const days = (n) => n * 86400000;
const hours = (n) => n * 3600000;
const iso = (ms) => new Date(ms).toISOString();

const EVEN_PREFS = {
  tz: 'Asia/Singapore',
  availability: { mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 3, sun: 3 },
  blockedDates: [],
  weights: { ...DEFAULT_WEIGHTS },
};

function task(overrides) {
  return {
    taskId: 'task-1',
    title: 'Task',
    module: 'IT2214',
    type: 'assignment',
    status: 'active',
    gradeWeight: 20,
    effortHours: 4,
    progressPct: 0,
    prepDays: 0,
    createdAt: iso(NOW - days(2)),
    dueAt: iso(NOW + days(3)),
    priorityScore: null,
    ...overrides,
  };
}

const byId = (ranked) => Object.fromEntries(ranked.map((t) => [t.taskId, t]));

/** Silence and capture console.warn for the UC-009 E3 logging assertions. */
function captureWarnings(fn) {
  const original = console.warn;
  const lines = [];
  console.warn = (line) => lines.push(line);
  try {
    return { result: fn(), lines };
  } finally {
    console.warn = original;
  }
}

// ───────────────────────────────────────────────────────────────────────────
describe('HLD §7.4 — the worked example', () => {
  // IT2214 Database Report: 40% weight, 12 effort hours, 15% done, created 7
  // days ago, due in 3 days, 6 study hours available in that window, 2 other
  // deadlines inside ±72 h.
  const prefs = {
    tz: 'Asia/Singapore',
    availability: { mon: 2, tue: 2, wed: 2, thu: 0, fri: 0, sat: 0, sun: 0 },
    blockedDates: [],
    weights: { ...DEFAULT_WEIGHTS },
  };

  const report = task({
    taskId: 'a-report',
    gradeWeight: 40,
    effortHours: 12,
    progressPct: 15,
    createdAt: iso(NOW - days(7)),
    dueAt: iso(NOW + days(3)),
  });
  const clashA = task({ taskId: 'b-clash', dueAt: iso(NOW + days(2)) });
  const clashB = task({ taskId: 'c-clash', dueAt: iso(NOW + days(4)) });

  const ranked = score([report, clashA, clashB], prefs, NOW);
  const scored = byId(ranked)['a-report'];

  test('the window really does contain exactly 6 study hours', () => {
    assert.equal(availableHoursBetween(NOW, NOW + days(3), prefs), 6);
  });

  test('every sub-score matches the published table', () => {
    assert.deepEqual(scored.subScores, {
      urgency: 47.2,
      stakes: 100,
      effortPressure: 100,
      progressDeficit: 55,
      clashPenalty: 60,
    });
  });

  test('priority is 73.5 ± 0.1 — in fact exactly the published figure', () => {
    assert.ok(
      Math.abs(scored.priorityScore - 73.5) <= 0.1,
      `expected 73.5 ± 0.1, got ${scored.priorityScore}`,
    );
    assert.equal(scored.priorityScore, 73.5);
  });

  test('the task is flagged tight — 10.2 h of work into 6 h', () => {
    assert.equal(scored.tight, true);
    assert.deepEqual(scored.dataGap, []);
  });

  test('it ranks first', () => {
    assert.equal(ranked[0].taskId, 'a-report');
  });

  test('the five contributions on screen sum to the total on screen', () => {
    // 14.2 + 25.0 + 20.0 + 8.3 + 6.0 — the HLD §7.4 table, added up by hand.
    const s = scored.subScores;
    const shown = Object.entries(DEFAULT_WEIGHTS)
      .map(([key, weight]) => Math.round(weight * s[key] * 10) / 10);
    assert.deepEqual(shown, [14.2, 25, 20, 8.3, 6]);
    assert.equal(Math.round(shown.reduce((a, b) => a + b, 0) * 10) / 10, scored.priorityScore);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('(a) Urgency — HLD §7.2a', () => {
  const at = (effectiveDays) =>
    Math.round(urgency(task({ dueAt: iso(NOW + days(effectiveDays)) }), NOW) * 10) / 10;

  test('reproduces the published decay table', () => {
    assert.equal(at(0), 100);
    assert.equal(at(1), 77.9);
    assert.equal(at(2), 60.7);
    assert.equal(at(3), 47.2);
    assert.equal(at(5), 28.7);
    assert.equal(at(7), 17.4);
    assert.equal(at(14), 3);
    assert.equal(at(21), 0.5);
  });

  test('prepDays shifts the effective deadline earlier', () => {
    const test5DaysWith3PrepDays = urgency(
      task({ type: 'test', dueAt: iso(NOW + days(5)), prepDays: 3 }), NOW,
    );
    const anything2DaysAway = urgency(task({ dueAt: iso(NOW + days(2)) }), NOW);
    assert.equal(test5DaysWith3PrepDays, anything2DaysAway);
  });

  test('overdue is pinned to 100', () => {
    assert.equal(urgency(task({ dueAt: iso(NOW - hours(1)) }), NOW), 100);
    assert.equal(urgency(task({ status: 'overdue', dueAt: iso(NOW - days(4)) }), NOW), 100);
  });

  test('prepDays never pushes urgency above 100', () => {
    assert.equal(urgency(task({ dueAt: iso(NOW + days(2)), prepDays: 10 }), NOW), 100);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('(b) Stakes — HLD §7.2b', () => {
  test('scales at 2.5× and saturates at a 40% component', () => {
    assert.equal(stakes(task({ gradeWeight: 5 })).value, 12.5);
    assert.equal(stakes(task({ gradeWeight: 40 })).value, 100);
    assert.equal(stakes(task({ gradeWeight: 60 })).value, 100);
  });

  test('UC-009 Alt A — a missing weight is neutral 50 plus a dataGap', () => {
    const result = stakes(task({ gradeWeight: undefined }));
    assert.equal(result.value, 50);
    assert.equal(result.dataGap, 'gradeWeight');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('(c) Effort Pressure — HLD §7.2c', () => {
  // 2 h/day Mon–Wed → exactly 6 available hours in the 3-day window.
  const prefs = {
    tz: 'Asia/Singapore',
    availability: { mon: 2, tue: 2, wed: 2, thu: 0, fri: 0, sat: 0, sun: 0 },
    blockedDates: [],
  };

  test('ratio exactly 1.0 scores 70 and is not yet tight', () => {
    const result = effortPressure(task({ effortHours: 6 }), prefs, NOW);
    assert.equal(result.ratio, 1);
    assert.equal(result.value, 70);
    assert.equal(result.tight, false);
  });

  test('above 1.0 is tight, and the multiplier leaves headroom above it', () => {
    const stretched = effortPressure(task({ effortHours: 8.4 }), prefs, NOW); // ratio 1.4
    assert.equal(stretched.tight, true);
    assert.equal(Math.round(stretched.value * 10) / 10, 98);
    assert.ok(stretched.value > 70);
  });

  test('recorded progress reduces the remaining work', () => {
    const result = effortPressure(task({ effortHours: 12, progressPct: 15 }), prefs, NOW);
    assert.equal(Math.round(result.remainingHours * 10) / 10, 10.2);
    assert.equal(result.value, 100);
    assert.equal(result.tight, true);
  });

  test('a finished task exerts no pressure', () => {
    const result = effortPressure(task({ effortHours: 12, progressPct: 100 }), prefs, NOW);
    assert.equal(result.value, 0);
    assert.equal(result.tight, false);
  });

  test('UC-009 Alt B — no availability floors at 0.5 h and reads as impossible', () => {
    const noTime = { tz: 'Asia/Singapore', availability: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 } };
    const result = effortPressure(task({ effortHours: 4 }), noTime, NOW);
    assert.equal(result.availableHours, 0);
    assert.equal(result.ratio, 8); // 4 / 0.5
    assert.equal(result.value, 100);
    assert.equal(result.tight, true);
  });

  test('UC-009 Alt A — a missing estimate is neutral 50 and never claims "impossible"', () => {
    const result = effortPressure(task({ effortHours: undefined }), prefs, NOW);
    assert.equal(result.value, 50);
    assert.equal(result.tight, false);
    assert.equal(result.dataGap, 'effortHours');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('(d) Progress Deficit — HLD §7.2d', () => {
  test('70% of the window elapsed with 15% done scores 55', () => {
    const behind = task({
      createdAt: iso(NOW - days(7)),
      dueAt: iso(NOW + days(3)),
      progressPct: 15,
    });
    assert.equal(progressDeficit(behind, NOW), 55);
  });

  test('being ahead of pace scores 0, never a negative', () => {
    const ahead = task({
      createdAt: iso(NOW - days(7)),
      dueAt: iso(NOW + days(3)),
      progressPct: 90,
    });
    assert.equal(progressDeficit(ahead, NOW), 0);
  });

  test('an overdue task cannot exceed 100', () => {
    const late = task({
      createdAt: iso(NOW - days(20)),
      dueAt: iso(NOW - days(5)),
      progressPct: 0,
    });
    assert.equal(progressDeficit(late, NOW), 100);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('(e) Clash Penalty — HLD §7.2e', () => {
  const subject = task({ taskId: 'subject', dueAt: iso(NOW + days(5)) });

  test('30 points per other deadline inside ±72 h', () => {
    const peers = [
      subject,
      task({ taskId: 'p1', dueAt: iso(NOW + days(4)) }),
      task({ taskId: 'p2', dueAt: iso(NOW + days(7)) }),
    ];
    assert.equal(clashPenalty(subject, peers), 60);
  });

  test('the boundary is inclusive at exactly 72 h, exclusive beyond', () => {
    const justInside = task({ taskId: 'p1', dueAt: iso(NOW + days(5) + hours(72)) });
    const justOutside = task({ taskId: 'p2', dueAt: iso(NOW + days(5) + hours(72) + 1000) });
    assert.equal(clashPenalty(subject, [subject, justInside]), 30);
    assert.equal(clashPenalty(subject, [subject, justOutside]), 0);
  });

  test('saturates at four clashes', () => {
    const peers = [subject, ...Array.from({ length: 6 }, (_, i) =>
      task({ taskId: `p${i}`, dueAt: iso(NOW + days(5) + hours(i)) }))];
    assert.equal(clashPenalty(subject, peers), 100);
  });

  test('never counts itself, and ignores tasks that are no longer live', () => {
    assert.equal(clashPenalty(subject, [subject]), 0);
    const done = [
      subject,
      task({ taskId: 'p1', status: 'completed', dueAt: iso(NOW + days(5)) }),
      task({ taskId: 'p2', status: 'overdue', dueAt: iso(NOW + days(5)) }),
    ];
    assert.equal(clashPenalty(subject, done), 0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Availability model — UC-004 feeding UC-009', () => {
  test('a full week sums the per-weekday hours', () => {
    // Mon 00:00 SGT → the following Mon 00:00 SGT, defaults 3×5 + 5×2.
    assert.equal(availableHoursBetween(NOW, NOW + days(7), { tz: 'Asia/Singapore' }), 25);
  });

  test('blocked dates contribute zero', () => {
    const prefs = { tz: 'Asia/Singapore', blockedDates: ['2026-08-18'] }; // Tuesday
    assert.equal(availableHoursBetween(NOW, NOW + days(7), prefs), 22);
  });

  test('partial days are pro-rated, so capacity decays smoothly', () => {
    const noonMonday = NOW + hours(12);
    assert.equal(availableHoursBetween(noonMonday, NOW + days(1), { tz: 'Asia/Singapore' }), 1.5);
  });

  test('day boundaries follow the student timezone, not UTC', () => {
    // 23:00 Sunday SGT → 01:00 Monday SGT: one hour of a 5 h day plus one hour
    // of a 3 h day. In UTC this window sits entirely inside one calendar day.
    const total = availableHoursBetween(NOW - hours(1), NOW + hours(1), { tz: 'Asia/Singapore' });
    assert.equal(Math.round(total * 1000) / 1000, 0.333);
  });

  test('an empty or reversed window is zero, never negative', () => {
    assert.equal(availableHoursBetween(NOW, NOW, EVEN_PREFS), 0);
    assert.equal(availableHoursBetween(NOW + days(1), NOW, EVEN_PREFS), 0);
    assert.equal(availableHoursBetween(NOW, 'not-a-date', EVEN_PREFS), 0);
  });

  test('dailyAvailableHours answers for one local day (UC-014)', () => {
    assert.equal(dailyAvailableHours(NOW + hours(10), { tz: 'Asia/Singapore' }), 3); // Monday
    assert.equal(dailyAvailableHours(NOW + days(5), { tz: 'Asia/Singapore' }), 5); // Saturday
    assert.equal(
      dailyAvailableHours(NOW, { tz: 'Asia/Singapore', blockedDates: ['2026-08-17'] }),
      0,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Weights — UC-009 step 3 and E3', () => {
  test('defaults are used when PREFS carries none', () => {
    assert.deepEqual(normaliseWeights(undefined), DEFAULT_WEIGHTS);
  });

  test('E3 — weights that do not sum to 1.0 are normalised and logged', () => {
    const { result, lines } = captureWarnings(() =>
      normaliseWeights({
        urgency: 3, stakes: 2.5, effortPressure: 2, progressDeficit: 1.5, clashPenalty: 1,
      }));
    assert.deepEqual(result, DEFAULT_WEIGHTS);
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).event, 'weights_normalised');
  });

  test('E3 — unusable weights fall back to the defaults, still logged', () => {
    const { result, lines } = captureWarnings(() =>
      normaliseWeights({ urgency: 0, stakes: -1, effortPressure: NaN }));
    assert.deepEqual(result, DEFAULT_WEIGHTS);
    assert.equal(JSON.parse(lines[0]).event, 'weights_invalid');
  });

  test('a proportionally identical weight set produces an identical ranking', () => {
    const tasks = [
      task({ taskId: 'a', gradeWeight: 40, dueAt: iso(NOW + days(2)) }),
      task({ taskId: 'b', gradeWeight: 10, dueAt: iso(NOW + days(6)) }),
      task({ taskId: 'c', gradeWeight: 25, dueAt: iso(NOW + days(4)) }),
    ];
    const withDefaults = score(tasks, EVEN_PREFS, NOW);
    const { result: withScaled } = captureWarnings(() => score(tasks, {
      ...EVEN_PREFS,
      weights: {
        urgency: 30, stakes: 25, effortPressure: 20, progressDeficit: 15, clashPenalty: 10,
      },
    }, NOW));
    assert.deepEqual(
      withScaled.map((t) => [t.taskId, t.priorityScore]),
      withDefaults.map((t) => [t.taskId, t.priorityScore]),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Ranking, ordering and tie-breaks — HLD §7.3', () => {
  test('the prep-days case that a nearest-deadline sort gets wrong', () => {
    const exam = task({
      taskId: 'exam', type: 'test', gradeWeight: 25, effortHours: 6,
      prepDays: 3, dueAt: iso(NOW + days(5)),
    });
    const essay = task({
      taskId: 'essay', type: 'assignment', gradeWeight: 10, effortHours: 8,
      prepDays: 0, dueAt: iso(NOW + days(3)),
    });

    const ranked = score([exam, essay], EVEN_PREFS, NOW);
    assert.equal(ranked[0].taskId, 'exam');

    // The contrast the demo depends on: by deadline alone the essay comes first.
    const byDeadline = [exam, essay].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    assert.equal(byDeadline[0].taskId, 'essay');
  });

  test('compareTasks applies all four levels in order', () => {
    const base = { priorityScore: 50, dueAt: iso(NOW + days(1)), gradeWeight: 20, taskId: 'b' };
    assert.ok(compareTasks({ ...base, priorityScore: 60 }, base) < 0);
    assert.ok(compareTasks({ ...base, dueAt: iso(NOW) }, base) < 0);
    assert.ok(compareTasks({ ...base, gradeWeight: 30 }, base) < 0);
    assert.ok(compareTasks({ ...base, taskId: 'a' }, base) < 0);
    assert.equal(compareTasks(base, { ...base }), 0);
  });

  test('two indistinguishable tasks come back in a stable taskId order', () => {
    const twins = [
      task({ taskId: 'zeta' }),
      task({ taskId: 'alpha' }),
    ];
    const ranked = score(twins, EVEN_PREFS, NOW);
    assert.equal(ranked[0].priorityScore, ranked[1].priorityScore);
    assert.deepEqual(ranked.map((t) => t.taskId), ['alpha', 'zeta']);
  });

  test('completed, archived and deleted tasks are ranked nowhere and clash with nothing', () => {
    const live = task({ taskId: 'live', dueAt: iso(NOW + days(3)) });
    const tasks = [
      live,
      task({ taskId: 'done', status: 'completed', dueAt: iso(NOW + days(3)) }),
      task({ taskId: 'gone', status: 'deleted', dueAt: iso(NOW + days(3)) }),
      task({ taskId: 'old', status: 'archived', dueAt: iso(NOW + days(3)) }),
    ];
    const ranked = score(tasks, EVEN_PREFS, NOW);
    assert.equal(ranked[0].taskId, 'live');
    assert.equal(ranked[0].subScores.clashPenalty, 0);
    for (const t of ranked.slice(1)) {
      assert.equal(t.priorityScore, null);
      assert.equal(t.subScores, undefined);
    }
  });

  test('an overdue task outranks everything on Urgency alone', () => {
    const ranked = score([
      task({ taskId: 'fresh', gradeWeight: 40, dueAt: iso(NOW + days(2)) }),
      task({ taskId: 'late', status: 'overdue', gradeWeight: 10, dueAt: iso(NOW - days(1)) }),
    ], EVEN_PREFS, NOW);
    assert.equal(byId(ranked).late.subScores.urgency, 100);
    assert.equal(ranked[0].taskId, 'late');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Degradation — UC-009 Alt A, Alt B, E1, E2', () => {
  test('Alt A — a task with neither weight nor estimate still ranks, and says why', () => {
    const sparse = task({ taskId: 'sparse', gradeWeight: undefined, effortHours: undefined });
    const ranked = score([sparse], EVEN_PREFS, NOW);
    assert.equal(ranked[0].subScores.stakes, 50);
    assert.equal(ranked[0].subScores.effortPressure, 50);
    assert.deepEqual(ranked[0].dataGap, ['gradeWeight', 'effortHours']);
    assert.equal(ranked[0].tight, false);
    assert.ok(Number.isFinite(ranked[0].priorityScore));
  });

  test('Alt B — a student with no availability sees the work flagged impossible', () => {
    const noTime = {
      ...EVEN_PREFS,
      availability: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
    };
    const ranked = score([task({ taskId: 'blocked' })], noTime, NOW);
    assert.equal(ranked[0].subScores.effortPressure, 100);
    assert.equal(ranked[0].tight, true);
  });

  test('E1 — a malformed dueAt is pinned to the top, never silently dropped', () => {
    const tasks = [
      task({ taskId: 'ok' }),
      task({ taskId: 'broken', dueAt: 'sometime next week' }),
      task({ taskId: 'missing', dueAt: undefined }),
    ];
    const ranked = score(tasks, EVEN_PREFS, NOW);

    assert.equal(ranked.length, 3);
    assert.deepEqual(ranked.slice(0, 2).map((t) => t.taskId).sort(), ['broken', 'missing']);
    for (const t of ranked.slice(0, 2)) {
      assert.equal(t.unscoreable, true);
      assert.equal(t.priorityScore, null);
      assert.deepEqual(t.dataGap, ['dueAt']);
    }
    // And they must not disturb the tasks that are fine.
    assert.equal(byId(ranked).ok.subScores.clashPenalty, 0);
  });

  test('E2 — a very large set scores the nearest 100 and defers the rest', () => {
    const many = Array.from({ length: 120 }, (_, i) => task({
      taskId: `t-${String(i).padStart(3, '0')}`,
      dueAt: iso(NOW + days(1) + hours(i * 6)),
    }));
    const ranked = score(many, EVEN_PREFS, NOW);

    const scored = ranked.filter((t) => t.priorityScore !== null);
    const deferred = ranked.filter((t) => t.scorePending === true);
    assert.equal(scored.length, 100);
    assert.equal(deferred.length, 20);
    // The deferred ones are the furthest out — nothing that could plausibly rank.
    assert.deepEqual(
      deferred.map((t) => t.taskId).sort(),
      many.slice(100).map((t) => t.taskId).sort(),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Contracts the rest of the system depends on', () => {
  test('every scored task carries persisted sub-scores (UC-010, UC-015, UC-016)', () => {
    const ranked = score([task({ taskId: 'a' }), task({ taskId: 'b', dueAt: iso(NOW + days(9)) })],
      EVEN_PREFS, NOW);
    for (const t of ranked) {
      assert.deepEqual(Object.keys(t.subScores), [
        'urgency', 'stakes', 'effortPressure', 'progressDeficit', 'clashPenalty',
      ]);
      for (const value of Object.values(t.subScores)) {
        assert.ok(value >= 0 && value <= 100, `sub-score out of range: ${value}`);
      }
      assert.ok(t.priorityScore >= 0 && t.priorityScore <= 100);
    }
  });

  test('UC-015 — re-weighting persisted sub-scores client-side matches the server exactly', () => {
    const tasks = [
      task({ taskId: 'a', gradeWeight: 40, dueAt: iso(NOW + days(2)) }),
      task({ taskId: 'b', gradeWeight: 10, effortHours: 20, dueAt: iso(NOW + days(6)) }),
      task({ taskId: 'c', gradeWeight: 25, progressPct: 60, dueAt: iso(NOW + days(4)) }),
    ];
    const gradeFocused = {
      urgency: 0.20, stakes: 0.45, effortPressure: 0.15, progressDeficit: 0.10, clashPenalty: 0.10,
    };

    const persisted = score(tasks, EVEN_PREFS, NOW);
    const preview = persisted
      .map((t) => ({
        taskId: t.taskId,
        // Exactly what the slider panel does: sum the five rounded bars.
        priorityScore: Math.round(
          Object.entries(gradeFocused)
            .reduce((sum, [key, w]) => sum + Math.round(w * t.subScores[key] * 10) / 10, 0) * 10,
        ) / 10,
      }))
      .sort((a, b) => b.priorityScore - a.priorityScore);

    const serverSide = score(tasks, { ...EVEN_PREFS, weights: gradeFocused }, NOW);
    assert.deepEqual(
      preview,
      serverSide.map((t) => ({ taskId: t.taskId, priorityScore: t.priorityScore })),
    );
  });

  test('UC-009 step 4 — a move over 5 points marks the explanation stale', () => {
    const shifted = task({ taskId: 'a', priorityScore: 10, explanationStale: false });
    assert.equal(score([shifted], EVEN_PREFS, NOW)[0].explanationStale, true);

    const settled = score([shifted], EVEN_PREFS, NOW)[0];
    const rerun = score([{ ...settled, explanationStale: false }], EVEN_PREFS, NOW)[0];
    assert.equal(rerun.explanationStale, false);
  });

  test('a stale flag already set is never cleared by scoring', () => {
    const stale = score([task({ priorityScore: null })], EVEN_PREFS, NOW)[0];
    const rerun = score([stale], EVEN_PREFS, NOW)[0];
    assert.equal(rerun.explanationStale, true);
  });

  test('an invalid `now` fails loudly rather than ranking against a wrong clock', () => {
    assert.throws(() => score([task({})], EVEN_PREFS, 'today'), TypeError);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('Determinism — the property the whole thesis rests on', () => {
  const tasks = [
    task({ taskId: 'a', gradeWeight: 40, dueAt: iso(NOW + days(2)) }),
    task({ taskId: 'b', gradeWeight: 10, dueAt: iso(NOW + days(6)), progressPct: 30 }),
    task({ taskId: 'c', gradeWeight: 25, dueAt: iso(NOW + days(4)), prepDays: 2 }),
    task({ taskId: 'd', dueAt: 'broken' }),
  ];

  test('identical inputs produce byte-identical output', () => {
    assert.equal(
      JSON.stringify(score(tasks, EVEN_PREFS, NOW)),
      JSON.stringify(score(tasks, EVEN_PREFS, NOW)),
    );
  });

  test('the input array and its tasks are never mutated', () => {
    const before = JSON.stringify(tasks);
    score(tasks, EVEN_PREFS, NOW);
    assert.equal(JSON.stringify(tasks), before);
  });

  test('nothing in the engine reads the wall clock', () => {
    const realNow = Date.now;
    Date.now = () => { throw new Error('the scoring engine must not read the clock'); };
    try {
      assert.equal(score(tasks, EVEN_PREFS, NOW).length, 4);
    } finally {
      Date.now = realNow;
    }
  });

  test('the engine has no dependencies — no AWS SDK, no network, no model', () => {
    const dir = path.join(__dirname, '..', 'lib', 'scoring');
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      const requires = [...source.matchAll(/require\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const dep of requires) {
        assert.ok(dep.startsWith('.'), `${file} requires "${dep}" — the engine must stay pure`);
      }
      for (const forbidden of ['aws-sdk', 'fetch(', 'Date.now(', 'Math.random(']) {
        assert.ok(!source.includes(forbidden), `${file} contains "${forbidden}"`);
      }
    }
  });
});
