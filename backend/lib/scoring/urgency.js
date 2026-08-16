'use strict';

/**
 * UC-009 (a) URGENCY — HLD §7.2a
 *
 *   effectiveDays = daysUntil(dueAt) − prepDays
 *   Urgency       = 100 × e^(−0.25 × max(effectiveDays, 0))
 *   overdue       → 100 (pinned)
 */

const { toMs, MS_PER_DAY } = require('./availability');

const DECAY = 0.25;
const MAX_PREP_DAYS = 30;

/**
 * Days until the point work must START, not until the deadline.
 * `prepDays` is what makes this academic rather than generic: a test 5 days
 * away needing 3 days of revision is effectively 2 days away, and a
 * nearest-deadline sort misses that entirely.
 */
function effectiveDaysUntil(task, nowMs) {
  const due = toMs(task.dueAt);
  const prep = Math.min(Math.max(Number(task.prepDays) || 0, 0), MAX_PREP_DAYS);
  return (due - nowMs) / MS_PER_DAY - prep;
}

/**
 * @param {object} task with a valid `dueAt`
 * @param {number} nowMs
 * @returns {number} 0–100
 */
function urgency(task, nowMs) {
  const due = toMs(task.dueAt);
  if (task.status === 'overdue' || due <= nowMs) return 100;

  // Exponential rather than linear because student stress is not linear:
  // 14 days vs 13 is nothing, 2 days vs 1 is everything.
  return 100 * Math.exp(-DECAY * Math.max(effectiveDaysUntil(task, nowMs), 0));
}

module.exports = urgency;
module.exports.effectiveDaysUntil = effectiveDaysUntil;
