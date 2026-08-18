'use strict';

/**
 * API Gateway response helpers — HLD §6.1.
 */

// Exactly FRONTEND_URL, never '*' (AGENTS §13).
function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:5173',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  };
}

/** Success. Always returns the affected resource, never `{ok: true}`. */
function ok(status, body) {
  return {
    statusCode: status,
    headers: corsHeaders(),
    body: body === undefined ? '' : JSON.stringify(body),
  };
}

/**
 * Failure. `{code, message}` — the frontend branches on `code` (HLD §6.3).
 *
 * `extra` carries the payload a *soft* failure needs to be actionable: the
 * only one today is `duplicate_suspected`, which HLD §6.2 requires to include
 * the `existing` task so the student can choose "Open existing" over "Create
 * anyway". Never use it to smuggle a second error shape.
 */
function fail(status, code, message, extra) {
  return {
    statusCode: status,
    headers: corsHeaders(),
    body: JSON.stringify({ code, message, ...extra }),
  };
}

module.exports = { ok, fail, corsHeaders };
