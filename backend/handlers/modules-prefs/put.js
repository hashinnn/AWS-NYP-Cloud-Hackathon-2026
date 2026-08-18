'use strict';

/**
 * PUT /api/prefs — UC-004 steps 6–8.
 *
 * Availability is a direct input to EffortPressure, so step 7 rescores the
 * whole active set here rather than waiting for the hourly job — that is what
 * makes the heatmap re-shade under the student's hand in UC-018 Alt B.
 * Class B write: no model call anywhere on this path.
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const {
  patchPrefs, publicPrefs, scoringPrefs, extractPrefs,
} = require('../../lib/dynamo/prefs');
const { getAllForUser, rankedTasks, saveScores } = require('../../lib/dynamo/tasks');
const { publicTask } = require('../../lib/loadRanked');
const score = require('../../lib/scoring');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.putPrefs);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const changes = {};
  if (body.blockedDates) changes.blockedDates = body.blockedDates;

  const items = await getAllForUser(userId);
  const stored = extractPrefs(items);

  // A partial availability object patches the days it names and leaves the
  // rest alone — dragging Thursday must not silently zero Sunday.
  if (body.availability) {
    changes.availability = { ...stored.availability, ...body.availability };
  }

  if (Object.keys(changes).length === 0) {
    return ok(200, { prefs: publicPrefs(stored), ranking: [], warnings: [] });
  }

  const warnings = [];
  const hours = Object.values(changes.availability || stored.availability || {});
  // E2 — allowed, but never silently: with no hours every task scores as
  // impossible, and a student who sees that without warning assumes a bug.
  if (hours.length > 0 && hours.every((h) => Number(h) === 0)) {
    warnings.push({
      code: 'no_availability',
      message: 'With no study hours, every task will be flagged as impossible — set at least some availability.',
    });
  }

  let prefs;
  try {
    prefs = await patchPrefs(userId, changes);
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', event: 'prefs_write_failed', message: error.message }));
    // E3 — the frontend reverts the sliders to their last persisted values.
    return fail(503, 'storage_unavailable', 'Settings could not be saved.');
  }

  // Step 7 — rescore. A failure here costs the ranking's freshness, never the
  // setting itself: the hourly recompute picks it up.
  let ranking = [];
  try {
    const now = new Date().toISOString();
    const ranked = score(rankedTasks(items), scoringPrefs(items, prefs), now);
    await saveScores(userId, ranked);
    ranking = ranked;
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', event: 'rescore_after_prefs_failed', message: error.message }));
  }

  return ok(200, { prefs: publicPrefs(prefs), ranking: ranking.map(publicTask), warnings });
};
