'use strict';

/**
 * GET /api/users/me — the session bootstrap the frontend calls on load.
 * Returns the profile (never the password hash) and the student's prefs.
 */

const { ok, fail } = require('../../lib/http');
const { getProfile, publicUser } = require('../../lib/dynamo/users');
const { getPrefs } = require('../../lib/dynamo/prefs');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;   // NEVER from body

  const [profile, prefs] = await Promise.all([getProfile(userId), getPrefs(userId)]);
  if (!profile) return fail(404, 'not_found', 'Account not found.');

  return ok(200, { user: publicUser(profile), prefs });
};
