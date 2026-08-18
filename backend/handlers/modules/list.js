'use strict';

/**
 * GET /api/modules — UC-004. Class A read.
 *
 * Each module carries `assignedWeight`, the sum of the grade weights already
 * allocated to it. Alt B's amber over-allocation badge needs that figure, and
 * the client cannot compute it: completed and archived tasks still consume
 * assessment weight but are absent from the ranking the client holds.
 */

const { ok } = require('../../lib/http');
const { getAllForUser, extractTasks } = require('../../lib/dynamo/tasks');
const { extractModules, normaliseCode, DEFAULT_TOTAL_WEIGHT } = require('../../lib/dynamo/modules');
const { publicTask } = require('../../lib/loadRanked');

// A deleted task has been withdrawn; anything else the student still intends
// to submit counts against the module's assessment weight (HLD §5.6).
const COUNTS = (task) => task.status !== 'deleted';

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;

  const items = await getAllForUser(userId);
  const tasks = extractTasks(items).filter(COUNTS);

  const modules = extractModules(items).map((item) => {
    const assignedWeight = tasks
      .filter((task) => normaliseCode(task.module) === item.code)
      .reduce((total, task) => total + (Number(task.gradeWeight) || 0), 0);

    return {
      ...publicTask(item),
      totalWeight: item.totalWeight ?? DEFAULT_TOTAL_WEIGHT,
      assignedWeight: Math.round(assignedWeight * 10) / 10,
      taskCount: tasks.filter((task) => normaliseCode(task.module) === item.code).length,
    };
  }).sort((a, b) => a.code.localeCompare(b.code));

  return ok(200, { modules });
};
