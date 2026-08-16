'use strict';

// GET /api/workload/crash-weeks — UC-013. Class A read.

const { ok, fail } = require('../../lib/http');
const { loadRanked } = require('../../lib/loadRanked');
const { buildWeeks } = require('../../lib/workload/weeks');
const { crashWeeks } = require('../../lib/workload/recommend');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const now = new Date().toISOString();

  try {
    const { ranked, milestones, prefs, storedPrefs } = await loadRanked(userId, now);
    const weeks = buildWeeks(ranked, milestones, prefs, now);

    return ok(200, {
      crashWeeks: crashWeeks(weeks, ranked, prefs, storedPrefs.crashDismissals, now),
      computedAt: now,
    });
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', event: 'crash_weeks_failed', message: error.message }));
    return fail(503, 'storage_unavailable', 'Could not load your workload — please retry.');
  }
};
