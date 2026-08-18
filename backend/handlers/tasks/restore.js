'use strict';

/**
 * POST /api/tasks/{taskId}/restore — UC-003 step 9, the Undo behind the toast.
 */

const { ok, fail } = require('../../lib/http');
const {
  getAllForUser, patchTask, rankedTasks, saveScores,
} = require('../../lib/dynamo/tasks');
const { extractPrefs, scoringPrefs } = require('../../lib/dynamo/prefs');
const { publicTask } = require('../../lib/loadRanked');
const score = require('../../lib/scoring');

const MAX_HISTORY = 50;
const UNDO_WINDOW_MS = 10_000;   // UC-003 step 8 — "a 10-second Undo"

/** The delete this restore would reverse. */
function lastDeletion(task) {
  return [...(task.history || [])]
    .reverse()
    .find((entry) => entry.field === 'status' && entry.to === 'deleted') || null;
}

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const taskId = event.pathParameters.taskId;

  const items = await getAllForUser(userId);
  const task = items.find((item) => item.SK === `TASK#${taskId}`);
  if (!task || task.status !== 'deleted') {
    return fail(404, 'not_found', 'That task no longer exists.');
  }

  const deletion = lastDeletion(task);
  if (!deletion) return fail(404, 'not_found', 'That task no longer exists.');

  const now = new Date().toISOString();

  // E3 — the window has closed. The item is still here, never hard-deleted,
  // so this is a redirect to the archive rather than a loss.
  if (Date.parse(now) - Date.parse(deletion.at) > UNDO_WINDOW_MS) {
    return fail(410, 'undo_window_expired',
      'This task has already been removed — you can still find it in your archive.');
  }

  // Step 9 — "restores status to its previous value", not a hardcoded 'active':
  // deleting an overdue task and undoing it must give back an overdue task.
  const previous = deletion.from || 'active';

  let updated;
  try {
    updated = await patchTask(userId, taskId, {
      status: previous,
      history: [...(task.history || []), {
        at: now, field: 'status', from: 'deleted', to: previous,
      }].slice(-MAX_HISTORY),
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'task_restore_failed', userId, taskId, message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'That task could not be restored — please try again.');
  }

  let ranking = [];
  try {
    const others = rankedTasks(items).filter((item) => item.taskId !== taskId);
    const prefs = scoringPrefs(items, extractPrefs(items));
    const ranked = score([...others, updated], prefs, now);
    await saveScores(userId, ranked);
    ranking = ranked;
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'scoring_failed_on_restore', userId, taskId, message: error.message,
    }));
  }

  return ok(200, { task: publicTask(updated), ranking: ranking.map(publicTask) });
};
