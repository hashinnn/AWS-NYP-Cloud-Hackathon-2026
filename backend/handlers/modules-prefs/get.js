'use strict';

// GET /api/prefs — UC-004. Class A read.

const { ok, fail } = require('../../lib/http');
const { getPrefs, publicPrefs } = require('../../lib/dynamo/prefs');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;

  try {
    // getPrefs merges DEFAULT_PREFS underneath, so a student who skipped
    // setup (Alt A) still gets a complete object rather than a 404.
    return ok(200, { prefs: publicPrefs(await getPrefs(userId)) });
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', event: 'prefs_read_failed', message: error.message }));
    return fail(503, 'storage_unavailable', 'Could not load your settings — please retry.');
  }
};
