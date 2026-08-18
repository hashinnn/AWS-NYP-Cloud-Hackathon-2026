'use strict';

/**
 * POST /api/tasks/{taskId}/progress — UC-008.
 *
 * Covers the direct-entry branch of step 2: a percentage slider and/or
 * logged study hours. The milestone-ticking branch already lives in
 * milestones/patch.js (UC-012), which derives progressPct from completed
 * milestone hours and takes precedence per E3 — this handler does not touch
 * milestones, so the two paths cannot disagree with each other.
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const { getTask, patchTask, saveScores } = require('../../lib/dynamo/tasks');
const { loadRanked, publicTask } = require('../../lib/loadRanked');
const score = require('../../lib/scoring');

const MAX_HISTORY = 50;

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const taskId = event.pathParameters.taskId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.logProgress);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  // E1 — the documented code is more specific than a generic validation
  // failure; the frontend clamps the slider on sight of it.
  if (body.progressPct !== undefined && (body.progressPct < 0 || body.progressPct > 100)) {
    return fail(400, 'progress_out_of_range', 'Progress must be between 0 and 100.');
  }

  const task = await getTask(userId, taskId);
  if (!task) return fail(404, 'not_found', 'That task no longer exists.');

  const now = new Date().toISOString();
  const changes = {};
  const historyEntries = [];

  // Alt B — progress is never treated as monotonic; a decrease is accepted
  // and logged like any other change.
  if (body.progressPct !== undefined && body.progressPct !== task.progressPct) {
    historyEntries.push({
      at: now, field: 'progressPct', from: task.progressPct ?? 0, to: body.progressPct,
    });
    changes.progressPct = body.progressPct;
  }

  if (body.hoursLogged) {
    const hoursSpent = Math.round(((task.hoursSpent || 0) + body.hoursLogged) * 100) / 100;
    historyEntries.push({ at: now, field: 'hoursSpent', from: task.hoursSpent || 0, to: hoursSpent });
    changes.hoursSpent = hoursSpent;
  }

  if (Object.keys(changes).length === 0) {
    return ok(200, { task: publicTask(task), ranking: [] });
  }

  const finalProgress = changes.progressPct !== undefined ? changes.progressPct : task.progressPct;
  if (finalProgress >= 100) {
    changes.progressPct = 100;
    changes.status = 'completed';
    changes.completedAt = now;
    changes.lateSubmission = Boolean(task.dueAt) && Date.parse(task.dueAt) < Date.parse(now);
  }

  changes.history = [...(task.history || []), ...historyEntries].slice(-MAX_HISTORY);

  let updated;
  try {
    updated = await patchTask(userId, taskId, changes);
  } catch (error) {
    // E2 — the optimistic UI reverts to the last persisted value.
    console.error(JSON.stringify({
      level: 'ERROR', event: 'progress_save_failed', taskId, message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'Progress could not be saved — please try again.');
  }

  // Step 5 — remainingHours feeds EffortPressure and ProgressDeficit, both of
  // which depend on the rest of the active set, so the whole set is rescored.
  const { tasks, prefs } = await loadRanked(userId, now);
  const ranked = score(tasks, prefs, now);
  await saveScores(userId, ranked);

  // Alt A — over-running the estimate while still short of done.
  const estimateHint = (updated.hoursSpent > updated.effortHours && updated.progressPct < 100)
    ? 'This is taking longer than estimated — update your effort estimate?'
    : undefined;

  return ok(200, {
    task: publicTask(updated),
    ranking: ranked.map(publicTask),
    ...(estimateHint ? { estimateHint } : {}),
  });
};
