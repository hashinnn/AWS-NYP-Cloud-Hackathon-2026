'use strict';

/**
 * PUT /api/prefs/weights — UC-015 step 7.
 *
 * The live preview happens entirely client-side from the persisted sub-scores;
 * this endpoint exists only to make that preview permanent. Class B write —
 * no model call anywhere near it.
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const score = require('../../lib/scoring');
const { normaliseWeights } = require('../../lib/scoring/normalise');
const { patchPrefs } = require('../../lib/dynamo/prefs');
const { saveScores } = require('../../lib/dynamo/tasks');
const { loadRanked, publicTask } = require('../../lib/loadRanked');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.putWeights);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const weights = normaliseWeights(body.weights);
  const now = new Date().toISOString();

  try {
    const { tasks, prefs } = await loadRanked(userId, now);
    await patchPrefs(userId, { weights });

    // New weights, same sub-scores: the ranking changes, the maths does not.
    const ranked = score(tasks, { ...prefs, weights }, now);
    await saveScores(userId, ranked);

    return ok(200, { weights, ranking: ranked.map(publicTask) });
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', event: 'weights_save_failed', message: error.message }));
    // UC-015 E1 — the sliders revert; the preview is never treated as saved.
    return fail(503, 'storage_unavailable', 'Could not save your weightings — please try again.');
  }
};
