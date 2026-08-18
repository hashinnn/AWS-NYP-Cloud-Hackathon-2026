'use strict';

/**
 * UC-007 step 2 — split pasted text into candidate lines, newline/semicolon/
 * bullet-marker aware, and discard anything with no date-like token at all.
 */

// The month/weekday alternation needs `[a-z]*` after it, not a `\b` right at
// the abbreviation boundary — "fri" alone would never match inside "friday".
const DATE_HINT = new RegExp(
  '\\b('
  + '\\d{1,2}[/-]\\d{1,2}([/-]\\d{2,4})?' // 12/8, 12-08-2026
  + '|\\d{4}-\\d{2}-\\d{2}' // 2026-08-24
  + '|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec'
  + '|mon|tue|wed|thu|fri|sat|sun)[a-z]*'
  + '|today|tomorrow|tonight|next|this\\s+week|coming'
  + ')\\b',
  'i',
);

// UC-007 E1 — protects the token budget and the review UX.
const MAX_LINES = 20;

function splitCandidateLines(text) {
  return String(text || '')
    .split(/\r?\n|;/)
    .map((line) => line.replace(/^[\s*•\u2022\-–]+/, '').trim())
    .filter(Boolean);
}

function withDateToken(lines) {
  return lines.filter((line) => DATE_HINT.test(line));
}

module.exports = {
  splitCandidateLines, withDateToken, MAX_LINES, DATE_HINT,
};
