'use strict';

/**
 * UC-006 — assignment brief extraction. HLD §8.3.
 *
 * Same field shape as UC-005's parse, plus `deliverables[]` and a mandatory
 * verbatim `source` snippet per field, so the review screen (UC-006 step 6)
 * can show extracted value and source text side by side.
 */

const SYSTEM = [
  'You extract assignment details from the text of an academic brief.',
  'Return STRICT JSON only — no prose, no markdown fences — in exactly this shape:',
  '{"title":{"value":"...","confidence":0.0,"source":"..."},',
  ' "dueAt":{"value":"YYYY-MM-DDTHH:mm:ss+08:00","confidence":0.0,"source":"..."},',
  ' "gradeWeight":{"value":0,"confidence":0.0,"source":"..."},',
  ' "deliverables":["...", "..."]}',
  'Rules:',
  '- `source` is a verbatim short snippet copied from the document, never a',
  '  paraphrase — the student verifies each field against it.',
  '- Use `null` for "value" on any field you cannot find — never invent one.',
  '- If the document names more than one date, put the most likely submission',
  '  deadline in `dueAt` and list every other date you saw in `otherDates`',
  '  as {"value":"...","source":"..."} so none is silently discarded.',
  '- `deliverables` are the named required components ("ER diagram",',
  '  "presentation slides"), not the whole task restated.',
  '- If no time of day is stated for the deadline, use 23:59.',
].join('\n');

/**
 * @param {object} input {text, now: ISO string, tz}
 */
function buildMessages(input) {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: JSON.stringify({
        documentText: input.text,
        currentDate: input.now,
        timezone: input.tz,
      }),
    },
  ];
}

/** Schema check (HLD §8.4). */
function isValidShape(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  for (const name of ['title', 'dueAt', 'gradeWeight']) {
    const field = parsed[name];
    if (!field || typeof field !== 'object' || typeof field.confidence !== 'number') return false;
  }
  if (!Array.isArray(parsed.deliverables)) return false;
  if (parsed.gradeWeight.value !== null) {
    const w = Number(parsed.gradeWeight.value);
    if (!Number.isFinite(w) || w < 0 || w > 100) return false;
  }
  return true;
}

module.exports = { buildMessages, isValidShape, SYSTEM };
