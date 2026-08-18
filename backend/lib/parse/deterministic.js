'use strict';

/**
 * Deterministic fallback for UC-005 / UC-006 / UC-007 — `chrono-node` +
 * regex, no AI, no network, no DynamoDB.
 *
 * Runs identically to the client-side `chrono-node` fallback described in
 * AGENTS §3 ("same library, same results"), so a Lambda-side degrade never
 * disagrees with the browser-side one.
 */

const chrono = require('chrono-node');

// Asia/Singapore is a fixed UTC+8 offset with no DST (see the note in
// lib/scoring/availability.js), so a constant works everywhere this runs.
const SGT_OFFSET_MINUTES = 480;

const TYPE_KEYWORDS = [
  [/\b(test|quiz|exam|midterm)\b/i, 'test'],
  [/\b(present(?:ation)?|pitch|demo)\b/i, 'presentation'],
  [/\bproject\b/i, 'project'],
];

const MODULE_PATTERN = /\b[A-Z]{2,4}\d{3,4}[A-Z]?\b/;
const WEIGHT_PATTERN = /(\d{1,3}(?:\.\d+)?)\s*%/;
const HOURS_PATTERN = /(\d{1,3}(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i;
const GROUP_PATTERN = /\bgroup\b/i;
const WEEKDAY_BARE = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i;
const WEEKDAY_QUALIFIED = /\b(next|this|coming)\b/i;

// chrono-node's casual parser will happily read "9 hours" or "2 hours" (an
// effort estimate, not a deadline) as a relative time reference. A genuine
// deadline mention always carries some calendar anchor — a weekday, a month,
// "today"/"tomorrow", or a numeric date — so matches without one are effort
// estimates in disguise and are dropped before anything picks a "best" date.
const CALENDAR_ANCHOR = /\b(mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\btoday\b|\btomorrow\b|\btonight\b|\d{1,2}[/-]\d{1,2}|\d{4}-\d{2}-\d{2}/i;

/** chrono-node's date/time matches, filtered to real calendar references. */
function calendarResults(text, nowMs) {
  return chrono
    .parse(text, new Date(nowMs), { timezone: SGT_OFFSET_MINUTES, forwardDate: true })
    .filter((result) => CALENDAR_ANCHOR.test(result.text));
}

/** Task type from keywords, defaulting to 'assignment' (HLD §5.5). */
function detectType(text) {
  for (const [pattern, type] of TYPE_KEYWORDS) {
    if (pattern.test(text)) return { value: type, confidence: 0.7, source: pattern.exec(text)[0] };
  }
  return { value: 'assignment', confidence: 0.4 };
}

/** Prefers a module code the student already has, over a bare regex guess. */
function detectModule(text, existingCodes = []) {
  const upper = text.toUpperCase();
  for (const code of existingCodes) {
    if (code && upper.includes(String(code).toUpperCase())) {
      return { value: code, confidence: 0.9, source: code };
    }
  }
  const match = text.match(MODULE_PATTERN);
  if (!match) return { value: null, confidence: 0 };
  return { value: match[0].toUpperCase(), confidence: 0.6, source: match[0] };
}

function detectGradeWeight(text) {
  const match = text.match(WEIGHT_PATTERN);
  if (!match) return { value: null, confidence: 0 };
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0 || value > 100) return { value: null, confidence: 0 };
  return { value, confidence: 0.75, source: match[0] };
}

function detectEffortHours(text) {
  const match = text.match(HOURS_PATTERN);
  if (!match) return { value: null, confidence: 0 };
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return { value: null, confidence: 0 };
  return { value, confidence: 0.75, source: match[0] };
}

function detectIsGroup(text) {
  const found = GROUP_PATTERN.test(text);
  return { value: found, confidence: found ? 0.65 : 0.5 };
}

/**
 * A short, human title: strip the phrases the other detectors already
 * claimed and take what is left, falling back to "<module> <type>".
 */
function detectTitle(text, claimed) {
  let stripped = text;
  for (const phrase of claimed) {
    if (phrase) stripped = stripped.replace(phrase, ' ');
  }
  stripped = stripped
    .replace(/\bdue\b/gi, ' ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (stripped.length >= 3) {
    const title = stripped.slice(0, 200);
    return { value: title.charAt(0).toUpperCase() + title.slice(1), confidence: 0.5, source: stripped };
  }
  return { value: null, confidence: 0 };
}

/**
 * UC-005 Alt A — "Friday" alone is ambiguous (this week vs next); "next
 * Friday" is not. Bare weekday mentions get a second candidate a week later
 * and a lower confidence so the UI can offer both as chips.
 */
function isAmbiguousWeekday(matchedText) {
  return WEEKDAY_BARE.test(matchedText) && !WEEKDAY_QUALIFIED.test(matchedText);
}

/**
 * @param {string} text
 * @param {number} nowMs reference instant, explicit so this stays testable
 * @returns {{value:string|null, confidence:number, source?:string,
 *   candidates:string[], isPast:boolean}}
 */
function detectDueAt(text, nowMs) {
  const results = calendarResults(text, nowMs);
  if (!results.length) return { value: null, confidence: 0, candidates: [], isPast: false };

  const best = results[0];
  let dateMs = best.start.date().getTime();

  // Deadline time defaults to 23:59 local when the phrase carried no time of
  // day (HLD §5.5) — never presented as though the model knew the hour.
  const hourStated = best.start.isCertain('hour');
  if (!hourStated) {
    const localMs = dateMs + SGT_OFFSET_MINUTES * 60000;
    const localDay = new Date(localMs);
    localDay.setUTCHours(23, 59, 0, 0);
    dateMs = localDay.getTime() - SGT_OFFSET_MINUTES * 60000;
  }

  const ambiguous = isAmbiguousWeekday(best.text);
  const value = new Date(dateMs).toISOString();
  const candidates = ambiguous
    ? [value, new Date(dateMs + 7 * 86400000).toISOString()]
    : [];

  return {
    value,
    confidence: ambiguous ? 0.55 : (hourStated ? 0.85 : 0.7),
    source: best.text,
    candidates,
    isPast: dateMs < nowMs,
  };
}

/**
 * Full deterministic pass — the UC-005 Alt B / UC-007 E3 fallback.
 *
 * @param {string} text
 * @param {{now?:number, moduleCodes?:string[]}} [options]
 */
function parseDeterministic(text, options = {}) {
  const nowMs = options.now ?? Date.now();
  const moduleCodes = options.moduleCodes || [];

  const type = detectType(text);
  const module_ = detectModule(text, moduleCodes);
  const gradeWeight = detectGradeWeight(text);
  const effortHours = detectEffortHours(text);
  const isGroup = detectIsGroup(text);
  const dueAt = detectDueAt(text, nowMs);
  const title = detectTitle(text, [
    module_.source, gradeWeight.source, effortHours.source, dueAt.source,
  ]);

  return {
    title, module: module_, type, dueAt, gradeWeight, effortHours, isGroup,
  };
}

/**
 * UC-005 Alt C — the text looks like it names more than one deadline, so the
 * caller should route to the UC-007 bulk-import table instead of a single
 * confirmation card. Dates within the same calendar day count once.
 */
function hasMultipleDueDates(text, nowMs) {
  const results = calendarResults(text, nowMs);
  const distinctDays = new Set(results.map((r) => Math.floor(r.start.date().getTime() / 86400000)));
  return distinctDays.size > 1;
}

module.exports = {
  parseDeterministic,
  detectType,
  detectModule,
  detectGradeWeight,
  detectEffortHours,
  detectIsGroup,
  detectTitle,
  detectDueAt,
  isAmbiguousWeekday,
  hasMultipleDueDates,
  SGT_OFFSET_MINUTES,
};
