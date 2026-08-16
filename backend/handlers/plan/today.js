'use strict';

// GET /api/plan/today — UC-014. Class A read: allocation only, no model call.

const { ok, fail } = require('../../lib/http');
const { loadRanked } = require('../../lib/loadRanked');
const { planToday } = require('../../lib/plan/allocate');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const now = new Date().toISOString();

  try {
    const {
      ranked, milestones, prefs, weights,
    } = await loadRanked(userId, now);

    return ok(200, { ...planToday(ranked, milestones, prefs, now, weights), computedAt: now });
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', event: 'plan_failed', message: error.message }));
    return fail(503, 'storage_unavailable', 'Could not build today’s plan — please retry.');
  }
};
