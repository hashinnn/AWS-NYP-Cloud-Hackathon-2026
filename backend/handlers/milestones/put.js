'use strict';

/**
 * PUT /api/tasks/{taskId}/milestones — UC-012 step 6.
 * All-or-nothing: either the whole breakdown is saved or none of it is (E4).
 */

const crypto = require('node:crypto');
const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const { getTask, getAllForUser } = require('../../lib/dynamo/tasks');
const { extractPrefs, scoringPrefs } = require('../../lib/dynamo/prefs');
const { putMilestones } = require('../../lib/dynamo/milestones');
const { scheduleMilestones } = require('../../lib/milestones/generate');

const HOURS_TOLERANCE = 0.1;

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const taskId = event.pathParameters.taskId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.putMilestones);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const task = await getTask(userId, taskId);
  if (!task) return fail(404, 'not_found', 'That task no longer exists.');

  const total = body.milestones.reduce((sum, m) => sum + m.hours, 0);
  const effortHours = Number(task.effortHours);
  if (Number.isFinite(effortHours) && Math.abs(total - effortHours) > HOURS_TOLERANCE) {
    return fail(400, 'hours_mismatch',
      `Milestone hours add up to ${Math.round(total * 10) / 10}, but the task is estimated at ${effortHours}.`);
  }

  const items = await getAllForUser(userId);
  const prefs = scoringPrefs(items, extractPrefs(items));

  // The two hard constraints are re-enforced here as well as at proposal time:
  // an edited row must not land on a blocked day or on the deadline itself.
  const scheduled = scheduleMilestones(
    body.milestones.map((m) => ({ ...m, milestoneId: m.milestoneId || crypto.randomUUID() })),
    task,
    prefs,
    Date.now(),
  );

  try {
    const saved = await putMilestones(userId, taskId, scheduled);
    return ok(201, { milestones: saved });
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', event: 'milestones_write_failed', message: error.message }));
    // E4 — nothing was created; the proposal stays on screen and a retry is offered.
    return fail(503, 'storage_unavailable', 'Could not save the breakdown — please try again.');
  }
};
