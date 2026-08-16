'use strict';

/**
 * UC-009 (c) EFFORT PRESSURE — HLD §7.2c
 *
 *   remainingHours = effortHours × (1 − progressPct / 100)
 *   availableHours = study hours between now and dueAt (UC-004 capacity model)
 *   ratio          = remainingHours / max(availableHours, 0.5)
 *   EffortPressure = min(100, ratio × 70)
 *   tight          = ratio > 1.0
 *
 * `tight` is the claim no competing team can make: the work does not fit in
 * the time left at the student's own stated availability. Not "urgent" —
 * impossible.
 */

const { availableHoursBetween } = require('./availability');

const NEUTRAL = 50;
const RATIO_MULTIPLIER = 70; // ratio 1.0 → 70, leaving headroom above "impossible"
const MIN_AVAILABLE_HOURS = 0.5; // UC-009 Alt B — divide-by-zero floor

function clampPct(value) {
  const pct = Number(value);
  if (!Number.isFinite(pct)) return 0;
  return Math.min(Math.max(pct, 0), 100);
}

/**
 * @param {object} task with a valid `dueAt`
 * @param {object} prefs PREFS item (availability, blockedDates, tz)
 * @param {number} nowMs
 * @returns {{value:number, ratio:(number|null), tight:boolean,
 *            remainingHours:(number|null), availableHours:number,
 *            dataGap:(string|null)}}
 */
function effortPressure(task, prefs, nowMs) {
  const availableHours = availableHoursBetween(nowMs, task.dueAt, prefs);
  const effortHours = Number(task.effortHours);

  // UC-009 Alt A — without an effort estimate there is no honest capacity
  // claim to make, so the sub-score goes neutral and `tight` stays false.
  // Asserting "impossible" from a guessed workload would be worse than silence.
  if (!Number.isFinite(effortHours) || effortHours <= 0) {
    return {
      value: NEUTRAL,
      ratio: null,
      tight: false,
      remainingHours: null,
      availableHours,
      dataGap: 'effortHours',
    };
  }

  const remainingHours = effortHours * (1 - clampPct(task.progressPct) / 100);
  const ratio = remainingHours / Math.max(availableHours, MIN_AVAILABLE_HOURS);

  return {
    value: Math.min(100, ratio * RATIO_MULTIPLIER),
    ratio,
    tight: ratio > 1,
    remainingHours,
    availableHours,
    dataGap: null,
  };
}

module.exports = effortPressure;
module.exports.NEUTRAL = NEUTRAL;
module.exports.MIN_AVAILABLE_HOURS = MIN_AVAILABLE_HOURS;
