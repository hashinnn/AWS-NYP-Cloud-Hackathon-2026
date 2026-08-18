'use strict';

/**
 * POST /api/parse — UC-005.
 *
 * Returns a PROPOSAL only: fields, per-field confidence, and the source
 * phrase each one came from. Nothing is written here — the student confirms
 * on the review card, then the real write goes through POST /api/tasks
 * (Philena's UC-002). Class C: 6 s AI budget, then the deterministic path
 * takes over — this endpoint never fails purely because the model is down.
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const { chat, isConfigured, AiUnavailable } = require('../../lib/ai/client');
const { extractJson } = require('../../lib/ai/validate');
const prompt = require('../../lib/ai/prompts/parse');
const { parseDeterministic, hasMultipleDueDates } = require('../../lib/parse/deterministic');
const { toApiShape, isEmptyResult, withSmartDefaults } = require('../../lib/parse/fields');
const { existingModuleCodes } = require('../../lib/parse/context');

const TZ = 'Asia/Singapore';

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.quickParse);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const text = body.text.trim();
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  const moduleCodes = await existingModuleCodes(userId);
  let fields = null;
  let degraded = true;

  if (isConfigured()) {
    try {
      const raw = await chat(prompt.buildMessages({
        text, now, tz: TZ, moduleCodes,
      }), { maxTokens: 400 });

      const parsed = extractJson(raw);
      if (prompt.isValidShape(parsed)) {
        fields = parsed;
        degraded = false;
      } else {
        console.warn(JSON.stringify({ level: 'WARN', event: 'parse_bad_shape' }));
      }
    } catch (error) {
      if (!(error instanceof AiUnavailable)) throw error;
      console.warn(JSON.stringify({ level: 'WARN', event: 'parse_ai_unavailable', reason: error.reason }));
    }
  }

  // Alt B — model unavailable, rate-limited, timed out, or returned garbage.
  if (!fields) fields = parseDeterministic(text, { now: nowMs, moduleCodes });

  fields = withSmartDefaults(fields);

  if (isEmptyResult(fields)) {
    return fail(422, 'unparseable',
      "I couldn't find a task in that — try 'IT2214 report due Friday 11:59pm'.");
  }

  const response = toApiShape(fields, { degraded });

  // E4 — a resolved date already in the past never gets silently accepted.
  // Checked generically because the AI path's dueAt carries no `isPast` flag
  // of its own (the model is never asked to grade its own answer).
  const dueAtMs = fields.dueAt.value ? Date.parse(fields.dueAt.value) : NaN;
  if (Number.isFinite(dueAtMs) && dueAtMs < nowMs) {
    response.confidence.dueAt = Math.min(response.confidence.dueAt ?? 0.5, 0.4);
    response.pastDeadline = true;
  }

  // Alt A — a bare weekday name is genuinely ambiguous; offer both dates.
  // Only the deterministic detector surfaces candidates today.
  if (fields.dueAt.candidates && fields.dueAt.candidates.length > 1) {
    response.dueAtCandidates = fields.dueAt.candidates;
  }

  // Alt C — this reads like more than one deadline; the confirmation card is
  // the wrong tool, but the single best guess is still returned so the caller
  // can choose to show it anyway.
  if (hasMultipleDueDates(text, nowMs)) {
    response.multipleDetected = true;
  }

  return ok(200, response);
};
