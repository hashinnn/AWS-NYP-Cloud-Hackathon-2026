'use strict';

/**
 * PATCH /api/tasks/{taskId} — UC-003. Class B write: no LLM on this path.
 *
 * Returns the full `ranking[]` on every successful edit, because a deadline
 * change alters the ClashPenalty of tasks the student did not touch — a
 * single-task rescore would be quietly wrong (step 5).
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./patchSchema');
const {
  getAllForUser, getTask, patchTask, rankedTasks, saveScores,
} = require('../../lib/dynamo/tasks');
const { extractPrefs, scoringPrefs } = require('../../lib/dynamo/prefs');
const { extractMilestones, putMilestones } = require('../../lib/dynamo/milestones');
const { normaliseCode } = require('../../lib/dynamo/modules');
const { scheduleMilestones } = require('../../lib/milestones/generate');
const { resolveDueAt } = require('../../lib/tasks/dueAt');
const { publicTask } = require('../../lib/loadRanked');
const score = require('../../lib/scoring');

// Step 5 — the five fields that feed a sub-score. Editing a title moves
// nothing, so it does not earn a rescore or a stale explanation.
const RESCORE_TRIGGERS = ['dueAt', 'effortHours', 'gradeWeight', 'prepDays', 'progressPct'];

const EDITABLE = [
  'title', 'type', 'dueAt', 'module', 'gradeWeight', 'effortHours',
  'prepDays', 'progressPct', 'isGroup', 'blockedOnTeammate', 'notes', 'status',
];

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;   // NEVER from body
  const taskId = event.pathParameters.taskId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.patchTask);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const existing = await getTask(userId, taskId);
  // 404 rather than 403 for another student's task — a 403 would confirm it
  // exists (AGENTS §8).
  if (!existing) return fail(404, 'not_found', 'That task no longer exists.');

  const items = await getAllForUser(userId);
  const prefs = scoringPrefs(items, extractPrefs(items));

  const changes = {};
  for (const field of EDITABLE) {
    if (body[field] !== undefined) changes[field] = body[field];
  }

  if (changes.module) changes.module = normaliseCode(changes.module);

  if (changes.dueAt !== undefined) {
    const resolved = resolveDueAt(changes.dueAt, prefs.tz);
    if (!resolved) return fail(400, 'validation_failed', 'That deadline is not a date we can read.');
    changes.dueAt = resolved;
    // GSI1 is the deadline index — leaving it behind would rank this task at
    // its old due date in every window query.
    changes.GSI1SK = `DUE#${resolved}`;
  }

  const now = new Date().toISOString();

  if (changes.status === 'completed' && existing.status !== 'completed') {
    changes.completedAt = now;
    changes.lateSubmission = Date.parse(existing.dueAt) < Date.parse(now);
  }
  // Step 9 — restoring clears the completion, so an accidental tick is fully
  // reversible rather than leaving a stale completedAt behind.
  if (changes.status === 'active') {
    changes.completedAt = null;
    changes.overdueSince = null;
  }

  const moved = RESCORE_TRIGGERS.filter((field) => changes[field] !== undefined
    && changes[field] !== existing[field]);
  if (moved.length > 0) changes.explanationStale = true;

  if (Object.keys(changes).length === 0) {
    return ok(200, { task: publicTask(existing), ranking: [], warnings: [] });
  }

  let updated;
  try {
    updated = await patchTask(userId, taskId, changes, body.expectedUpdatedAt);
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      // E2 — two tabs. Refuse rather than overwrite, and say which it was:
      // the row is gone, or somebody else moved it.
      const still = await getTask(userId, taskId);
      return still
        ? fail(409, 'stale_write', 'This task changed in another tab — reload to see the latest.')
        : fail(404, 'not_found', 'That task no longer exists.');
    }
    console.error(JSON.stringify({
      level: 'ERROR', event: 'task_patch_failed', taskId, message: error.message,
    }));
    // E1 — nothing was written; the field reverts and the student retries.
    return fail(503, 'storage_unavailable', 'That change could not be saved — please try again.');
  }

  const warnings = [];
  const milestones = extractMilestones(items).filter((m) => m.taskId === taskId);

  // Alt A — a deadline pulled earlier can strand milestones after it.
  const stranded = changes.dueAt
    ? milestones.filter((m) => Date.parse(m.dueAt) >= Date.parse(changes.dueAt))
    : [];

  if (stranded.length > 0 && body.shiftMilestones) {
    // Re-running the scheduler rescales the whole breakdown into the new
    // window and re-applies the one-day buffer and the blocked-day rule, so
    // an edited deadline cannot produce a milestone the generator would
    // never have proposed.
    const rescheduled = scheduleMilestones(
      milestones.map((m) => ({ ...m, dueAt: updated.dueAt })),
      updated,
      prefs,
      Date.now(),
    );
    try {
      await putMilestones(userId, taskId, rescheduled);
    } catch (error) {
      console.error(JSON.stringify({
        level: 'ERROR', event: 'milestone_shift_failed', taskId, message: error.message,
      }));
      warnings.push({ code: 'milestones_not_shifted', message: 'The deadline moved, but the milestone dates could not be updated.' });
    }
  } else if (stranded.length > 0) {
    warnings.push({
      code: 'milestones_outside_window',
      message: `${stranded.length} milestone${stranded.length === 1 ? '' : 's'} now fall on or after the new deadline — shift them?`,
    });
  }

  // Step 5 — the whole active set, not just this task.
  let ranking = [];
  let scored = updated;
  try {
    const active = rankedTasks(items)
      .filter((task) => task.taskId !== taskId)
      .concat(['active', 'overdue'].includes(updated.status) ? [updated] : []);
    const ranked = score(active, prefs, now);
    await saveScores(userId, ranked);
    scored = ranked.find((task) => task.taskId === taskId) || updated;
    ranking = ranked;
  } catch (error) {
    // E4 — the edit is committed either way; the task carries a "score
    // pending" badge until the next recompute.
    console.error(JSON.stringify({
      level: 'ERROR', event: 'rescore_after_patch_failed', taskId, message: error.message,
    }));
  }

  return ok(200, { task: publicTask(scored), ranking: ranking.map(publicTask), warnings });
};
