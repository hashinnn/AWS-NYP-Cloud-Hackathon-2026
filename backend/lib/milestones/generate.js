'use strict';

/**
 * UC-012 — milestone breakdown.
 *
 * Two things live here: the deterministic template used when the model is
 * unavailable (E1), and the constraint enforcement applied to EVERY proposal —
 * template or model — because "constraints enforced in the prompt alone are
 * unreliable" (UC-012 step 4).
 */

const crypto = require('node:crypto');
const {
  toMs, dailyAvailableHours, endOfLocalDay, MS_PER_DAY,
} = require('../scoring/availability');

const MIN_BREAKDOWN_HOURS = 3; // UC-012 Alt B
const BUFFER_MS = MS_PER_DAY; // constraint (i): a full day before the real deadline
const MAX_SHIFT_DAYS = 14; // how far back to look for an available day

const TEMPLATES = {
  assignment: ['Research and sources', 'Outline the structure', 'Write the draft', 'Revise and edit', 'Final check and submit'],
  test: ['Revise topics 1–3', 'Revise topics 4–6', 'Past papers', 'Final review'],
  presentation: ['Write the script', 'Build the slides', 'Rehearse', 'Final run-through'],
  project: ['Plan and scope', 'Build', 'Integrate', 'Test', 'Document'],
};

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * UC-012 E2 — hours are rescaled proportionally so the total always equals
 * `effortHours`. The system never displays an inconsistent total.
 */
function rescaleHours(milestones, effortHours) {
  const total = milestones.reduce((sum, m) => sum + (Number(m.hours) || 0), 0);
  if (!(total > 0) || !(effortHours > 0)) return milestones;

  const scale = effortHours / total;
  const scaled = milestones.map((m) => ({ ...m, hours: round1((Number(m.hours) || 0) * scale) }));

  // Rounding leaves a few minutes over or short; the last milestone absorbs it
  // so the sum is exact rather than nearly right.
  const drift = round1(effortHours - scaled.reduce((sum, m) => sum + m.hours, 0));
  if (drift !== 0) {
    const last = scaled[scaled.length - 1];
    last.hours = round1(last.hours + drift);
  }
  return scaled;
}

function isBlocked(ms, prefs) {
  return dailyAvailableHours(ms, prefs) === 0;
}

/**
 * Constraint (ii) — shift a date off a zero-availability day onto the previous
 * day the student can actually work.
 */
function shiftOffBlockedDay(ms, prefs, earliestMs) {
  let candidate = ms;
  for (let i = 0; i < MAX_SHIFT_DAYS; i += 1) {
    if (!isBlocked(candidate, prefs)) return { ms: candidate, shifted: i > 0 };
    const previous = candidate - MS_PER_DAY;
    // Never shift into the past; a student with no free days keeps the date
    // and sees the note instead of receiving an impossible plan.
    if (previous < earliestMs) return { ms: candidate, shifted: i > 0, noFreeDay: true };
    candidate = previous;
  }
  return { ms: candidate, shifted: true, noFreeDay: true };
}

/**
 * Date every milestone, then enforce the two hard constraints in code.
 *
 * @returns {object[]} milestones with `dueAt`, `order`, and per-row notes
 */
function scheduleMilestones(milestones, task, prefs, nowMs) {
  const tz = prefs && prefs.tz;
  const deadline = toMs(task.dueAt);

  // Constraint (i): the last milestone finishes a full day early, deliberately.
  // The `deadline - BUFFER_MS` clamp matters when a deadline sits at local
  // midnight — end-of-that-day would otherwise leave a one-minute "buffer".
  const latest = Math.min(endOfLocalDay(deadline - BUFFER_MS, tz), deadline - BUFFER_MS);
  const earliest = Math.min(endOfLocalDay(nowMs, tz), latest);
  const span = Math.max(latest - earliest, 0);
  const count = milestones.length;

  let previous = 0;
  return milestones.map((milestone, index) => {
    const notes = [];
    const proposed = toMs(milestone.dueAt);
    const evenlySpaced = earliest + (span * (index + 1)) / count;

    // A model-supplied date is honoured only inside the legal window (E3).
    let target = evenlySpaced;
    if (Number.isFinite(proposed)) {
      const snapped = endOfLocalDay(proposed, tz);
      if (snapped > latest) {
        target = latest;
        notes.push('moved earlier to finish a day before the deadline');
      } else if (snapped < earliest) {
        target = earliest;
        notes.push('moved to today — the suggested date had already passed');
      } else {
        target = snapped;
      }
    }

    const shifted = shiftOffBlockedDay(target, prefs, earliest);
    if (shifted.shifted) notes.push('moved off a blocked day');
    if (shifted.noFreeDay) notes.push('no free day available before this date');

    // Shifting off blocked days can pull a later step in front of an earlier
    // one; the order the student reads must stay the order they work in.
    const at = Math.max(shifted.ms, previous);
    previous = at;

    return {
      ...milestone,
      milestoneId: milestone.milestoneId || crypto.randomUUID(),
      taskId: task.taskId,
      dueAt: new Date(at).toISOString(),
      order: index + 1,
      completedAt: milestone.completedAt || null,
      notes,
    };
  });
}

/** UC-012 E1 — the template breakdown, by task type. */
function templateMilestones(task, deliverables = []) {
  const names = deliverables.length >= 3 && deliverables.length <= 6
    ? deliverables.map((d) => String(d).slice(0, 60))
    : TEMPLATES[task.type] || TEMPLATES.assignment;

  const effortHours = Number(task.effortHours) || 0;
  const share = effortHours / names.length;

  return names.map((name) => ({ name, hours: round1(share) }));
}

/**
 * The full deterministic proposal: named steps, hours summing to effortHours,
 * dates respecting both constraints.
 */
function proposeFromTemplate(task, prefs, nowMs, deliverables) {
  const scaled = rescaleHours(templateMilestones(task, deliverables), Number(task.effortHours));
  return scheduleMilestones(scaled, task, prefs, nowMs);
}

/** Normalise a model proposal through exactly the same pipeline. */
function proposeFromModel(rawMilestones, task, prefs, nowMs) {
  const cleaned = rawMilestones.slice(0, 6).map((m) => ({
    name: String(m.name).trim().slice(0, 60),
    hours: Number(m.hours),
    dueAt: m.dueAt,
  }));
  const scaled = rescaleHours(cleaned, Number(task.effortHours));
  return scheduleMilestones(scaled, task, prefs, nowMs);
}

function isTooSmall(task) {
  return !(Number(task.effortHours) >= MIN_BREAKDOWN_HOURS);
}

module.exports = {
  proposeFromTemplate,
  proposeFromModel,
  shiftOffBlockedDay,
  templateMilestones,
  scheduleMilestones,
  rescaleHours,
  isTooSmall,
  MIN_BREAKDOWN_HOURS,
  TEMPLATES,
};
