'use strict';

/**
 * GET /api/feed/{token}.ics — UC-023 Alt A. **Public route, no JWT.**
 *
 * The token IS the credential, which is why it is 24 random bytes, why it is
 * revocable from settings, and why an unknown token gets a flat 404 with no
 * hint about whether it ever existed.
 *
 * `userId` still never comes from the request: the token is exchanged for it
 * through a keyed lookup, and every read below is partition-scoped as usual.
 */

const { fail } = require('../../lib/http');
const { userIdForToken } = require('../../lib/dynamo/feed');
const { getAllForUser, extractTasks } = require('../../lib/dynamo/tasks');
const { extractMilestones } = require('../../lib/dynamo/milestones');
const { extractPrefs, scoringPrefs } = require('../../lib/dynamo/prefs');
const { selectForExport } = require('../../lib/export/scope');
const { buildIcs } = require('../../lib/export/ics');

exports.handler = async (event) => {
  const raw = (event.pathParameters || {}).token || '';
  const token = decodeURIComponent(raw).replace(/\.ics$/i, '');
  const now = new Date().toISOString();

  try {
    const userId = await userIdForToken(token);
    if (!userId) return fail(404, 'not_found', 'This calendar feed is no longer available.');

    const items = await getAllForUser(userId);
    const prefs = scoringPrefs(items, extractPrefs(items));
    const { tasks, milestones } = selectForExport(
      extractTasks(items),
      extractMilestones(items),
      { scope: 'all', includeMilestones: true },
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        // A subscribing calendar polls this on its own schedule; a cached
        // response would show yesterday's deadlines.
        'Cache-Control': 'no-cache',
      },
      body: buildIcs(tasks, milestones, {
        leadTimes: prefs.leadTimes,
        now,
        calendarName: 'DeadlineIQ',
      }),
    };
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'feed_failed', message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'The calendar feed is temporarily unavailable.');
  }
};
