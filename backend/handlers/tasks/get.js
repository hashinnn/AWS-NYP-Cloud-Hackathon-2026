'use strict';

/**
 * GET /api/tasks/{taskId} — UC-003 steps 1–2, the task detail screen.
 * Class A read: no LLM on this path.
 *
 * Returns the persisted `subScores` rather than recomputing them, so the
 * breakdown the student sees is the one the ranking was actually built from.
 */

const { ok, fail } = require('../../lib/http');
const { getAllForUser } = require('../../lib/dynamo/tasks');
const { extractMilestones } = require('../../lib/dynamo/milestones');
const { publicTask } = require('../../lib/loadRanked');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const taskId = event.pathParameters.taskId;

  // One Query returns the task and its milestones together (HLD §5.4 #3).
  const items = await getAllForUser(userId);
  const task = items.find((item) => item.SK === `TASK#${taskId}`);

  // Another student's task lands here identically: their items are in a
  // different partition, so the find simply misses. 404, never 403 — a 403
  // would confirm the task exists.
  if (!task) return fail(404, 'not_found', 'That task no longer exists.');

  const milestones = extractMilestones(items).filter((m) => m.taskId === taskId);

  return ok(200, {
    task: publicTask(task),
    milestones: milestones.map(publicTask),
  });
};
