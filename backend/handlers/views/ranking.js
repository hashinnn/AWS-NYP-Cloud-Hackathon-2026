'use strict';

// GET /api/ranking — UC-009 [H-04]. Class A read: no LLM on this path.

const { ok, fail } = require('../../lib/http');
const { loadRanked, publicTask } = require('../../lib/loadRanked');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const limit = Number((event.queryStringParameters || {}).limit) || 0;
  const now = new Date().toISOString();

  try {
    const { ranked, weights } = await loadRanked(userId, now);
    const list = limit > 0 ? ranked.slice(0, limit) : ranked;

    return ok(200, {
      ranking: list.map(publicTask),
      computedAt: now,
      weights,
    });
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', event: 'ranking_failed', message: error.message }));
    // The client falls back to deadline order with a banner (UC-016 E1).
    return fail(503, 'scoring_unavailable', 'Live prioritisation is unavailable — showing deadline order.');
  }
};
