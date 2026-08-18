'use strict';

/**
 * The seed fixture is demo infrastructure, and HLD §13.3 fixes exactly what
 * it has to prove on stage. These assertions run with no AWS account: they
 * score the fixture in memory and check the properties the demo depends on.
 *
 * A fixture that silently stops producing a crash week is a rehearsal that
 * looks fine and a demo that has nothing to click.
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  TASKS, MODULES, AVAILABILITY, now,
} = require('../scripts/seed');
const { DEFAULT_PREFS } = require('../lib/dynamo/prefs');
const { buildWeeks } = require('../lib/workload/weeks');
const score = require('../lib/scoring');

const PREFS = {
  ...DEFAULT_PREFS, availability: AVAILABILITY, blockedDates: [], tz: 'Asia/Singapore',
};
const NOW = new Date(now).toISOString();

const rankable = TASKS.filter((t) => ['active', 'overdue'].includes(t.status));
const ranked = score(rankable, PREFS, NOW);
const weeks = buildWeeks(ranked, [], PREFS, NOW);
const byId = (id) => ranked.find((t) => t.taskId === id);

test.describe('Seed fixture — HLD §13.3', () => {
  test('every task scores — no "score pending" on the demo account', () => {
    for (const task of ranked) {
      assert.ok(task.subScores, `${task.title} produced no sub-scores`);
      assert.ok(Number.isFinite(task.priorityScore), `${task.title} has no priorityScore`);
    }
  });

  test('the 40% report does not fit the time left — the `tight` badge is earned', () => {
    assert.equal(byId('seed-report').tight, true);
  });

  test('prepDays pulls the test above a deadline that is nearer', () => {
    const test5 = ranked.findIndex((t) => t.taskId === 'seed-test');
    const quiz2 = ranked.findIndex((t) => t.taskId === 'seed-quiz');
    assert.ok(test5 < quiz2,
      'the test (5 days out, 3 prep days) must outrank the quiz (2 days out)');
  });

  test('the clash is real — the two small tasks carry a ClashPenalty', () => {
    assert.ok(byId('seed-quiz').subScores.clashPenalty > 0);
    assert.ok(byId('seed-lab').subScores.clashPenalty > 0);
  });

  test('one overdue task exists and is pinned to maximum urgency', () => {
    const overdue = ranked.filter((t) => t.status === 'overdue');
    assert.equal(overdue.length, 1);
    assert.equal(overdue[0].subScores.urgency, 100);
  });

  test('Focus Mode has something to skip — a blocked group task', () => {
    const blocked = ranked.filter((t) => t.isGroup && t.blockedOnTeammate);
    assert.equal(blocked.length, 1);
  });

  /**
   * HLD §13.3 wants "one unmistakable crash week" in week 2. [H-09] words the
   * same requirement as "exactly one", which the mandated contents cannot
   * deliver: the 40% report is `tight` by construction — it does not fit
   * before its own deadline — and that deadline is three days out, so the
   * CURRENT week is over capacity as a true output of the model, not a
   * fixture defect. Suppressing it would mean lying about the arithmetic to
   * make a screenshot tidier.
   *
   * So the property asserted is the one that actually matters on stage:
   * week 2 is red, it is the worst week by a distance, and nothing behind it
   * is red at all.
   */
  test('🔴 week 2 is a crash week and unmistakably the worst', () => {
    const week2 = weeks[1];
    assert.equal(week2.crash, true, 'week 2 must be a crash week — this is the heatmap moment');

    const worst = [...weeks].sort((a, b) => b.overloadHours - a.overloadHours)[0];
    assert.equal(worst.weekStart, week2.weekStart,
      `week 2 overloads by ${week2.overloadHours} h but ${worst.label} overloads by ${worst.overloadHours} h`);
    assert.ok(week2.overloadHours >= 8,
      `week 2 overloads by only ${week2.overloadHours} h — not unmistakable`);
  });

  test('the crash is confined to the near term — weeks 3 onward are clear', () => {
    const later = weeks.slice(2).filter((week) => week.crash);
    assert.equal(later.length, 0,
      `weeks ${later.map((w) => w.label).join(', ')} are also red — the grid should read as one red block`);
  });

  test('every task names a module that the fixture actually creates', () => {
    const codes = new Set(MODULES.map(([code]) => code));
    for (const task of TASKS) assert.ok(codes.has(task.module), `${task.module} has no MODULE item`);
  });

  test('every deadline is relative to now, so the fixture cannot go stale', () => {
    for (const task of TASKS) {
      const offset = Math.abs(Date.parse(task.dueAt) - now);
      assert.ok(offset < 90 * 86400000, `${task.title} is ${Math.round(offset / 86400000)} days from now`);
    }
  });
});
