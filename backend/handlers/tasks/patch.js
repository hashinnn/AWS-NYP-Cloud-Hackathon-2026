'use strict';

/**
 * PATCH /api/tasks/{taskId} — UC-003 steps 3–6. Class B write: no LLM here.
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const {
  getAllForUser, patchTask, rankedTasks, saveScores, RANKED_STATUSES,
} = require('../../lib/dynamo/tasks');
const { extractMilestones, putMilestones } = require('../../lib/dynamo/milestones');
const { extractPrefs, scoringPrefs } = require('../../lib/dynamo/prefs');
const { extractModules, createModule, normaliseCode } = require('../../lib/dynamo/modules');
const { resolveDueAt } = require('../../lib/tasks/dueAt');
const { strandedBy, shiftProportionally } = require('../../lib/tasks/milestoneShift');
const { publicTask } = require('../../lib/loadRanked');
const score = require('../../lib/scoring');

const MAX_HISTORY = 50;

// Step 5 — the five inputs whose change invalidates the score, and with it the
// UC-010 sentence written from that score.
const RESCORE_FIELDS = ['dueAt', 'effortHours', 'gradeWeight', 'prepDays', 'progressPct'];

const EDITABLE = [
  'title', 'type', 'module', 'gradeWeight', 'effortHours', 'prepDays',
  'progressPct', 'isGroup', 'blockedOnTeammate', 'notes', 'status',
];

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;   // NEVER from body
  const taskId = event.pathParameters.taskId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.patchTask);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const items = await getAllForUser(userId);
  const prefs = scoringPrefs(items, extractPrefs(items));
  const task = items.find((item) => item.SK === `TASK#${taskId}`);

  // 404 rather than 403 for a task that is not this student's — and the same
  // 404 for one they soft-deleted, which is reachable only through restore.
  if (!task || task.status === 'deleted') {
    return fail(404, 'not_found', 'That task no longer exists.');
  }

  const now = new Date().toISOString();
  const changes = {};
  const history = [];

  const recordChange = (field, from, to) => {
    changes[field] = to;
    history.push({ at: now, field, from: from ?? null, to: to ?? null });
  };

  for (const field of EDITABLE) {
    if (!(field in body)) continue;

    let next = body[field];
    if (field === 'module') next = next ? normaliseCode(next) : null;
    if (field === 'title') next = String(next).trim();

    if (next !== task[field]) recordChange(field, task[field], next);
  }

  if ('dueAt' in body) {
    const dueAt = resolveDueAt(body.dueAt, prefs.tz);
    if (!dueAt) return fail(400, 'validation_failed', 'That deadline is not a date we can read.');
    if (dueAt !== task.dueAt) {
      recordChange('dueAt', task.dueAt, dueAt);
      // The sparse index mirrors the deadline; a dueAt written without it
      // would leave the task sorted under its old date in every GSI1 query.
      changes.GSI1SK = `DUE#${dueAt}`;

      // Moving an overdue deadline into the future is a reschedule (UC-021
      // step 4), so the task stops being overdue. Without this it keeps the
      // badge forever: newlyOverdue() only transitions active → overdue, so
      // the hourly recompute never walks it back.
      if (task.status === 'overdue'
        && !('status' in body)
        && Date.parse(dueAt) > Date.parse(now)) {
        recordChange('status', task.status, 'active');
        changes.overdueSince = null;
      }
    }
  }

  if (Object.keys(changes).length === 0) {
    return ok(200, { task: publicTask(task), ranking: [] });
  }

  // Keep a module reference from dangling, the same way UC-002 Alt C does.
  if (changes.module && !extractModules(items).some((m) => m.code === changes.module)) {
    await createModule(userId, { code: changes.module });
  }

  const rescoreNeeded = RESCORE_FIELDS.some((field) => field in changes) || 'status' in changes;
  if (RESCORE_FIELDS.some((field) => field in changes)) changes.explanationStale = true;

  // Alt A — milestones now sitting past the new deadline.
  const milestones = extractMilestones(items).filter((m) => m.taskId === taskId);
  const stranded = changes.dueAt ? strandedBy(milestones, changes.dueAt) : [];
  let milestonesShifted = 0;

  if (stranded.length > 0 && body.shiftMilestones) {
    const shifted = shiftProportionally(
      milestones, task, changes.dueAt, prefs, Date.parse(now),
    );
    await putMilestones(userId, taskId, shifted);
    milestonesShifted = shifted.length;
  }

  changes.history = [...(task.history || []), ...history].slice(-MAX_HISTORY);

  let updated;
  try {
    updated = await patchTask(userId, taskId, changes, body.expectedUpdatedAt);
  } catch (error) {
    // E2 — the conditional write refused because another tab moved first.
    // Never overwrite: tell the student their view is out of date.
    if (error.name === 'ConditionalCheckFailedException') {
      return fail(409, 'stale_write', 'This task changed in another tab — reload to see the latest.');
    }
    console.error(JSON.stringify({
      level: 'ERROR', event: 'task_patch_failed', userId, taskId, message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'Your change could not be saved — please try again.');
  }

  // Step 5 — the whole active set. Moving one deadline changes the
  // ClashPenalty of every task within ±72 hours of it, so rescoring only the
  // edited task would leave the rest of the list quietly wrong.
  let ranking = [];
  let scored = updated;
  if (rescoreNeeded) {
    try {
      const others = rankedTasks(items).filter((item) => item.taskId !== taskId);
      // Alt B — an archived task is handed back to the engine only if it still
      // ranks. `score()` passes non-ranking statuses straight through, so
      // including it would put the thing the student just archived back in
      // the list they archived it out of.
      const stillRanks = RANKED_STATUSES.has(updated.status);
      const ranked = score(stillRanks ? [...others, updated] : others, prefs, now);
      await saveScores(userId, ranked);
      scored = ranked.find((item) => item.taskId === taskId) || updated;
      ranking = ranked;
    } catch (error) {
      // E4 — the edit stands; the badge says "score pending" and the hourly
      // recompute corrects it.
      console.error(JSON.stringify({
        level: 'ERROR', event: 'scoring_failed_on_patch', userId, taskId, message: error.message,
      }));
    }
  }

  return ok(200, {
    task: publicTask(scored),
    ranking: ranking.map(publicTask),
    ...(stranded.length > 0 ? { milestonesStranded: stranded.length, milestonesShifted } : {}),
  });
};
