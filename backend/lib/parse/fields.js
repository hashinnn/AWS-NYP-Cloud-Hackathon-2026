'use strict';

/**
 * UC-002 §5.5 smart defaults, reused wherever a parsed task is missing a
 * field the form would otherwise default for it (UC-005/006/007).
 */

const SMART_DEFAULTS = {
  assignment: { effortHours: 8, prepDays: 0 },
  test: { effortHours: 6, prepDays: 3 },
  project: { effortHours: 15, prepDays: 0 },
  presentation: { effortHours: 5, prepDays: 1 },
};

function smartDefaultsFor(type) {
  return SMART_DEFAULTS[type] || SMART_DEFAULTS.assignment;
}

/**
 * UC-005 E3 / UC-007 unparsed — `dueAt` is a required task field (HLD
 * §5.3.4), so text that resolves no date at all cannot become a task no
 * matter how confident the title guess is. A generic title fallback (see
 * `detectTitle`) almost always produces *something*, which is why the check
 * anchors on the date rather than "every field is empty".
 */
function isEmptyResult(fields) {
  return !fields.dueAt.value;
}

/** UC-002 §5.5 — fill a missing effort estimate from the task type. */
function withSmartDefaults(fields) {
  if (fields.effortHours.value !== null) return fields;
  const type = fields.type.value || 'assignment';
  const defaults = smartDefaultsFor(type);
  return {
    ...fields,
    effortHours: { value: defaults.effortHours, confidence: 0.3, source: 'suggested default' },
  };
}

/**
 * Convert the internal {value, confidence, source}-per-field shape (used
 * while assembling a parse, and matching the UC-005 model response in
 * HLD §8.3) into the flat wire shape the API contract promises (HLD §6.2):
 * `{fields, confidence, sources, degraded}`.
 */
function toApiShape(internal, { degraded = false } = {}) {
  const fields = {};
  const confidence = {};
  const sources = {};

  for (const [key, field] of Object.entries(internal)) {
    if (!field) continue;
    fields[key] = field.value ?? null;
    if (field.confidence !== undefined) confidence[key] = field.confidence;
    if (field.source) sources[key] = field.source;
  }

  return { fields, confidence, sources, degraded };
}

module.exports = {
  SMART_DEFAULTS, smartDefaultsFor, toApiShape, isEmptyResult, withSmartDefaults,
};
