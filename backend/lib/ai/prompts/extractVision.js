'use strict';

/**
 * UC-006 Alt A — a scanned or image-based brief. Same output schema as the
 * text path (`./extract.js`), so the handler's response builder and schema
 * validator are shared rather than duplicated — only the input differs.
 */

const { isValidShape } = require('./extract');

const SYSTEM = [
  'You read the text in an image of an academic assignment brief and',
  'extract its details.',
  'Return STRICT JSON only — no prose, no markdown fences — in exactly this shape:',
  '{"title":{"value":"...","confidence":0.0,"source":"..."},',
  ' "dueAt":{"value":"YYYY-MM-DDTHH:mm:ss+08:00","confidence":0.0,"source":"..."},',
  ' "gradeWeight":{"value":0,"confidence":0.0,"source":"..."},',
  ' "deliverables":["...", "..."]}',
  'Rules:',
  '- `source` is the text you read from the image for that field, as close to',
  '  verbatim as your reading allows.',
  '- Use `null` for "value" on anything you cannot read with reasonable',
  '  confidence — never guess at illegible text.',
  '- If no time of day is stated for the deadline, use 23:59.',
].join('\n');

/**
 * @param {object} input {imageUrl, now: ISO string, tz}
 */
function buildMessages(input) {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        { type: 'text', text: JSON.stringify({ currentDate: input.now, timezone: input.tz }) },
        { type: 'image_url', image_url: { url: input.imageUrl } },
      ],
    },
  ];
}

module.exports = { buildMessages, isValidShape, SYSTEM };
