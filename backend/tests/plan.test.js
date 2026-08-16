'use strict';

/**
 * UC-014 — the daily study plan.
 * "Never a block under 45 minutes, never the whole day on one task."
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const score = require('../lib/scoring');
const { DEFAULT_WEIGHTS } = require('../lib/scoring/normalise');
const { planToday, MIN_BLOCK_HOURS, MAX_BLOCK_HOURS } = require('../lib/plan/allocate');

const NOW = Date.parse('2026-08-16T16:00:00.000Z'); // Mon 17 Aug, 00:00 SGT
const days = (n) => n * 86400000;
const iso = (ms) => new Date(ms).toISOString();

const prefsWith = (mondayHours, extra = {}) => ({
  tz: 'Asia/Singapore',
  availability: {
    mon: mondayHours, tue: 3, wed: 3, thu: 3, fri: 3, sat: 5, sun: 5,
  },
  blockedDates: [],
  weights: { ...DEFAULT_WEIGHTS },
  ...extra,
});

const task = (overrides) => ({
  taskId: 'task-1',
  title: 'IT2214 Report',
  module: 'IT2214',
  type: 'assignment',
  status: 'active',
  gradeWeight: 40,
  effortHours: 12,
  progressPct: 0,
  prepDays: 0,
  createdAt: iso(NOW - days(3)),
  dueAt: iso(NOW + days(9)),
  ...overrides,
});

const plan = (tasks, milestones, prefs) => planToday(
  score(tasks, prefs, NOW), milestones, prefs, NOW, DEFAULT_WEIGHTS,
);

describe('Allocation rules — UC-014 step 3', () => {
  const prefs = prefsWith(6);
  const tasks = [
    task({ taskId: 'a' }),
    task({ taskId: 'b', title: 'IT2212 Essay', gradeWeight: 20, effortHours: 8, dueAt: iso(NOW + days(12)) }),
  ];

  test('no block is shorter than 45 minutes or longer than 3 hours', () => {
    const { blocks } = plan(tasks, [], prefs);
    assert.ok(blocks.length > 0);
    for (const block of blocks) {
      assert.ok(block.hours >= MIN_BLOCK_HOURS, `${block.hours} h block`);
      assert.ok(block.hours <= MAX_BLOCK_HOURS, `${block.hours} h block`);
    }
  });

  test('never allocates the whole day to a single task', () => {
    const { blocks, availableHours } = plan(tasks, [], prefs);
    assert.equal(availableHours, 6);
    const perTask = blocks.reduce((acc, b) => ({ ...acc, [b.taskId]: (acc[b.taskId] || 0) + b.hours }), {});
    assert.equal(Object.keys(perTask).length, 2);
    assert.ok(Math.max(...Object.values(perTask)) < availableHours);
  });

  test('the plan never promises more hours than the student has', () => {
    const { blocks, availableHours } = plan(tasks, [], prefs);
    const allocated = blocks.reduce((sum, b) => sum + b.hours, 0);
    assert.ok(allocated <= availableHours + 0.001, `${allocated} > ${availableHours}`);
  });

  test('every block carries a reason traceable to the score', () => {
    const { blocks } = plan(tasks, [], prefs);
    for (const block of blocks) {
      assert.match(block.rationale, /^#\d+ priority — .+/);
    }
  });

  test('a task the maths says is impossible is allocated first', () => {
    const impossible = task({
      taskId: 'tight', title: 'Tomorrow test', type: 'test', effortHours: 20, dueAt: iso(NOW + days(1)),
    });
    const ranked = score([task({ taskId: 'a' }), impossible], prefs, NOW);
    assert.equal(ranked.find((t) => t.taskId === 'tight').tight, true);

    const { blocks } = planToday(ranked, [], prefs, NOW, DEFAULT_WEIGHTS);
    assert.equal(blocks[0].taskId, 'tight');
  });

  test('milestones are scheduled in preference to whole tasks', () => {
    const milestones = [
      { taskId: 'a', milestoneId: 'm1', name: 'Outline the structure', hours: 4, dueAt: iso(NOW + days(2)), order: 1 },
      { taskId: 'a', milestoneId: 'm2', name: 'Write the draft', hours: 8, dueAt: iso(NOW + days(5)), order: 2 },
    ];
    const { blocks } = plan([task({ taskId: 'a' })], milestones, prefs);
    assert.equal(blocks[0].milestoneId, 'm1');
    assert.equal(blocks[0].title, 'Outline the structure');
  });
});

describe('Edge cases — UC-014 Alt A, Alt B, E1, E2', () => {
  test('E2 — a leftover under 45 minutes extends the last block, never fragments', () => {
    const { blocks, spareHours } = plan([task({ effortHours: 10 })], [], prefsWith(3.5));
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].hours, 3.5);
    assert.equal(spareHours, 0);
  });

  test('Alt A — no hours today says what moves and what it costs', () => {
    const prefs = prefsWith(0, { blockedDates: ['2026-08-17'] });
    const result = plan([task({})], [], prefs);
    assert.equal(result.blocks.length, 0);
    assert.match(result.shift.message, /No study time today/);
    assert.match(result.shift.message, /moves to tomorrow/);
    assert.equal(result.shift.tomorrowAvailableHours, 3);
  });

  test('Alt B — spare capacity suggests what to start early', () => {
    const milestones = [
      { taskId: 'a', milestoneId: 'm1', name: 'Outline', hours: 2, dueAt: iso(NOW + days(2)), order: 1 },
      { taskId: 'a', milestoneId: 'm2', name: 'Draft', hours: 10, dueAt: iso(NOW + days(5)), order: 2 },
    ];
    const result = plan([task({ taskId: 'a' })], milestones, prefsWith(6));
    assert.equal(result.spareHours, 4);
    assert.match(result.spare.message, /4 hours spare/);
    assert.equal(result.spare.milestoneId, 'm2');
  });

  test('E1 — nothing to do is a rest state with the next start-by date', () => {
    const result = plan([task({ status: 'completed' })], [], prefsWith(6));
    assert.equal(result.blocks.length, 0);
    assert.match(result.restState.message, /you're ahead/i);
  });

  test('overdue work is shown for resolution, never given hours', () => {
    const tasks = [
      task({ taskId: 'a' }),
      task({ taskId: 'late', title: 'Missed lab', status: 'overdue', dueAt: iso(NOW - days(2)) }),
    ];
    const { blocks, overdueStrip } = plan(tasks, [], prefsWith(6));
    assert.equal(overdueStrip.length, 1);
    assert.equal(overdueStrip[0].taskId, 'late');
    assert.ok(!blocks.some((block) => block.taskId === 'late'));
  });
});
