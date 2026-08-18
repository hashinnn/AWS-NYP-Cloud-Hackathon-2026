'use strict';

/**
 * UC-008 — progress and study-hour logging. Stubs only the I/O layer (same
 * technique as backend/scripts/devserver.js) so the handler's own logic
 * runs for real.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const USER = 'test-user';
const NOW = Date.parse('2026-08-18T04:00:00.000Z');

function stub(relative, overrides) {
  const resolved = require.resolve(path.join(__dirname, '..', relative));
  delete require.cache[resolved];
  const real = require(resolved);
  require.cache[resolved].exports = { ...real, ...overrides };
  return resolved;
}

let TASK;

beforeEach(() => {
  TASK = {
    PK: `USER#${USER}`,
    SK: 'TASK#t1',
    taskId: 't1',
    userId: USER,
    title: 'DB Report',
    module: 'IT2214',
    type: 'assignment',
    status: 'active',
    dueAt: new Date(NOW + 3 * 86400000).toISOString(),
    createdAt: new Date(NOW - 7 * 86400000).toISOString(),
    updatedAt: new Date(NOW - 86400000).toISOString(),
    gradeWeight: 40,
    effortHours: 12,
    hoursSpent: 0,
    progressPct: 15,
    prepDays: 0,
    history: [],
  };

  stub('lib/dynamo/tasks.js', {
    getAllForUser: async () => [{ SK: 'PROFILE', tz: 'Asia/Singapore' }, { ...TASK }],
    getTask: async (userId, taskId) => (taskId === TASK.taskId ? { ...TASK } : null),
    patchTask: async (userId, taskId, changes) => Object.assign(TASK, changes),
    saveScores: async () => {},
  });
  stub('lib/dynamo/prefs.js', {
    getPrefs: async () => ({}),
    extractPrefs: () => ({}),
    scoringPrefs: (items, prefs) => prefs,
  });
  stub('lib/dynamo/milestones.js', { extractMilestones: () => [] });
});

function event(taskId, body) {
  return {
    pathParameters: { taskId },
    body: JSON.stringify(body),
    requestContext: { authorizer: { userId: USER } },
  };
}

describe('POST /api/tasks/{taskId}/progress — UC-008', () => {
  test('main flow — a percentage update rescores and returns the ranking', async () => {
    delete require.cache[require.resolve('../handlers/progress/logProgress.js')];
    delete require.cache[require.resolve('../lib/loadRanked.js')];
    const { handler } = require('../handlers/progress/logProgress.js');

    const result = await handler(event('t1', { progressPct: 40 }));
    const body = JSON.parse(result.body);

    assert.equal(result.statusCode, 200);
    assert.equal(body.task.progressPct, 40);
    assert.equal(body.task.history.length, 1);
    assert.equal(body.task.history[0].from, 15);
    assert.equal(body.task.history[0].to, 40);
    assert.ok(Array.isArray(body.ranking));
  });

  test('logging hours accumulates onto hoursSpent, never replaces it', async () => {
    delete require.cache[require.resolve('../handlers/progress/logProgress.js')];
    const { handler } = require('../handlers/progress/logProgress.js');

    await handler(event('t1', { hoursLogged: 2 }));
    const result = await handler(event('t1', { hoursLogged: 1.5 }));
    const body = JSON.parse(result.body);

    assert.equal(body.task.hoursSpent, 3.5);
  });

  test('reaching 100% marks the task completed', async () => {
    const { handler } = require('../handlers/progress/logProgress.js');
    const result = await handler(event('t1', { progressPct: 100 }));
    const body = JSON.parse(result.body);

    assert.equal(body.task.status, 'completed');
    assert.ok(body.task.completedAt);
  });

  test('Alt A — over-running the estimate below 100% surfaces estimateHint', async () => {
    const { handler } = require('../handlers/progress/logProgress.js');
    await handler(event('t1', { hoursLogged: 13 })); // > effortHours (12)
    const result = await handler(event('t1', { progressPct: 80 }));
    const body = JSON.parse(result.body);

    assert.ok(body.estimateHint, 'expected an estimateHint once hoursSpent exceeds effortHours');
  });

  test('Alt B — progress may decrease; it is logged, not rejected', async () => {
    const { handler } = require('../handlers/progress/logProgress.js');
    const result = await handler(event('t1', { progressPct: 5 }));
    const body = JSON.parse(result.body);

    assert.equal(body.task.progressPct, 5);
    assert.equal(body.task.history[0].to, 5);
  });

  test('E1 — out-of-range progress is rejected with the documented code', async () => {
    const { handler } = require('../handlers/progress/logProgress.js');
    const result = await handler(event('t1', { progressPct: 150 }));
    assert.equal(result.statusCode, 400);
    assert.equal(JSON.parse(result.body).code, 'progress_out_of_range');
  });

  test('404 for a task that does not exist — never leaked as another status', async () => {
    const { handler } = require('../handlers/progress/logProgress.js');
    const result = await handler(event('missing', { progressPct: 50 }));
    assert.equal(result.statusCode, 404);
    assert.equal(JSON.parse(result.body).code, 'not_found');
  });

  test('validation_failed when neither field is provided', async () => {
    const { handler } = require('../handlers/progress/logProgress.js');
    const result = await handler(event('t1', {}));
    assert.equal(result.statusCode, 400);
    assert.equal(JSON.parse(result.body).code, 'validation_failed');
  });
});
