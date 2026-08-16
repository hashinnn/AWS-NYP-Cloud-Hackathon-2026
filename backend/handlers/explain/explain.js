'use strict';

/**
 * POST /api/explain — UC-010.
 *
 * This endpoint NEVER returns an error. If the model is unavailable it returns
 * template sentences with `source: 'template'` and the UI is byte-identical.
 * That is the single clearest expression of the thesis in the API surface.
 */

const { ok } = require('../../lib/http');
const { loadRanked } = require('../../lib/loadRanked');
const { explainTask } = require('../../lib/explain/generate');
const { templateSentence } = require('../../lib/explain/template');
const { buildPayload, explanationHash, contributions } = require('../../lib/explain/contributions');
const { patchTask } = require('../../lib/dynamo/tasks');
const { toMs } = require('../../lib/scoring/availability');

const MAX_BATCH = 10; // free-tier discipline: never fan out further than the UI shows

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const body = JSON.parse(event.body || '{}');
  const requested = Array.isArray(body.taskIds) ? body.taskIds.slice(0, MAX_BATCH) : [];
  const nowMs = toMs(new Date());

  let context;
  try {
    context = await loadRanked(userId, nowMs);
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', event: 'explain_load_failed', message: error.message }));
    return ok(200, { explanations: {} });
  }

  const { ranked, prefs, weights, rankOf } = context;
  const scored = ranked.filter((task) => task.subScores);
  const wanted = requested.length > 0
    ? scored.filter((task) => requested.includes(task.taskId))
    : scored.slice(0, 5);

  const explanations = {};

  await Promise.all(wanted.map(async (task) => {
    try {
      const result = await explainTask(task, scored, prefs, weights, nowMs, rankOf(task));
      explanations[task.taskId] = {
        text: result.text,
        source: result.source,
        contributions: result.contributions,
      };

      // UC-010 step 6 — persist against the sub-score state it was written for.
      if (!result.cached) {
        await patchTask(userId, task.taskId, {
          explanation: result.text,
          explanationHash: result.hash,
          explanationSource: result.source,
          explanationStale: false,
        }).catch((error) => {
          // A cache write failing must not cost the student their sentence.
          console.warn(JSON.stringify({
            level: 'WARN', event: 'explanation_persist_failed', message: error.message,
          }));
        });
      }
    } catch (error) {
      // Absolute last resort — still return a sentence built from the numbers.
      console.warn(JSON.stringify({
        level: 'WARN', event: 'explain_fell_back', taskId: task.taskId, message: error.message,
      }));
      const payload = buildPayload(task, scored, prefs, weights, nowMs, rankOf(task));
      explanations[task.taskId] = {
        text: templateSentence(payload),
        source: 'template',
        contributions: contributions(task.subScores || {}, weights),
        hash: explanationHash(task.subScores, weights),
      };
    }
  }));

  return ok(200, { explanations });
};
