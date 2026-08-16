'use strict';

/**
 * UC-012 — milestone breakdown, and the two constraints that are enforced in
 * code rather than in the prompt.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  proposeFromTemplate, proposeFromModel, rescaleHours, templateMilestones, isTooSmall,
} = require('../lib/milestones/generate');
const { localDateKey, toMs } = require('../lib/scoring/availability');

const NOW = Date.parse('2026-08-16T16:00:00.000Z'); // Mon 17 Aug, 00:00 SGT
const days = (n) => n * 86400000;
const iso = (ms) => new Date(ms).toISOString();

const PREFS = {
  tz: 'Asia/Singapore',
  availability: { mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 0, sun: 0 },
  blockedDates: [],
};

const task = (overrides = {}) => ({
  taskId: 'task-1',
  title: 'IT2214 Database Report',
  type: 'assignment',
  effortHours: 12,
  dueAt: iso(NOW + days(10)),
  ...overrides,
});

const sumHours = (list) => Math.round(list.reduce((sum, m) => sum + m.hours, 0) * 10) / 10;

describe('Template breakdowns — UC-012 E1', () => {
  test('every task type has its own sensible steps', () => {
    assert.equal(templateMilestones(task({ type: 'assignment' })).length, 5);
    assert.equal(templateMilestones(task({ type: 'test' })).length, 4);
    assert.equal(templateMilestones(task({ type: 'presentation' })).length, 4);
    assert.equal(templateMilestones(task({ type: 'project' })).length, 5);
    assert.match(templateMilestones(task({ type: 'test' }))[2].name, /Past papers/);
  });

  test('produces between 3 and 6 milestones whose hours sum to effortHours', () => {
    for (const type of ['assignment', 'test', 'presentation', 'project']) {
      const proposed = proposeFromTemplate(task({ type, effortHours: 13 }), PREFS, NOW, []);
      assert.ok(proposed.length >= 3 && proposed.length <= 6, `${type}: ${proposed.length}`);
      assert.equal(sumHours(proposed), 13, type);
    }
  });

  test('deliverables carried from UC-006 replace the generic steps', () => {
    const deliverables = ['ER diagram', 'Normalisation report', 'SQL scripts'];
    const proposed = proposeFromTemplate(task(), PREFS, NOW, deliverables);
    assert.deepEqual(proposed.map((m) => m.name), deliverables);
    assert.equal(sumHours(proposed), 12);
  });

  test('Alt B — a task under 3 hours is not broken down at all', () => {
    assert.equal(isTooSmall(task({ effortHours: 2 })), true);
    assert.equal(isTooSmall(task({ effortHours: 3 })), false);
    assert.equal(isTooSmall(task({ effortHours: undefined })), true);
  });
});

describe('Constraint (i) — a full day of buffer before the real deadline', () => {
  test('the last milestone never lands on the deadline itself', () => {
    const subject = task();
    const proposed = proposeFromTemplate(subject, PREFS, NOW, []);
    const last = toMs(proposed[proposed.length - 1].dueAt);
    assert.ok(toMs(subject.dueAt) - last >= days(1) - 60000,
      `last milestone is ${(toMs(subject.dueAt) - last) / 3600000} h before the deadline`);
  });

  test('milestones run in order and never start before today', () => {
    const proposed = proposeFromTemplate(task(), PREFS, NOW, []);
    let previous = 0;
    proposed.forEach((milestone, index) => {
      const at = toMs(milestone.dueAt);
      assert.ok(at >= NOW, 'milestone scheduled in the past');
      assert.ok(at >= previous, 'milestones out of order');
      assert.equal(milestone.order, index + 1);
      previous = at;
    });
  });

  test('a very short runway still produces a legal schedule', () => {
    const proposed = proposeFromTemplate(task({ dueAt: iso(NOW + days(2)) }), PREFS, NOW, []);
    for (const milestone of proposed) {
      assert.ok(toMs(milestone.dueAt) <= toMs(iso(NOW + days(1))) + days(1));
    }
    assert.equal(sumHours(proposed), 12);
  });
});

describe('Constraint (ii) — never on a day the student cannot work', () => {
  test('weekend and blocked dates are avoided', () => {
    const prefs = { ...PREFS, blockedDates: ['2026-08-19', '2026-08-20'] };
    const proposed = proposeFromTemplate(task({ dueAt: iso(NOW + days(14)) }), prefs, NOW, []);

    for (const milestone of proposed) {
      const key = localDateKey(milestone.dueAt, prefs.tz);
      assert.ok(!prefs.blockedDates.includes(key), `landed on blocked ${key}`);
      const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
      assert.ok(weekday !== 0 && weekday !== 6, `landed on a zero-availability weekend: ${key}`);
    }
  });

  test('a shifted row says why it moved', () => {
    const prefs = { ...PREFS, blockedDates: ['2026-08-26'] };
    const proposed = proposeFromTemplate(task({ dueAt: iso(NOW + days(10)) }), prefs, NOW, []);
    const moved = proposed.filter((m) => m.notes.length > 0);
    assert.ok(moved.every((m) => m.notes.some((note) => /blocked day|earlier|today/.test(note))));
  });
});

describe('Model proposals go through exactly the same pipeline', () => {
  test('E2 — hours that do not sum are rescaled proportionally', () => {
    const rescaled = rescaleHours(
      [{ name: 'a', hours: 1 }, { name: 'b', hours: 2 }, { name: 'c', hours: 1 }], 12,
    );
    assert.equal(sumHours(rescaled), 12);
    assert.deepEqual(rescaled.map((m) => m.hours), [3, 6, 3]);
  });

  test('E3 — a milestone dated after the deadline is clamped, with a note', () => {
    const subject = task();
    const proposed = proposeFromModel([
      { name: 'Research', hours: 4, dueAt: iso(NOW + days(2)) },
      { name: 'Draft', hours: 4, dueAt: iso(NOW + days(5)) },
      { name: 'Submit', hours: 4, dueAt: iso(NOW + days(30)) }, // after the deadline
    ], subject, PREFS, NOW);

    const last = proposed[proposed.length - 1];
    assert.ok(toMs(subject.dueAt) - toMs(last.dueAt) >= days(1) - 60000);
    assert.ok(last.notes.some((note) => /finish a day before/.test(note)));
    assert.equal(sumHours(proposed), 12);
  });

  test('a model returning more than six steps is trimmed', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `Step ${i}`, hours: 2 }));
    const proposed = proposeFromModel(many, task(), PREFS, NOW);
    assert.equal(proposed.length, 6);
    assert.equal(sumHours(proposed), 12);
  });

  test('every proposal carries an id, so accepting it writes cleanly', () => {
    const proposed = proposeFromTemplate(task(), PREFS, NOW, []);
    const ids = new Set(proposed.map((m) => m.milestoneId));
    assert.equal(ids.size, proposed.length);
    assert.ok(proposed.every((m) => m.taskId === 'task-1' && m.completedAt === null));
  });
});
