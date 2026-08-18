'use strict';

/**
 * UC-003 Alternative Flow A — a deadline moved and the milestones no longer
 * fit inside it.
 *
 * The two UC-012 constraints are re-applied here rather than assumed: the last
 * milestone still finishes a full day before the real deadline, and nothing
 * lands on a zero-availability day. Both are enforced in code, never in a
 * prompt — this path never touches a model at all.
 */

const { toMs, endOfLocalDay, MS_PER_DAY } = require('../scoring/availability');
const { shiftOffBlockedDay } = require('../milestones/generate');

const BUFFER_MS = MS_PER_DAY;   // UC-012 constraint (i)

/** The latest instant a milestone may legally occupy for a given deadline. */
const latestAllowed = (dueAt) => toMs(dueAt) - BUFFER_MS;

/** Milestones left after the new deadline's buffer — what triggers the offer. */
function strandedBy(milestones, newDueAt) {
  const limit = latestAllowed(newDueAt);
  return milestones.filter((milestone) => toMs(milestone.dueAt) > limit);
}

/**
 * Rescale every milestone into the new window, preserving relative spacing.
 *
 * The window is anchored at its start — the point work could have begun — so
 * pulling a deadline in compresses the plan rather than sliding it wholesale
 * into the past.
 *
 * @returns {object[]} milestones with new `dueAt` values, in `order`
 */
function shiftProportionally(milestones, task, newDueAt, prefs, nowMs) {
  const newEnd = latestAllowed(newDueAt);
  const oldEnd = latestAllowed(task.dueAt);

  const dates = milestones.map((milestone) => toMs(milestone.dueAt)).filter(Number.isFinite);
  const start = Math.min(toMs(task.createdAt) || nowMs, ...dates);

  const oldSpan = oldEnd - start;
  const newSpan = newEnd - start;

  let previous = 0;
  return [...milestones]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((milestone, index, all) => {
      // With no usable original spacing, fall back to even spacing — the same
      // shape UC-012 generates from scratch.
      const fraction = oldSpan > 0
        ? (toMs(milestone.dueAt) - start) / oldSpan
        : (index + 1) / all.length;

      const target = endOfLocalDay(start + fraction * newSpan, prefs.tz);
      const moved = shiftOffBlockedDay(Math.min(target, newEnd), prefs, start).ms;

      // Order the student reads is the order they work in: dodging a blocked
      // day must never overtake the previous step.
      const at = Math.max(Math.min(moved, newEnd), previous);
      previous = at;

      return { ...milestone, dueAt: new Date(at).toISOString() };
    });
}

module.exports = { strandedBy, shiftProportionally, latestAllowed, BUFFER_MS };
