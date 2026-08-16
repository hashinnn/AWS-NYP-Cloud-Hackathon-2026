'use strict';

/**
 * UC-013 step 6 — enacting a redistribution.
 *
 * Pure: returns the milestones that should be written. The handler persists
 * them and rescores, so the crash week's loadRatio visibly drops.
 *
 * The rule this file exists to keep: relieving one week must never overload an
 * earlier one. Spreading work evenly across the calendar looks like a fix and
 * is not — placement follows spare capacity, week by week.
 */

const {
  toMs, endOfLocalDay, startOfLocalDay, MS_PER_DAY,
} = require('../scoring/availability');
const {
  proposeFromTemplate, shiftOffBlockedDay,
} = require('../milestones/generate');

const round1 = (value) => Math.round(value * 10) / 10;

/** The latest day inside `weekStart`'s week that the student can actually work. */
function landingDate(weekStart, task, prefs, nowMs) {
  const tz = prefs && prefs.tz;
  const lastDayOfWeek = endOfLocalDay(toMs(weekStart) + 6 * MS_PER_DAY, tz);

  // Never later than a full day before the real deadline (UC-012 constraint i),
  // and never in the past.
  const latest = Math.min(lastDayOfWeek, endOfLocalDay(toMs(task.dueAt) - MS_PER_DAY, tz));
  const target = Math.max(latest, endOfLocalDay(nowMs, tz));

  return shiftOffBlockedDay(target, prefs, startOfLocalDay(nowMs, tz)).ms;
}

/**
 * Spare hours per week, ignoring the task being redistributed — its own hours
 * are what we are moving, so they must not block their own new home.
 */
function spareExcluding(weeks, taskId) {
  return weeks.map((week) => {
    if (week.unavailable) return 0;
    const own = week.tasks
      .filter((unit) => unit.taskId === taskId)
      .reduce((sum, unit) => sum + unit.hours, 0);
    return round1(Math.max(week.availableHours - (week.requiredHours - own), 0));
  });
}

/**
 * Place each milestone in the earliest week that still has room for it, never
 * going backwards and never past the one-day buffer before the deadline.
 */
function placeIntoWeeks(milestones, task, prefs, weeks, nowMs) {
  const tz = prefs && prefs.tz;
  const spare = spareExcluding(weeks, task.taskId);
  const lastLegal = Math.min(
    endOfLocalDay(toMs(task.dueAt) - MS_PER_DAY, tz),
    toMs(task.dueAt) - MS_PER_DAY,
  );

  let fromWeek = 0;
  let previousAt = 0;

  return milestones.map((milestone) => {
    let chosen = -1;
    for (let i = fromWeek; i < weeks.length; i += 1) {
      if (toMs(weeks[i].weekEnd) <= nowMs) continue; // that week is over
      if (toMs(weeks[i].weekStart) > lastLegal) break; // past the buffer
      if (spare[i] >= milestone.hours) { chosen = i; break; }
    }

    const notes = [];
    if (chosen === -1) {
      // Nowhere has room. Put it as late as the buffer allows and say so —
      // an honest overload beats a plan that quietly cannot work.
      chosen = Math.max(fromWeek, 0);
      notes.push('no week had spare capacity — consider reducing scope');
    } else {
      spare[chosen] = round1(spare[chosen] - milestone.hours);
    }

    fromWeek = chosen;
    const at = Math.max(Math.min(landingDate(weeks[chosen].weekStart, task, prefs, nowMs), lastLegal), previousAt);
    previousAt = at;

    return { ...milestone, dueAt: new Date(at).toISOString(), notes };
  });
}

/**
 * @param {object} recommendation from workload/recommend
 * @param {object} task the task being redistributed
 * @param {object[]} milestones that task's existing milestones
 * @param {object} prefs
 * @param {string|number|Date} now
 * @param {object[]} [weeks] the 12-week buckets, so placement follows capacity
 * @returns {{milestones:object[], created:boolean} | null} null when nothing
 *   can legitimately move (→ 422 no_valid_move)
 */
function applyRecommendation(recommendation, task, milestones, prefs, now, weeks) {
  if (!recommendation || recommendation.kind === 'no_capacity') return null;

  const nowMs = toMs(now);
  const existing = milestones.filter((m) => !m.completedAt);

  // Nothing to shift yet — break the task down first, then place the pieces
  // where the student actually has hours.
  if (recommendation.kind === 'break_down' || existing.length === 0) {
    const proposed = proposeFromTemplate(task, prefs, nowMs, []);
    const placed = weeks ? placeIntoWeeks(proposed, task, prefs, weeks, nowMs) : proposed;
    return { milestones: placed, created: true };
  }

  const targets = recommendation.moves.slice();
  if (targets.length === 0) return null;

  // Move the latest-dated work back first: it is the work sitting inside the
  // crash week, and moving it disturbs the least.
  const ordered = [...existing].sort((a, b) => toMs(b.dueAt) - toMs(a.dueAt));

  let target = targets.shift();
  let capacity = target.hours;
  let moved = 0;
  const updated = new Map();

  for (const milestone of ordered) {
    if (!target) break;
    const hours = Number(milestone.hours) || 0;

    const newAt = landingDate(target.weekStart, task, prefs, nowMs);
    if (newAt >= toMs(milestone.dueAt)) continue; // already earlier than the target

    updated.set(milestone.milestoneId, {
      ...milestone,
      dueAt: new Date(newAt).toISOString(),
      notes: ['moved earlier to relieve a crash week'],
    });

    moved += hours;
    capacity -= hours;
    if (capacity <= 0) {
      target = targets.shift();
      capacity = target ? target.hours : 0;
    }
    if (moved >= recommendation.hoursToMove) break;
  }

  if (updated.size === 0) return null; // E2 — no valid move

  return {
    milestones: milestones.map((m) => updated.get(m.milestoneId) || m),
    created: false,
    movedHours: round1(moved),
  };
}

module.exports = { applyRecommendation, landingDate, placeIntoWeeks, spareExcluding };
