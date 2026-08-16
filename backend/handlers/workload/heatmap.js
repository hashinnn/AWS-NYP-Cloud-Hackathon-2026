'use strict';

// GET /api/workload/heatmap?weeks=12 — UC-018. Class A read.

const { ok, fail } = require('../../lib/http');
const { loadRanked } = require('../../lib/loadRanked');
const { buildWeeks, DEFAULT_WEEK_COUNT } = require('../../lib/workload/weeks');
const { crashWeeks } = require('../../lib/workload/recommend');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const requested = Number((event.queryStringParameters || {}).weeks);
  const weekCount = Number.isFinite(requested) && requested > 0 && requested <= 26
    ? Math.floor(requested)
    : DEFAULT_WEEK_COUNT;
  const now = new Date().toISOString();

  try {
    const { ranked, milestones, prefs, storedPrefs } = await loadRanked(userId, now);
    const weeks = buildWeeks(ranked, milestones, prefs, now, weekCount);

    return ok(200, {
      weeks,
      crashWeeks: crashWeeks(weeks, ranked, prefs, storedPrefs.crashDismissals, now),
      // UC-018 Alt A — the frontend explains an empty grid instead of showing
      // a misleadingly green one.
      sparse: ranked.filter((task) => task.status === 'active').length < 3,
      computedAt: now,
    });
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', event: 'heatmap_failed', message: error.message }));
    return fail(503, 'storage_unavailable', 'Could not load your workload — please retry.');
  }
};
