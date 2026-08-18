'use strict';

/**
 * UC-019/UC-021/UC-022/UC-023 — the parts of Zoe's track where correctness is
 * not obvious by reading: the notification budget, the quiet-hours window, the
 * overdue transitions, the estimation-accuracy exclusions, and .ics escaping.
 *
 * The delivery layer itself is not tested here — it is one branch on an
 * environment variable, and the interesting behaviour is all in these pure
 * functions.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  candidates, applyBudget, inQuietHours, effectiveDigestAt, localMinutes,
} = require('../lib/notify/rules');
const {
  newlyOverdue, staleOverdue, resolutionPatch,
} = require('../lib/overdue/transition');
const { completedView, effortHint } = require('../lib/completed/stats');
const { buildIcs } = require('../lib/export/ics');

const days = (n) => n * 86400000;
const hours = (n) => n * 3600000;
const iso = (ms) => new Date(ms).toISOString();

// Tue 18 Aug 2026, 09:00 SGT.
const NOW = Date.parse('2026-08-18T01:00:00.000Z');

const PREFS = {
  tz: 'Asia/Singapore',
  availability: {
    mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 5, sun: 5,
  },
  digestAt: '08:00',
  quietHours: { start: '22:00', end: '07:00' },
  dailyCap: 3,
  channels: { email: true, inApp: true },
  escalationEnabled: true,
};

const task = (overrides) => ({
  taskId: 't1',
  title: 'IT2214 Report',
  module: 'IT2214',
  type: 'assignment',
  status: 'active',
  gradeWeight: 40,
  effortHours: 12,
  progressPct: 20,
  dueAt: iso(NOW + days(3)),
  createdAt: iso(NOW - days(4)),
  priorityScore: 70,
  subScores: {
    urgency: 60, stakes: 100, effortPressure: 100, progressDeficit: 30, clashPenalty: 0,
  },
  ...overrides,
});

describe('UC-019 — quiet hours and digest time, in the student’s timezone', () => {
  test('09:00 SGT is 540 minutes past local midnight, not the UTC hour', () => {
    assert.equal(localMinutes(NOW, 'Asia/Singapore'), 540);
  });

  test('23:00 SGT is inside the default quiet window, 09:00 SGT is not', () => {
    assert.equal(inQuietHours('2026-08-18T15:00:00Z', PREFS), true);
    assert.equal(inQuietHours(NOW, PREFS), false);
  });

  test('a digest scheduled inside quiet hours is deferred to the window’s end', () => {
    const deferred = effectiveDigestAt({ ...PREFS, digestAt: '23:30' });
    assert.equal(deferred.deferred, true);
    assert.equal(deferred.minutes, 7 * 60);

    assert.equal(effectiveDigestAt(PREFS).deferred, false);
  });
});

describe('UC-019 step 4 — which rules fire', () => {
  test('a task due in 20 hours below 90% gets a same-day nudge', () => {
    const list = candidates({
      ranked: [task({ dueAt: iso(NOW + hours(20)), progressPct: 60 })],
      prefs: PREFS,
      now: NOW,
    });
    assert.ok(list.some((message) => message.rule === 'same_day_nudge'));
  });

  test('the same task at 95% does not', () => {
    const list = candidates({
      ranked: [task({ dueAt: iso(NOW + hours(20)), progressPct: 95 })],
      prefs: PREFS,
      now: NOW,
    });
    assert.ok(!list.some((message) => message.rule === 'same_day_nudge'));
  });

  test('escalation needs BOTH a deficit above 40 and a deadline within 48 h', () => {
    const behind = task({
      dueAt: iso(NOW + hours(40)),
      subScores: { ...task().subScores, progressDeficit: 55 },
    });
    const behindButDistant = { ...behind, dueAt: iso(NOW + days(6)) };

    const fired = candidates({ ranked: [behind], prefs: PREFS, now: NOW });
    const quiet = candidates({ ranked: [behindButDistant], prefs: PREFS, now: NOW });

    assert.ok(fired.some((message) => message.rule === 'escalation'));
    assert.ok(!quiet.some((message) => message.rule === 'escalation'));
  });

  test('escalation respects the student turning it off (UC-020 step 4)', () => {
    const behind = task({
      dueAt: iso(NOW + hours(40)),
      subScores: { ...task().subScores, progressDeficit: 55 },
    });
    const list = candidates({
      ranked: [behind], prefs: { ...PREFS, escalationEnabled: false }, now: NOW,
    });
    assert.ok(!list.some((message) => message.rule === 'escalation'));
  });

  test('a test fires its lead reminder 7 days out; an assignment does not', () => {
    const sevenDays = iso(NOW + days(7) - hours(2));
    const exam = task({ type: 'test', dueAt: sevenDays });
    const essay = task({ type: 'assignment', dueAt: sevenDays });

    const fired = candidates({ ranked: [exam], prefs: PREFS, now: NOW })
      .filter((message) => message.rule === 'lead_time');
    const quiet = candidates({ ranked: [essay], prefs: PREFS, now: NOW })
      .filter((message) => message.rule === 'lead_time');

    assert.equal(fired.length, 1);
    assert.match(fired[0].body, /7-day lead/);
    assert.equal(quiet.length, 0);
  });

  test('the lead reminder fires once, on the crossing — not every day after', () => {
    const inside = task({ type: 'test', dueAt: iso(NOW + days(5)) }); // already past the boundary
    const list = candidates({ ranked: [inside], prefs: PREFS, now: NOW });
    assert.ok(!list.some((message) => message.rule === 'lead_time'));
  });

  test('the student’s own lead time is what counts, not the default', () => {
    const essay = task({ type: 'assignment', dueAt: iso(NOW + days(10) - hours(2)) });
    const list = candidates({
      ranked: [essay],
      prefs: { ...PREFS, leadTimes: { assignment: 10 } },
      now: NOW,
    });
    assert.ok(list.some((message) => message.rule === 'lead_time'));
  });

  test('a lead reminder never outranks an urgent one under the cap', () => {
    const due = task({ taskId: 'due', dueAt: iso(NOW + hours(20)), progressPct: 30 });
    const exam = task({ taskId: 'exam', type: 'test', dueAt: iso(NOW + days(7) - hours(2)) });

    const list = candidates({ ranked: [due, exam], prefs: PREFS, now: NOW });
    const budget = applyBudget(list, 2, PREFS, NOW); // one slot left
    assert.equal(budget.send.length, 1);
    assert.notEqual(budget.send[0].rule, 'lead_time');
  });

  test('two overdue tasks are one grouped card, not two alerts (UC-021 Alt A)', () => {
    const overdue = [
      task({ taskId: 'a', status: 'overdue', dueAt: iso(NOW - days(2)) }),
      task({ taskId: 'b', status: 'overdue', dueAt: iso(NOW - days(1)) }),
    ];
    const list = candidates({ ranked: overdue, prefs: PREFS, now: NOW });
    assert.equal(list.filter((message) => message.rule === 'overdue_group').length, 1);
  });
});

describe('UC-019 steps 5–6 — the notification budget', () => {
  const four = ['digest', 'same_day_nudge', 'escalation', 'crash_week']
    .map((rule) => ({ rule, subject: rule, body: rule }));

  test('the cap is hard: three out, the rest absorbed, none dropped', () => {
    const budget = applyBudget(four, 0, PREFS, NOW);
    assert.equal(budget.send.length, 3);
    assert.equal(budget.absorb.length, 1);
    assert.equal(budget.send.length + budget.absorb.length, four.length);
  });

  test('notifications already sent today count against the same cap', () => {
    const budget = applyBudget(four, 2, PREFS, NOW);
    assert.equal(budget.send.length, 1);
    assert.equal(budget.absorb.length, 3);
  });

  test('inside quiet hours nothing is sent and nothing is absorbed — it is held', () => {
    const budget = applyBudget(four, 0, PREFS, '2026-08-18T15:00:00Z');
    assert.equal(budget.send.length, 0);
    assert.equal(budget.absorb.length, 0);
    assert.equal(budget.held.length, four.length);
  });

  test('a student who set the cap to 1 gets one', () => {
    assert.equal(applyBudget(four, 0, { ...PREFS, dailyCap: 1 }, NOW).send.length, 1);
  });
});

describe('UC-021 — overdue transitions', () => {
  test('a passed deadline with unfinished work goes overdue; a finished one does not', () => {
    const missed = task({ dueAt: iso(NOW - hours(1)), progressPct: 40 });
    const done = task({ taskId: 't2', dueAt: iso(NOW - hours(1)), progressPct: 100 });
    const future = task({ taskId: 't3', dueAt: iso(NOW + hours(1)) });

    const flagged = newlyOverdue([missed, done, future], NOW).map((t) => t.taskId);
    assert.deepEqual(flagged, ['t1']);
  });

  test('overdue for more than 30 days is auto-archived (Alt B)', () => {
    const abandoned = task({ status: 'overdue', overdueSince: iso(NOW - days(31)) });
    const recent = task({ taskId: 't2', status: 'overdue', overdueSince: iso(NOW - days(2)) });
    assert.deepEqual(staleOverdue([abandoned, recent], NOW).map((t) => t.taskId), ['t1']);
  });

  test('marking complete records a LATE submission, feeding UC-022', () => {
    const patch = resolutionPatch(task({ status: 'overdue' }), 'complete', iso(NOW));
    assert.equal(patch.status, 'completed');
    assert.equal(patch.lateSubmission, true);
    assert.equal(patch.progressPct, 100);
  });

  test('a reschedule into the past is refused (E1); into the future it rewrites GSI1SK', () => {
    const overdue = task({ status: 'overdue' });
    assert.equal(resolutionPatch(overdue, 'reschedule', iso(NOW), iso(NOW - days(1))), null);

    const future = iso(NOW + days(5));
    const patch = resolutionPatch(overdue, 'reschedule', iso(NOW), future);
    assert.equal(patch.status, 'active');
    assert.equal(patch.GSI1SK, `DUE#${future}`);
    assert.equal(patch.overdueSince, null);
  });

  test('every resolution appends to history', () => {
    const withHistory = task({ status: 'overdue', history: [{ action: 'went_overdue', at: iso(NOW) }] });
    const patch = resolutionPatch(withHistory, 'archive', iso(NOW));
    assert.equal(patch.history.length, 2);
    assert.equal(patch.history[1].action, 'archived');
  });
});

describe('UC-022 — estimation accuracy', () => {
  const completed = (overrides) => task({
    status: 'completed',
    completedAt: iso(NOW - days(1)),
    ...overrides,
  });

  test('fewer than three usable samples returns null, not a figure (Alt A)', () => {
    const view = completedView([
      completed({ taskId: 'a', effortHours: 8, hoursSpent: 10 }),
      completed({ taskId: 'b', effortHours: 4, hoursSpent: 5 }),
    ], PREFS, NOW);
    assert.equal(view.stats.estimationAccuracy, null);
    assert.equal(view.stats.sampleSize, 2);
  });

  test('hoursSpent = 0 is excluded rather than dragging the mean down (E1)', () => {
    const view = completedView([
      completed({ taskId: 'a', effortHours: 8, hoursSpent: 10 }),
      completed({ taskId: 'b', effortHours: 4, hoursSpent: 5 }),
      completed({ taskId: 'c', effortHours: 10, hoursSpent: 13 }),
      completed({ taskId: 'd', effortHours: 4, hoursSpent: 0 }),
    ], PREFS, NOW);
    assert.equal(view.stats.sampleSize, 3);
    // (10/8 + 5/4 + 13/10) / 3 — the zero-hours task is simply not in it.
    assert.equal(view.stats.estimationAccuracy, 1.27);
  });

  test('a ratio above 5× is an outlier, excluded and flagged (E2)', () => {
    const view = completedView([
      completed({ taskId: 'a', effortHours: 8, hoursSpent: 10 }),
      completed({ taskId: 'b', effortHours: 4, hoursSpent: 5 }),
      completed({ taskId: 'c', effortHours: 10, hoursSpent: 13 }),
      completed({ taskId: 'd', effortHours: 2, hoursSpent: 18 }),
    ], PREFS, NOW);
    assert.equal(view.stats.sampleSize, 3);
    assert.equal(view.stats.outliers.length, 1);
    assert.equal(view.stats.outliers[0].taskId, 'd');
  });

  test('a late submission counts against the on-time rate', () => {
    const view = completedView([
      completed({ taskId: 'a', dueAt: iso(NOW), completedAt: iso(NOW - days(1)) }),
      completed({ taskId: 'b', lateSubmission: true }),
    ], PREFS, NOW);
    assert.equal(view.stats.onTimeRate, 0.5);
  });

  test('the hint quotes the ratio the student can check (step 4)', () => {
    const hint = effortHint({ estimationAccuracy: 1.3 }, 8);
    assert.equal(hint.suggestedHours, 10);
    assert.match(hint.message, /1\.3× your estimate/);
    // Within 10% of accurate, there is nothing worth saying.
    assert.equal(effortHint({ estimationAccuracy: 1.05 }, 8), null);
  });
});

describe('UC-023 — .ics generation', () => {
  const calendar = () => buildIcs(
    [task({ notes: 'Two lines;\nsecond' })],
    [{ taskId: 't1', milestoneId: 'm1', name: 'Outline', dueAt: iso(NOW + days(1)), hours: 3 }],
    { leadTimes: { assignment: 3 }, now: NOW },
  );

  // Folding inserts "\r\n " mid-value, so content assertions read the unfolded
  // document — which is what an importer sees.
  const unfold = (text) => text.replace(/\r\n /g, '');

  test('semicolons and newlines are escaped, not emitted raw (RFC 5545 §3.3.11)', () => {
    const text = unfold(calendar());
    assert.ok(text.includes('Two lines\\;\\nsecond'));
    assert.ok(!/DESCRIPTION:[^\r\n]*[^\\];/.test(text));
  });

  test('the alarm is the student’s own lead time for that task type', () => {
    assert.ok(calendar().includes('TRIGGER:-P3D'));
  });

  test('milestones appear only when asked for, and every event closes', () => {
    const text = calendar();
    assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 2);
    assert.equal((text.match(/END:VEVENT/g) || []).length, 2);
    assert.ok(text.startsWith('BEGIN:VCALENDAR'));
    assert.ok(text.trimEnd().endsWith('END:VCALENDAR'));

    const withoutMilestones = buildIcs([task()], [], { now: NOW });
    assert.equal((withoutMilestones.match(/BEGIN:VEVENT/g) || []).length, 1);
  });

  test('lines are folded at 75 octets so strict importers accept the file', () => {
    const long = buildIcs([task({ title: 'A'.repeat(200) })], [], { now: NOW });
    for (const line of long.split('\r\n')) assert.ok(line.length <= 75, line.slice(0, 40));
  });
});
