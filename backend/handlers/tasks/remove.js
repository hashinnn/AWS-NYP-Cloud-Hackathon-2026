'use strict';

/**
 * DELETE /api/tasks/{taskId} — UC-003 steps 7–8.
 *
 * A soft delete. Nothing is ever hard-deleted during the hackathon: the item
 * stays in the table with `status = 'deleted'`, which is what makes the
 * 10-second undo and the later archive recovery possible at all.
 */

const { ok, fail } = require('../../lib/http');
const {
  getAllForUser, patchTask, rankedTasks, saveScores,
} = require('../../lib/dynamo/tasks');
const { extractPrefs, scoringPrefs } = require('../../lib/dynamo/prefs');
const { publicTask } = require('../../lib/loadRanked');
const score = require('../../lib/scoring');

const MAX_HISTORY = 50;

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const taskId = event.pathParameters.taskId;

  const items = await getAllForUser(userId);
  const task = items.find((item) => item.SK === `TASK#${taskId}`);
  if (!task || task.status === 'deleted') {
    return fail(404, 'not_found', 'That task no longer exists.');
  }

  const now = new Date().toISOString();

  // The history entry is not just an audit trail — restore reads `from` to
  // know what to put back, and `at` to decide whether the undo window is
  // still open. Deleting without it would make the undo unimplementable.
  const entry = { at: now, field: 'status', from: task.status, to: 'deleted' };

  let updated;
  try {
    updated = await patchTask(userId, taskId, {
      status: 'deleted',
      history: [...(task.history || []), entry].slice(-MAX_HISTORY),
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'task_delete_failed', userId, taskId, message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'That task could not be deleted — please try again.');
  }

  // Removing a task lowers the ClashPenalty of everything that was clashing
  // with it, so the rest of the list has to be rescored too.
  let ranking = [];
  try {
    const remaining = rankedTasks(items).filter((item) => item.taskId !== taskId);
    const prefs = scoringPrefs(items, extractPrefs(items));
    const ranked = score(remaining, prefs, now);
    await saveScores(userId, ranked);
    ranking = ranked;
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'scoring_failed_on_delete', userId, taskId, message: error.message,
    }));
  }

  return ok(200, { task: publicTask(updated), ranking: ranking.map(publicTask) });
};
