'use strict';

// GET /api/completed — UC-022 [Z-08]. Class A read.

const { ok, fail } = require('../../lib/http');
const { getAllForUser, extractTasks } = require('../../lib/dynamo/tasks');
const { extractPrefs, scoringPrefs } = require('../../lib/dynamo/prefs');
const { completedView, effortHint } = require('../../lib/completed/stats');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const now = new Date().toISOString();

  try {
    const items = await getAllForUser(userId);
    const prefs = scoringPrefs(items, extractPrefs(items));
    const view = completedView(extractTasks(items), prefs, now);

    return ok(200, {
      ...view,
      // Step 4 — the same figure UC-002 offers at creation time, so the two
      // screens can never quote different numbers at the student.
      hint: effortHint(view.stats, null),
      computedAt: now,
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'completed_failed', message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'Could not load your completed tasks — please retry.');
  }
};
