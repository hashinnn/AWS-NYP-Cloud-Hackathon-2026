'use strict';

/**
 * POST /api/workload/crash-weeks/{weekStart}/dismiss — UC-013 step 7.
 * Suppresses that week's card for 48 hours.
 *
 * NOTE for the team: this persists a `crashDismissals` map on the PREFS item
 * ({ '<weekStart ISO>': '<dismissedAt ISO>' }). It is the only field this
 * track adds to the documented data model (HLD §5.3.2) — chosen over a new
 * item type because it needs no new key pattern and no second query.
 */

const { ok, fail } = require('../../lib/http');
const { getPrefs, patchPrefs } = require('../../lib/dynamo/prefs');
const { DISMISS_WINDOW_MS } = require('../../lib/workload/recommend');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const weekStart = decodeURIComponent(event.pathParameters.weekStart || '');
  if (!weekStart) return fail(400, 'validation_failed', 'weekStart is required.');

  const now = Date.now();
  const prefs = await getPrefs(userId);
  const existing = prefs.crashDismissals || {};

  // Drop expired entries on the way through so the map cannot grow forever.
  const kept = Object.fromEntries(Object.entries(existing)
    .filter(([, at]) => now - Date.parse(at) < DISMISS_WINDOW_MS));

  await patchPrefs(userId, {
    crashDismissals: { ...kept, [weekStart]: new Date(now).toISOString() },
  });

  return ok(204);
};
