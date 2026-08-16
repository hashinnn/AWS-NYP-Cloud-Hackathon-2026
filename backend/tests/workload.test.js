'use strict';

/**
 * UC-013 crash weeks + UC-018 heatmap data.
 * The acceptance criterion that matters: Apply measurably lowers the ratio.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { buildWeeks, localWeekStart } = require('../lib/workload/weeks');
const { crashWeeks, recommendForWeek, isDismissed } = require('../lib/workload/recommend');
const { applyRecommendation } = require('../lib/workload/apply');
const { toMs } = require('../lib/scoring/availability');

const NOW = Date.parse('2026-08-16T16:00:00.000Z'); // Mon 17 Aug, 00:00 SGT
const days = (n) => n * 86400000;
const iso = (ms) => new Date(ms).toISOString();

// 3 h on weekdays, nothing at weekends → 15 h in a full week.
const PREFS = {
  tz: 'Asia/Singapore',
  availability: { mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 0, sun: 0 },
  blockedDates: [],
};

const task = (overrides) => ({
  taskId: 'task-1',
  title: 'IT2214 Report',
  module: 'IT2214',
  status: 'active',
  gradeWeight: 40,
  effortHours: 12,
  progressPct: 0,
  dueAt: iso(NOW + days(9)), // Wed 26 Aug — week 1
  ...overrides,
});

const weekOf = (weeks, index) => weeks[index];

describe('Weekly buckets — UC-013 steps 1–3', () => {
  const weeks = buildWeeks([task({})], [], PREFS, NOW);

  test('twelve weeks, starting with the Monday of the current week', () => {
    assert.equal(weeks.length, 12);
    assert.equal(weeks[0].weekStart, iso(localWeekStart(NOW, PREFS.tz)));
    assert.equal(weeks[0].label, '17 Aug');
    assert.equal(weeks[1].label, '24 Aug');
  });

  test('availability is 15 hours a week, and the current week starts from now', () => {
    assert.equal(weeks[0].availableHours, 15);
    assert.equal(weeks[1].availableHours, 15);
  });

  test('a task with no milestones loads its deadline week', () => {
    assert.equal(weekOf(weeks, 0).requiredHours, 0);
    assert.equal(weekOf(weeks, 1).requiredHours, 12);
    assert.equal(weekOf(weeks, 1).loadRatio, 0.8);
    assert.equal(weekOf(weeks, 1).crash, false);
  });

  test('progress already made reduces the load', () => {
    const partial = buildWeeks([task({ progressPct: 50 })], [], PREFS, NOW);
    assert.equal(partial[1].requiredHours, 6);
  });

  test('a task WITH milestones loads through them, and is not double counted', () => {
    const milestones = [
      { taskId: 'task-1', milestoneId: 'm1', name: 'Draft', hours: 5, dueAt: iso(NOW + days(3)) },
      { taskId: 'task-1', milestoneId: 'm2', name: 'Final', hours: 7, dueAt: iso(NOW + days(8)) },
    ];
    const spread = buildWeeks([task({})], milestones, PREFS, NOW);
    assert.equal(spread[0].requiredHours, 5);
    assert.equal(spread[1].requiredHours, 7);
    assert.equal(spread[0].requiredHours + spread[1].requiredHours, 12);
  });

  test('completed milestones and non-active tasks do not consume capacity', () => {
    const done = [{ taskId: 'task-1', milestoneId: 'm1', hours: 5, dueAt: iso(NOW + days(3)), completedAt: iso(NOW) }];
    assert.equal(buildWeeks([task({})], done, PREFS, NOW)[0].requiredHours, 0);
    assert.equal(buildWeeks([task({ status: 'overdue' })], [], PREFS, NOW)[1].requiredHours, 0);
    assert.equal(buildWeeks([task({ status: 'completed' })], [], PREFS, NOW)[1].requiredHours, 0);
  });

  test('E1 — a fully blocked week has no ratio, not a zero', () => {
    const blocked = {
      ...PREFS,
      blockedDates: ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'],
    };
    const week = buildWeeks([task({})], [], blocked, NOW)[1];
    assert.equal(week.availableHours, 0);
    assert.equal(week.loadRatio, null);
    assert.equal(week.unavailable, true);
    assert.equal(week.crash, true); // work with nowhere to put it is still a problem
  });
});

describe('Crash detection and the recommendation search — UC-013 step 4', () => {
  const pileUp = [
    task({ taskId: 'a', title: 'IT2214 Report', effortHours: 12 }),
    task({ taskId: 'b', title: 'IT2212 Essay', gradeWeight: 10, effortHours: 9, dueAt: iso(NOW + days(10)) }),
  ];

  test('a week over capacity is flagged with its overload in hours', () => {
    const weeks = buildWeeks(pileUp, [], PREFS, NOW);
    assert.equal(weeks[1].requiredHours, 21);
    assert.equal(weeks[1].crash, true);
    assert.equal(weeks[1].overloadHours, 6);
  });

  test('the recommendation names a task, a number of days and a number of hours', () => {
    const weeks = buildWeeks(pileUp, [], PREFS, NOW);
    const found = crashWeeks(weeks, pileUp, PREFS, {}, NOW);

    assert.equal(found.length, 1);
    const { recommendation } = found[0];
    assert.equal(recommendation.kind, 'move');
    assert.equal(recommendation.taskId, 'a'); // the largest remaining hours
    assert.equal(recommendation.hoursToMove, 6);
    assert.equal(recommendation.moves[0].label, '17 Aug');
    assert.match(recommendation.text,
      /^Start IT2214 Report \d+ days earlier and move 6 hours into the week of 17 Aug, which has 15 spare hours\.$/);
  });

  test('Alt B — one task bigger than the whole week is told to break down', () => {
    const oversized = [task({ effortHours: 20 })];
    const weeks = buildWeeks(oversized, [], PREFS, NOW);
    const [{ recommendation }] = crashWeeks(weeks, oversized, PREFS, {}, NOW);

    assert.equal(recommendation.kind, 'break_down');
    assert.match(recommendation.text, /Break it into milestones/);
  });

  test('Alt A — with no earlier capacity it says so, and names what to cut', () => {
    const packed = [
      task({ taskId: 'now', title: 'Lab sheet', gradeWeight: 5, effortHours: 15, dueAt: iso(NOW + days(4)) }),
      task({ taskId: 'a', effortHours: 12 }),
      task({ taskId: 'b', title: 'IT2212 Essay', gradeWeight: 10, effortHours: 9, dueAt: iso(NOW + days(10)) }),
    ];
    const weeks = buildWeeks(packed, [], PREFS, NOW);
    const found = crashWeeks(weeks, packed, PREFS, {}, NOW);
    const second = found.find((entry) => entry.label === '24 Aug');

    assert.equal(second.recommendation.kind, 'no_capacity');
    assert.match(second.recommendation.text, /no spare capacity/i);
    assert.match(second.recommendation.text, /IT2212 Essay \(10%\)/);
  });

  test('E2 — a week whose task cannot be resolved is suppressed, not guessed at', () => {
    const weeks = buildWeeks(pileUp, [], PREFS, NOW);
    assert.deepEqual(crashWeeks(weeks, [], PREFS, {}, NOW), []);
    assert.equal(recommendForWeek(weeks, 0, new Map(), PREFS), null); // not a crash week
  });

  test('step 7 — a dismissed week stays quiet for 48 hours, then returns', () => {
    const weeks = buildWeeks(pileUp, [], PREFS, NOW);
    const justNow = { [weeks[1].weekStart]: iso(NOW - days(1)) };
    const longAgo = { [weeks[1].weekStart]: iso(NOW - days(3)) };

    assert.equal(isDismissed(weeks[1].weekStart, justNow, NOW), true);
    assert.equal(crashWeeks(weeks, pileUp, PREFS, justNow, NOW).length, 0);
    assert.equal(crashWeeks(weeks, pileUp, PREFS, longAgo, NOW).length, 1);
  });
});

describe('Apply — UC-013 step 6, the assertion the demo rests on', () => {
  const subject = task({ taskId: 'a', effortHours: 12 });
  const other = task({ taskId: 'b', title: 'IT2212 Essay', effortHours: 9, dueAt: iso(NOW + days(10)) });
  const milestones = [
    { taskId: 'a', milestoneId: 'm1', name: 'Draft', hours: 6, dueAt: iso(NOW + days(8)), completedAt: null },
    { taskId: 'a', milestoneId: 'm2', name: 'Final', hours: 6, dueAt: iso(NOW + days(9)), completedAt: null },
  ];

  test('applying a move measurably lowers the crash week s load ratio', () => {
    const tasks = [subject, other];
    const before = buildWeeks(tasks, milestones, PREFS, NOW);
    assert.equal(before[1].crash, true);

    const recommendation = recommendForWeek(before, 1, new Map(tasks.map((t) => [t.taskId, t])), PREFS);
    const result = applyRecommendation(recommendation, subject, milestones, PREFS, NOW);
    assert.ok(result);

    const after = buildWeeks(tasks, result.milestones, PREFS, NOW);
    assert.ok(after[1].loadRatio < before[1].loadRatio,
      `ratio did not drop: ${before[1].loadRatio} → ${after[1].loadRatio}`);
    assert.ok(after[1].requiredHours < before[1].requiredHours);
  });

  test('moved milestones land on a day the student can actually work', () => {
    const tasks = [subject, other];
    const weeks = buildWeeks(tasks, milestones, PREFS, NOW);
    const recommendation = recommendForWeek(weeks, 1, new Map(tasks.map((t) => [t.taskId, t])), PREFS);
    const result = applyRecommendation(recommendation, subject, milestones, PREFS, NOW);

    for (const milestone of result.milestones) {
      const weekday = new Date(toMs(milestone.dueAt) + 8 * 3600000).getUTCDay();
      assert.ok(weekday !== 0 && weekday !== 6, `landed on a weekend: ${milestone.dueAt}`);
      assert.ok(toMs(milestone.dueAt) >= NOW);
      assert.ok(toMs(subject.dueAt) - toMs(milestone.dueAt) >= days(1) - 60000);
    }
  });

  test('a task with no breakdown yet gets one — that IS the redistribution', () => {
    const oversized = task({ effortHours: 20 });
    const weeks = buildWeeks([oversized], [], PREFS, NOW);
    const recommendation = recommendForWeek(weeks, 1, new Map([[oversized.taskId, oversized]]), PREFS);
    const result = applyRecommendation(recommendation, oversized, [], PREFS, NOW, weeks);

    assert.equal(result.created, true);
    assert.ok(result.milestones.length >= 3);
    const after = buildWeeks([oversized], result.milestones, PREFS, NOW);
    assert.ok(after[1].requiredHours < 20, 'work was not spread out of the crash week');
  });

  test('🔴 applying never creates a NEW crash week somewhere else', () => {
    // Relieving one week by overloading an earlier one is not a fix, and it is
    // the failure this whole feature would be judged on.
    const cases = [
      { tasks: [task({ effortHours: 20 })], milestones: [] },
      { tasks: [subject, other], milestones },
      {
        tasks: [
          task({ taskId: 'busy', title: 'Portfolio', effortHours: 14, dueAt: iso(NOW + days(5)) }),
          task({ taskId: 'big', title: 'Dissertation', effortHours: 26, dueAt: iso(NOW + days(12)) }),
        ],
        milestones: [],
      },
    ];

    for (const { tasks, milestones: existing } of cases) {
      const before = buildWeeks(tasks, existing, PREFS, NOW);
      const index = before.findIndex((week) => week.crash);
      if (index === -1) continue;

      const byId = new Map(tasks.map((t) => [t.taskId, t]));
      const recommendation = recommendForWeek(before, index, byId, PREFS);
      const target = recommendation && byId.get(recommendation.taskId);
      const result = target && applyRecommendation(
        recommendation, target, existing.filter((m) => m.taskId === target.taskId), PREFS, NOW, before,
      );
      if (!result) continue; // honestly declined — that is an acceptable answer

      const after = buildWeeks(tasks, existing
        .filter((m) => m.taskId !== target.taskId)
        .concat(result.milestones), PREFS, NOW);

      // If Apply was offered at all, it has to actually help.
      assert.ok(
        after[index].requiredHours < before[index].requiredHours,
        `Apply was offered (${recommendation.kind}) but did not relieve ${before[index].label}: `
        + `${before[index].requiredHours}h → ${after[index].requiredHours}h`,
      );

      after.forEach((week, i) => {
        if (before[i].crash) return; // already bad; only new damage counts
        assert.ok(
          !week.crash,
          `applying created a new crash week at ${week.label}: `
          + `${before[i].requiredHours}h → ${week.requiredHours}h against ${week.availableHours}h`,
        );
      });
    }
  });

  test('Alt B is only offered when there is somewhere to spread the work to', () => {
    // Every earlier week already full → the honest answer is "reduce scope",
    // not "break it down and move it into weeks that cannot take it".
    const packed = [
      task({ taskId: 'wall', title: 'Placement report', effortHours: 15, dueAt: iso(NOW + days(4)) }),
      task({ taskId: 'huge', title: 'Group build', effortHours: 30, dueAt: iso(NOW + days(9)) }),
    ];
    const weeks = buildWeeks(packed, [], PREFS, NOW);
    const found = crashWeeks(weeks, packed, PREFS, {}, NOW);
    const second = found.find((entry) => entry.label === '24 Aug');
    if (second) assert.notEqual(second.recommendation.kind, 'break_down');
  });

  test('there is no valid move when there is no capacity — never a fake plan', () => {
    assert.equal(applyRecommendation({ kind: 'no_capacity', moves: [] }, subject, milestones, PREFS, NOW), null);
    assert.equal(applyRecommendation(null, subject, milestones, PREFS, NOW), null);
  });
});
