'use strict';

/**
 * POST /api/export/feed-token — UC-023 Alt A.
 *
 * Issues (or revokes) the tokenised URL an external calendar can poll, so
 * changes in DeadlineIQ propagate without the student re-exporting anything.
 */

const { ok, fail } = require('../../lib/http');
const { getProfile } = require('../../lib/dynamo/users');
const { issueToken, revokeToken } = require('../../lib/dynamo/feed');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const body = JSON.parse(event.body || '{}');

  try {
    const profile = await getProfile(userId);
    const existing = profile && profile.feedToken;

    if (body.revoke) {
      await revokeToken(userId, existing);
      return ok(200, { feedUrl: null, revoked: true });
    }

    const token = await issueToken(userId, existing);
    const base = process.env.API_BASE_URL || '';

    return ok(200, {
      feedUrl: `${base}/api/feed/${token}.ics`,
      // The path alone is enough for a client that knows its own API base;
      // the absolute URL is what the student pastes into Google Calendar.
      feedPath: `/api/feed/${token}.ics`,
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'feed_token_failed', message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'Could not update your calendar feed — please retry.');
  }
};
