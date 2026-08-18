'use strict';

/**
 * POST /api/parse/bulk — UC-007 steps 1–4: split, batch-parse, and return
 * the review table. Nothing is written — the student ticks/edits rows and
 * confirms via POST /api/parse/bulk/import (this handler's sibling).
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const { chat, isConfigured, AiUnavailable } = require('../../lib/ai/client');
const { extractJson } = require('../../lib/ai/validate');
const prompt = require('../../lib/ai/prompts/parse');
const { parseDeterministic } = require('../../lib/parse/deterministic');
const { splitCandidateLines, withDateToken, MAX_LINES } = require('../../lib/parse/lines');
const { toApiShape, isEmptyResult, withSmartDefaults } = require('../../lib/parse/fields');
const { existingModuleCodes, activeTasksFor } = require('../../lib/parse/context');

const TZ = 'Asia/Singapore';

/** Alt B — same module, due within ±7 days of an existing task. */
function isDuplicate(fields, existingTasks) {
  if (!fields.module.value || !fields.dueAt.value) return false;
  const dueMs = Date.parse(fields.dueAt.value);
  if (!Number.isFinite(dueMs)) return false;
  return existingTasks.some((task) => task.module === fields.module.value
    && Number.isFinite(Date.parse(task.dueAt))
    && Math.abs(Date.parse(task.dueAt) - dueMs) <= 7 * 86400000);
}

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.bulkParse);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const candidates = splitCandidateLines(body.text);
  const dated = withDateToken(candidates);
  const truncated = dated.length > MAX_LINES;
  const lines = dated.slice(0, MAX_LINES);

  if (lines.length === 0) {
    return fail(422, 'unparseable', "I couldn't find any dated tasks in that text.");
  }

  const [moduleCodes, existingTasks] = await Promise.all([
    existingModuleCodes(userId),
    activeTasksFor(userId),
  ]);

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  let batchFields = null;
  let degraded = true;

  if (isConfigured()) {
    try {
      const raw = await chat(prompt.buildBulkMessages({
        lines, now, tz: TZ, moduleCodes,
      }), { maxTokens: Math.min(2000, 200 * lines.length) });

      const parsed = extractJson(raw);
      if (prompt.isValidBulkShape(parsed, lines.length)) {
        batchFields = parsed.rows;
        degraded = false;
      } else {
        console.warn(JSON.stringify({ level: 'WARN', event: 'bulk_parse_bad_shape', count: lines.length }));
      }
    } catch (error) {
      if (!(error instanceof AiUnavailable)) throw error;
      // E3 — batched call rate-limited or unavailable: chrono-node per line.
      console.warn(JSON.stringify({ level: 'WARN', event: 'bulk_parse_ai_unavailable', reason: error.reason }));
    }
  }

  if (!batchFields) {
    batchFields = lines.map((line) => parseDeterministic(line, { now: nowMs, moduleCodes }));
  }

  const rows = [];
  const unparsed = [];

  lines.forEach((line, index) => {
    const fields = withSmartDefaults(batchFields[index]);
    if (isEmptyResult(fields)) {
      // Alt A — kept verbatim, never silently dropped.
      unparsed.push(line);
      return;
    }
    const row = toApiShape(fields, { degraded });
    row.rowId = `row-${index}`;
    row.raw = line;
    row.duplicate = isDuplicate(fields, existingTasks);
    row.ticked = !row.duplicate; // Alt B — the safe default is unticked.
    rows.push(row);
  });

  return ok(200, { rows, unparsed, truncated });
};
