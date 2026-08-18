'use strict';

/**
 * POST /api/briefs/extract — UC-006.
 *
 * The file itself never reaches Lambda (HLD §4.3): the frontend extracts
 * text client-side with `pdfjs-dist`/`mammoth` after a presigned S3 upload,
 * and posts the text here. This handler is a proposal only — nothing is
 * written; the student confirms on the two-column review screen (step 6)
 * before POST /api/tasks creates the task.
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const { chat, isConfigured, AiUnavailable } = require('../../lib/ai/client');
const { extractJson } = require('../../lib/ai/validate');
const prompt = require('../../lib/ai/prompts/extract');
const { detectDueAt, detectGradeWeight } = require('../../lib/parse/deterministic');

const TZ = 'Asia/Singapore';

// First ~2 pages, where deadlines almost always appear (HLD §6.2 step 4).
const TEXT_BUDGET_CHARS = 6000;

// UC-006 step 3 — under this, the frontend should have routed to the vision
// path already; if it still lands here, there is nothing to extract from.
const MIN_TEXT_CHARS = 50;

function scalarField(value, confidence, source) {
  return { value: value ?? null, confidence, ...(source ? { source } : {}) };
}

/** UC-006 E2/E5 fallback — no model, just the same regex the parser uses. */
function extractDeterministic(text, nowMs) {
  const dueAt = detectDueAt(text, nowMs);
  const gradeWeight = detectGradeWeight(text);

  const titleLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length >= 8 && line.length <= 120) || null;

  const deliverables = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line) || /\b(submit|include|deliverable)\b/i.test(line))
    .map((line) => line.replace(/^[-*•]\s+/, ''))
    .slice(0, 6);

  return {
    title: scalarField(titleLine, titleLine ? 0.3 : 0, titleLine || undefined),
    dueAt: scalarField(dueAt.value, dueAt.value ? 0.5 : 0, dueAt.source),
    gradeWeight: scalarField(gradeWeight.value, gradeWeight.confidence, gradeWeight.source),
    deliverables,
  };
}

function toResponse(fields, degraded) {
  const response = { fields: {}, confidence: {}, sources: {}, deliverables: fields.deliverables || [], degraded };
  for (const name of ['title', 'dueAt', 'gradeWeight']) {
    const field = fields[name];
    response.fields[name] = field.value;
    response.confidence[name] = field.confidence;
    if (field.source) response.sources[name] = field.source;
  }
  if (Array.isArray(fields.otherDates) && fields.otherDates.length) {
    response.otherDates = fields.otherDates; // Alt B — never silently pick one.
  }
  return response;
}

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.extract);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const fullText = body.extractedText.trim();
  if (fullText.length < MIN_TEXT_CHARS) {
    return fail(422, 'no_text_found',
      "I couldn't read this document — try entering the details yourself.");
  }

  const text = fullText.slice(0, TEXT_BUDGET_CHARS);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  if (isConfigured()) {
    try {
      const raw = await chat(prompt.buildMessages({ text, now, tz: TZ }), { maxTokens: 500 });
      const parsed = extractJson(raw);
      if (prompt.isValidShape(parsed)) {
        return ok(200, toResponse(parsed, false));
      }
      console.warn(JSON.stringify({ level: 'WARN', event: 'extract_bad_shape', userId, s3Key: body.s3Key }));
    } catch (error) {
      if (!(error instanceof AiUnavailable)) throw error;
      console.warn(JSON.stringify({
        level: 'WARN', event: 'extract_ai_unavailable', reason: error.reason, s3Key: body.s3Key,
      }));

      // E5 — the model exceeded the Lambda timeout specifically: the contract
      // still returns a partial, amber-flagged result, just under a 504.
      if (error.reason === 'timeout') {
        return ok(504, toResponse(extractDeterministic(text, nowMs), true));
      }
    }
  }

  // E1/Alt B-equivalent — model unconfigured or otherwise unavailable.
  return ok(200, toResponse(extractDeterministic(text, nowMs), true));
};
