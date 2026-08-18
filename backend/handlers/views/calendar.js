'use strict';

// GET /api/calendar?from=&to=&view=week|month|timeline — UC-017 [Z-04].
// Class A read: positions and spans only, no model call.

const { ok, fail } = require('../../lib/http');
const { loadRanked } = require('../../lib/loadRanked');
const { calendarView } = require('../../lib/views/calendar');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const query = event.queryStringParameters || {};
  const now = new Date().toISOString();

  try {
    const { ranked, milestones, prefs } = await loadRanked(userId, now);

    return ok(200, {
      view: query.view || 'week',
      ...calendarView(ranked, milestones, prefs, now, { from: query.from, to: query.to }),
      computedAt: now,
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'calendar_failed', message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'Could not load your calendar — please retry.');
  }
};
