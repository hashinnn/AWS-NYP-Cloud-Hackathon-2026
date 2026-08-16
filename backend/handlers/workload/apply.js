'use strict';

/**
 * POST /api/workload/crash-weeks/{weekStart}/apply — UC-013 step 6.
 * Enacts the recommendation, then rescores so the red cell visibly lightens.
 */

const { ok, fail } = require('../../lib/http');
const { loadRanked, publicTask } = require('../../lib/loadRanked');
const { buildWeeks } = require('../../lib/workload/weeks');
const { recommendForWeek } = require('../../lib/workload/recommend');
const { applyRecommendation } = require('../../lib/workload/apply');
const { putMilestones, getMilestonesForTask } = require('../../lib/dynamo/milestones');
const { saveScores } = require('../../lib/dynamo/tasks');
const score = require('../../lib/scoring');

/** Accepts either the full ISO weekStart or just its `YYYY-MM-DD` prefix. */
function matchWeek(weeks, raw) {
  const wanted = decodeURIComponent(raw || '').slice(0, 10);
  return weeks.findIndex((week) => week.weekStart.slice(0, 10) === wanted);
}

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const now = new Date().toISOString();

  const {
    ranked, milestones, prefs, storedPrefs,
  } = await loadRanked(userId, now);

  const weeks = buildWeeks(ranked, milestones, prefs, now);
  const index = matchWeek(weeks, event.pathParameters.weekStart);
  if (index === -1) return fail(404, 'not_found', 'That week is no longer in your 12-week window.');

  const tasksById = new Map(ranked.map((task) => [task.taskId, task]));
  const recommendation = recommendForWeek(weeks, index, tasksById, prefs);

  const task = recommendation && tasksById.get(recommendation.taskId);
  const result = task
    ? applyRecommendation(
      recommendation,
      task,
      milestones.filter((m) => m.taskId === task.taskId),
      prefs,
      now,
      weeks,
    )
    : null;

  // Alt A / E2 — no capacity anywhere, or nothing that can legitimately move.
  if (!result) {
    return fail(422, 'no_valid_move',
      (recommendation && recommendation.text)
      || 'There is no spare capacity before this week to move work into.');
  }

  await putMilestones(userId, task.taskId, result.milestones);
  const updated = await getMilestonesForTask(userId, task.taskId);

  const rescored = score(ranked, prefs, now);
  await saveScores(userId, rescored);

  const refreshed = milestones
    .filter((m) => m.taskId !== task.taskId)
    .concat(updated);

  return ok(200, {
    milestonesUpdated: updated,
    task: publicTask(task),
    applied: {
      kind: recommendation.kind,
      text: recommendation.text,
      movedHours: result.movedHours || null,
      created: result.created,
    },
    heatmap: buildWeeks(rescored, refreshed, prefs, now),
    ranking: rescored.map(publicTask),
  });
};

module.exports.matchWeek = matchWeek;
