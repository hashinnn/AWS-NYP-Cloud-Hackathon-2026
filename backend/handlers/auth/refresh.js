'use strict';

/**
 * POST /api/auth/refresh — UC-001 E3, the silent refresh the frontend attempts
 * before it gives up and redirects to sign-in.
 *
 * Routed OUTSIDE the authoriser on purpose: an expired token is precisely the
 * input this endpoint exists to accept, and the authoriser would reject it
 * before the handler ran. The signature is still verified here — only the
 * expiry claim is relaxed, and only inside the grace window (lib/auth/jwt.js).
 */

const { ok, fail } = require('../../lib/http');
const { bearer, verifyForRefresh, sign } = require('../../lib/auth/jwt');

const EXPIRED = () => fail(401, 'token_expired', 'Your session has expired — please sign in again.');

/** API Gateway REST preserves the client's header casing, so match either. */
function authorizationHeader(headers) {
  const found = Object.keys(headers || {}).find((key) => key.toLowerCase() === 'authorization');
  return found ? headers[found] : null;
}

exports.handler = async (event) => {
  const token = bearer(authorizationHeader(event.headers));
  if (!token) return EXPIRED();

  let user;
  try {
    user = verifyForRefresh(token);
  } catch (error) {
    return EXPIRED();
  }
  if (!user) return EXPIRED();

  return ok(200, { token: sign(user) });
};
