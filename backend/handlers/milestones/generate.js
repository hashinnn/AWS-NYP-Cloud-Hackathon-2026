'use strict';

/**
 * POST /api/tasks/{taskId}/milestones/generate — UC-012.
 *
 * Returns a PROPOSAL. Nothing is written: every AI output in this system is
 * something the student confirms, never something the model commits.
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const { getTask, getAllForUser } = require('../../lib/dynamo/tasks');
const { extractPrefs, scoringPrefs } = require('../../lib/dynamo/prefs');
const { chat, isConfigured, AiUnavailable } = require('../../lib/ai/client');
const { extractJson } = require('../../lib/ai/validate');
const prompt = require('../../lib/ai/prompts/milestones');
const {
  proposeFromTemplate, proposeFromModel, isTooSmall, MIN_BREAKDOWN_HOURS,
} = require('../../lib/milestones/generate');
const { localDateKey } = require('../../lib/scoring/availability');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const taskId = event.pathParameters.taskId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.generateMilestones);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const task = await getTask(userId, taskId);
  // 404 for another student's task too — existence is never leaked.
  if (!task) return fail(404, 'not_found', 'That task no longer exists.');

  // Alt B — decline gracefully rather than manufacturing artificial steps.
  if (isTooSmall(task)) {
    return fail(422, 'task_too_small',
      `This one's small enough to do in a single session (under ${MIN_BREAKDOWN_HOURS} hours).`);
  }

  const items = await getAllForUser(userId);
  const prefs = scoringPrefs(items, extractPrefs(items));
  const nowMs = Date.now();
  const deliverables = body.deliverables || [];

  if (isConfigured()) {
    try {
      const raw = await chat(prompt.buildMessages({
        title: task.title,
        type: task.type,
        effortHours: task.effortHours,
        dueAt: task.dueAt,
        today: localDateKey(nowMs, prefs.tz),
        availability: prefs.availability,
        deliverables,
      }), { maxTokens: 500 });

      const parsed = extractJson(raw);
      if (prompt.isValidShape(parsed)) {
        // Model output goes through exactly the same constraint pipeline as
        // the template — the buffer day and blocked days are enforced in code.
        return ok(200, {
          proposed: proposeFromModel(parsed.milestones, task, prefs, nowMs),
          source: 'ai',
        });
      }
      console.warn(JSON.stringify({ level: 'WARN', event: 'milestones_bad_shape', taskId }));
    } catch (error) {
      if (!(error instanceof AiUnavailable)) throw error;
      console.warn(JSON.stringify({
        level: 'WARN', event: 'milestones_unavailable', reason: error.reason,
      }));
    }
  }

  // E1 — the deterministic breakdown by task type.
  return ok(200, {
    proposed: proposeFromTemplate(task, prefs, nowMs, deliverables),
    source: 'template',
  });
};
