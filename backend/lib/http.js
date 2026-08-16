'use strict';

/**
 * API Gateway response helpers — HLD §6.1.
 *
 * PROVISIONAL: this file belongs to Philena's [P-02]. Written here only so the
 * Intelligence handlers can be built and tested before P-02 lands. Replace or
 * reconcile freely — the shapes below are taken straight from the HLD.
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

/** Failure. `{code, message}` — the frontend branches on `code` (HLD §6.3). */
function fail(status, code, message) {
  return {
    statusCode: status,
    headers: corsHeaders(),
    body: JSON.stringify({ code, message }),
  };
}

module.exports = { ok, fail, corsHeaders };
