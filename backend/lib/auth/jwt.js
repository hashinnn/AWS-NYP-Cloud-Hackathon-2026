'use strict';

/**
 * Token signing and verification — UC-001, HLD §10.1.
 *
 * HS256, 24 h, `sub = userId`. Self-managed rather than Cognito, which is
 * frequently unavailable in the AWS Academy Learner Lab (AGENTS §4).
 */

const jwt = require('jsonwebtoken');

const TTL_SECONDS = 24 * 60 * 60;

// UC-001 E3 — how long past expiry a token may still be exchanged for a fresh
// one. Without a window, the "silent refresh" the frontend attempts on a 401
// could only ever succeed for a token that had not actually expired, which is
// the one case where it is not needed.
const REFRESH_GRACE_SECONDS = 24 * 60 * 60;

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not set');
  return value;
}

function sign(user) {
  return jwt.sign(
    { sub: user.userId, email: user.email },
    secret(),
    { algorithm: 'HS256', expiresIn: TTL_SECONDS },
  );
}

/**
 * @returns {{userId: string, email: string}}
 * @throws {jsonwebtoken.JsonWebTokenError} invalid signature, malformed, expired
 */
function verify(token) {
  const payload = jwt.verify(token, secret(), { algorithms: ['HS256'] });
  return { userId: payload.sub, email: payload.email };
}

/**
 * Verify a token that may have expired, for the refresh endpoint only.
 * Signature is still checked — only the expiry claim is relaxed, and only
 * within the grace window.
 *
 * @returns {{userId, email} | null} null when the token is too old to renew
 */
function verifyForRefresh(token) {
  const payload = jwt.verify(token, secret(), {
    algorithms: ['HS256'],
    ignoreExpiration: true,
  });

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp && nowSeconds > payload.exp + REFRESH_GRACE_SECONDS) return null;

  return { userId: payload.sub, email: payload.email };
}

/** Pull the token out of an `Authorization: Bearer <jwt>` header. */
function bearer(header) {
  const match = /^Bearer\s+(.+)$/i.exec(String(header || '').trim());
  return match ? match[1] : null;
}

module.exports = {
  sign, verify, verifyForRefresh, bearer, TTL_SECONDS,
};
