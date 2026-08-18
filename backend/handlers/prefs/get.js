'use strict';

/**
 * GET /api/prefs — UC-004. Class A read.
 * Defaults are merged in by the access layer, so a student who never opened
 * Setup still gets a complete, usable prefs object (Alt A).
 */

const { ok } = require('../../lib/http');
const { getPrefs } = require('../../lib/dynamo/prefs');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const prefs = await getPrefs(userId);

  const { PK, SK, ...rest } = prefs;
  return ok(200, { prefs: rest });
};
