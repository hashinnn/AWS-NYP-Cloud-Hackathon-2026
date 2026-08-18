'use strict';

/**
 * POST /api/tasks/{taskId}/resolve — UC-021 step 4 [Z-07]. Class B write.
 *
 * The three honest resolutions: submitted late, new deadline, or archived.
 * Each one is a status change plus a history entry, and each one returns the
 * full ranking — an archived task leaves the capacity model and a rescheduled
 * one changes every other task's ClashPenalty, so a single-task response would
 * leave the client showing an order that is no longer true.
 */

const { ok, fail } = require('../../lib/http');
const { validate, z } = require('../../lib/validate');
const { getTask, patchTask, saveScores } = require('../../lib/dynamo/tasks');
const { loadRanked, publicTask } = require('../../lib/loadRanked');
const { resolutionPatch } = require('../../lib/overdue/transition');

const schema = z.object({
  action: z.enum(['complete', 'reschedule', 'archive']),
  newDueAt: z.string().optional(),
}).strict();

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const taskId = (event.pathParameters || {}).taskId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const now = new Date().toISOString();

  try {
    const task = await getTask(userId, taskId);
    if (!task) return fail(404, 'not_found', 'That task no longer exists.');

    const patch = resolutionPatch(task, body.action, now, body.newDueAt);
    if (!patch) {
      // E1 — a "new" deadline in the past is not a reschedule.
      return fail(400, 'validation_failed', 'Please choose a future date — or mark it complete if you’ve submitted.');
    }

    const updated = await patchTask(userId, taskId, patch);

    // Rescore the whole active set, never just this task.
    let ranking = [];
    try {
      const { ranked } = await loadRanked(userId, now);
      await saveScores(userId, ranked);
      ranking = ranked.map(publicTask);
    } catch (error) {
      // E2/E4 — the resolution itself is committed; the next scheduled run
      // corrects the scores.
      console.warn(JSON.stringify({
        level: 'WARN', event: 'resolve_rescore_failed', taskId, message: error.message,
      }));
    }

    return ok(200, { task: publicTask(updated), ranking });
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      return fail(404, 'not_found', 'That task no longer exists.');
    }
    console.error(JSON.stringify({
      level: 'ERROR', event: 'resolve_failed', taskId, message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'Could not update that task — please try again.');
  }
};
