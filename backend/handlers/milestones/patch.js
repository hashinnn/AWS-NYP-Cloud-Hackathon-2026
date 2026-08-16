'use strict';

/**
 * PATCH /api/tasks/{taskId}/milestones/{id} — UC-012 step 7.
 *
 * Ticking a milestone drives the parent's progressPct, which feeds
 * ProgressDeficit, which changes the ranking. The whole active set is rescored
 * because that is the only correct thing to do (ClashPenalty is cross-task).
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const {
  getMilestonesForTask, patchMilestone,
} = require('../../lib/dynamo/milestones');
const { patchTask, saveScores } = require('../../lib/dynamo/tasks');
const { loadRanked, publicTask } = require('../../lib/loadRanked');
const score = require('../../lib/scoring');

/** Completed milestone hours as a share of the whole breakdown. */
function progressFromMilestones(milestones) {
  const total = milestones.reduce((sum, m) => sum + (Number(m.hours) || 0), 0);
  if (!(total > 0)) return null;
  const done = milestones
    .filter((m) => m.completedAt)
    .reduce((sum, m) => sum + (Number(m.hours) || 0), 0);
  return Math.round((done / total) * 100);
}

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const { taskId, id: milestoneId } = event.pathParameters;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.patchMilestone);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  let milestone;
  try {
    milestone = await patchMilestone(userId, taskId, milestoneId, body);
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      return fail(404, 'not_found', 'That milestone no longer exists.');
    }
    throw error;
  }

  const siblings = await getMilestonesForTask(userId, taskId);
  const progressPct = progressFromMilestones(siblings);

  const now = new Date().toISOString();
  const task = progressPct === null
    ? null
    : await patchTask(userId, taskId, {
      progressPct,
      ...(progressPct === 100 ? { status: 'completed', completedAt: now } : {}),
    });

  const { tasks, prefs } = await loadRanked(userId, now);
  const ranked = score(tasks, prefs, now);
  await saveScores(userId, ranked);

  return ok(200, {
    milestone,
    task: task ? publicTask(task) : null,
    ranking: ranked.map(publicTask),
  });
};
