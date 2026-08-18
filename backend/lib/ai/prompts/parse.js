'use strict';

/**
 * UC-005 — natural-language quick parse. HLD §8.3.
 *
 * Supplying the current date and timezone is essential: without it, "next
 * Friday" is unresolvable and the model will hallucinate a plausible-looking
 * wrong date, which is worse than failing (HLD §8.3).
 */

const SYSTEM = [
  'You extract one academic task from a short piece of free text.',
  'Return STRICT JSON only — no prose, no markdown fences — in exactly this shape:',
  '{"title":{"value":"...","confidence":0.0},',
  ' "module":{"value":"...","confidence":0.0},',
  ' "type":{"value":"assignment|test|project|presentation","confidence":0.0},',
  ' "dueAt":{"value":"YYYY-MM-DDTHH:mm:ss+08:00","confidence":0.0,"source":"..."},',
  ' "gradeWeight":{"value":0,"confidence":0.0},',
  ' "effortHours":{"value":0,"confidence":0.0},',
  ' "isGroup":{"value":false,"confidence":0.0}}',
  'Rules:',
  '- confidence is 0.0–1.0, your genuine certainty for that field alone.',
  '- Use `null` for "value" on any field you cannot find — never invent one.',
  '- Resolve relative dates ("next friday", "tomorrow") against the supplied',
  '  current date, in the supplied timezone. If no time is stated, use 23:59.',
  '- `dueAt.source` is the exact phrase in the input that gave you the date.',
  '- Prefer an existing module code you were given over inventing a new one.',
].join('\n');

/**
 * @param {object} input {text, now: ISO string, tz, moduleCodes}
 */
function buildMessages(input) {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: JSON.stringify({
        text: input.text,
        currentDate: input.now,
        timezone: input.tz,
        existingModuleCodes: input.moduleCodes || [],
      }),
    },
  ];
}

const FIELD_NAMES = ['title', 'module', 'type', 'dueAt', 'gradeWeight', 'effortHours', 'isGroup'];
const TYPES = new Set(['assignment', 'test', 'project', 'presentation']);

/** Schema check (HLD §8.4) — before any confidence/provenance handling. */
function isValidShape(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  for (const name of FIELD_NAMES) {
    const field = parsed[name];
    if (!field || typeof field !== 'object') return false;
    if (typeof field.confidence !== 'number') return false;
  }
  if (parsed.type.value !== null && !TYPES.has(parsed.type.value)) return false;
  if (parsed.gradeWeight.value !== null) {
    const w = Number(parsed.gradeWeight.value);
    if (!Number.isFinite(w) || w < 0 || w > 100) return false;
  }
  if (parsed.effortHours.value !== null) {
    const h = Number(parsed.effortHours.value);
    if (!Number.isFinite(h) || h <= 0 || h > 200) return false;
  }
  return true;
}

/**
 * UC-007 step 3 — one batched call for every candidate line, never one call
 * per line, to stay within free-tier rate limits.
 */
const BULK_SYSTEM = [
  'You extract one academic task from EACH line of a numbered list.',
  'Return STRICT JSON only — no prose, no markdown fences:',
  '{"rows":[',
  '  {"title":{"value":"...","confidence":0.0},',
  '   "module":{"value":"...","confidence":0.0},',
  '   "type":{"value":"assignment|test|project|presentation","confidence":0.0},',
  '   "dueAt":{"value":"YYYY-MM-DDTHH:mm:ss+08:00","confidence":0.0,"source":"..."},',
  '   "gradeWeight":{"value":0,"confidence":0.0},',
  '   "effortHours":{"value":0,"confidence":0.0},',
  '   "isGroup":{"value":false,"confidence":0.0}}',
  ']}',
  'Rules:',
  '- Return exactly one row per input line, IN THE SAME ORDER — row[i] for line[i].',
  '- Use `null` for "value" on any field you cannot find — never invent one.',
  '- Resolve relative dates against the supplied current date and timezone.',
  '  If no time is stated, use 23:59.',
].join('\n');

/**
 * @param {object} input {lines: string[], now: ISO string, tz, moduleCodes}
 */
function buildBulkMessages(input) {
  return [
    { role: 'system', content: BULK_SYSTEM },
    {
      role: 'user',
      content: JSON.stringify({
        lines: input.lines,
        currentDate: input.now,
        timezone: input.tz,
        existingModuleCodes: input.moduleCodes || [],
      }),
    },
  ];
}

/** @returns {boolean} true only when `rows` matches the input line count exactly. */
function isValidBulkShape(parsed, expectedLength) {
  if (!parsed || !Array.isArray(parsed.rows)) return false;
  if (parsed.rows.length !== expectedLength) return false;
  return parsed.rows.every(isValidShape);
}

module.exports = {
  buildMessages,
  isValidShape,
  buildBulkMessages,
  isValidBulkShape,
  SYSTEM,
  BULK_SYSTEM,
  FIELD_NAMES,
};
