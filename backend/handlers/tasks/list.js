'use strict';

/**
 * GET /api/tasks — the index the UC-003 detail screen is reached from.
 * Class A read: no LLM, and no rescoring either.
 *
 * Filters are applied in memory after a single partition Query. A student's
 * task count is in the tens, so this is one round trip and no Scan — the
 * alternative would be an index per filter combination for no benefit.
 */

const { ok } = require('../../lib/http');
const { getAllForUser, extractTasks } = require('../../lib/dynamo/tasks');
const { publicTask } = require('../../lib/loadRanked');
const { normaliseCode } = require('../../lib/dynamo/modules');

// A soft-deleted task is not in "all tasks" — it is reachable only by asking
// for it, which is what makes the archive a recovery route rather than clutter.
const DEFAULT_HIDDEN = 'deleted';

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const query = event.queryStringParameters || {};

  const items = await getAllForUser(userId);
  let tasks = extractTasks(items);

  tasks = query.status
    ? tasks.filter((task) => task.status === query.status)
    : tasks.filter((task) => task.status !== DEFAULT_HIDDEN);

  if (query.module) {
    const wanted = normaliseCode(query.module);
    tasks = tasks.filter((task) => normaliseCode(task.module) === wanted);
  }
  if (query.type) tasks = tasks.filter((task) => task.type === query.type);
  if (query.from) tasks = tasks.filter((task) => task.dueAt >= query.from);
  if (query.to) tasks = tasks.filter((task) => task.dueAt <= query.to);

  // Priority order by default — the whole point of the product is that this
  // is not deadline order. Ties break the same way the engine breaks them.
  tasks.sort(query.sort === 'deadline'
    ? (a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)
    : (a, b) => (b.priorityScore ?? -1) - (a.priorityScore ?? -1)
      || Date.parse(a.dueAt) - Date.parse(b.dueAt)
      || (b.gradeWeight ?? 0) - (a.gradeWeight ?? 0)
      || String(a.taskId).localeCompare(String(b.taskId)));

  return ok(200, {
    tasks: tasks.map(publicTask),
    meta: { count: tasks.length, generatedAt: new Date().toISOString() },
  });
};
