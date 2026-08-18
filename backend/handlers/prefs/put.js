'use strict';

/**
 * PUT /api/prefs — UC-004 steps 6–7. Class B write: no LLM on this path.
 *
 * Availability is a direct input to EffortPressure, so changing it rescores
 * the whole active set immediately and returns the new ranking. That return
 * value is what lets the UI name the consequence of the setting (step 8)
 * instead of leaving the student to notice it.
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const { getAllForUser, rankedTasks, saveScores } = require('../../lib/dynamo/tasks');
const { getPrefs, patchPrefs, scoringPrefs } = require('../../lib/dynamo/prefs');
const { publicTask } = require('../../lib/loadRanked');
const score = require('../../lib/scoring');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;   // NEVER from body
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.putPrefs);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const changes = {};
  if (body.availability) {
    // Merged over what is stored, so sending one slider does not blank the
    // other six days.
    const current = await getPrefs(userId);
    changes.availability = { ...current.availability, ...body.availability };
  }
  if (body.blockedDates) changes.blockedDates = [...new Set(body.blockedDates)].sort();

  if (Object.keys(changes).length === 0) {
    return fail(400, 'validation_failed', 'Nothing to change.');
  }

  // Alt A → this is what tells the ranking the student has actually set their
  // hours, rather than silently inheriting the defaults. Without it there is
  // no way to distinguish "3 hours because I said so" from "3 hours because
  // nobody asked me", and the EffortPressure hint could never be targeted.
  changes.availabilitySetAt = new Date().toISOString();

  let stored;
  try {
    stored = await patchPrefs(userId, changes);
  } catch (error) {
    // E3 — the client reverts its sliders to the last persisted values.
    console.error(JSON.stringify({
      level: 'ERROR', event: 'prefs_save_failed', userId, message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'Settings could not be saved.');
  }

  // E2 — allowed, but never silently. Every task would be flagged impossible.
  const warnings = [];
  const total = Object.values(stored.availability || {})
    .reduce((sum, value) => sum + (Number(value) || 0), 0);
  if (total === 0) {
    warnings.push({
      code: 'no_availability',
      message: 'With no study hours, every task will be flagged as impossible — set at least some availability.',
    });
  }

  const now = new Date().toISOString();
  let ranking = [];
  try {
    const items = await getAllForUser(userId);
    const ranked = score(rankedTasks(items), scoringPrefs(items, stored), now);
    await saveScores(userId, ranked);
    ranking = ranked;
  } catch (error) {
    // The setting is saved either way; the hourly recompute catches up.
    console.error(JSON.stringify({
      level: 'ERROR', event: 'scoring_failed_on_prefs', userId, message: error.message,
    }));
  }

  const { PK, SK, ...prefs } = stored;
  return ok(200, { prefs, ranking: ranking.map(publicTask), warnings });
};
