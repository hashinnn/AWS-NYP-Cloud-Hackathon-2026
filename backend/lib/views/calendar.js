'use strict';

/**
 * UC-017 — deadline points AND work periods.
 *
 * The timeline is the part most competing teams will not have: a task is drawn
 * as the whole span it should be worked across, shaded by how much of that span
 * has elapsed against how much progress was actually recorded. A student who is
 * behind can see it without reading a number.
 *
 * Pure. Availability comes from PREFS, `now` is a parameter.
 */

const {
  availableHoursBetween, dailyAvailableHours, toMs, MS_PER_DAY,
} = require('../scoring/availability');

const round1 = (value) => Math.round(value * 10) / 10;
const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

function remainingHours(task) {
  const effort = Number(task.effortHours);
  if (!Number.isFinite(effort)) return 0;
  return effort * (1 - Math.min(Math.max(Number(task.progressPct) || 0, 0), 100) / 100);
}

/**
 * When work on this task should have started.
 *
 * A planned span uses the first milestone (UC-012 already respected blocked
 * days when it placed them). Without milestones the span is back-calculated
 * from effort against the student's own daily availability — which is an
 * estimate, and is labelled as one (Alt A).
 */
function startFor(task, ownMilestones, prefs) {
  const due = toMs(task.dueAt);

  if (ownMilestones.length > 0) {
    const earliest = Math.min(...ownMilestones.map((m) => toMs(m.dueAt)).filter(Number.isFinite));
    if (Number.isFinite(earliest)) return { at: earliest, planned: true };
  }

  const effort = Number(task.effortHours);
  if (!Number.isFinite(effort) || effort <= 0) {
    return { at: due - MS_PER_DAY, planned: false };
  }

  // Walk back a day at a time until the window holds enough study hours. The
  // bound is a semester; a corrupt far-future effort figure must not loop.
  for (let days = 1; days <= 120; days += 1) {
    const candidate = due - days * MS_PER_DAY;
    if (availableHoursBetween(candidate, due, prefs) >= effort) {
      return { at: candidate, planned: false };
    }
  }
  return { at: due - 120 * MS_PER_DAY, planned: false };
}

/**
 * @param {object[]} ranked      scored tasks (active + overdue)
 * @param {object[]} milestones
 * @param {object} prefs
 * @param {string|number|Date} now
 * @param {{from?:string, to?:string}} [window]
 */
function calendarView(ranked, milestones, prefs, now, window = {}) {
  const nowMs = toMs(now);
  const from = Number.isFinite(toMs(window.from)) ? toMs(window.from) : nowMs - 7 * MS_PER_DAY;
  const to = Number.isFinite(toMs(window.to)) ? toMs(window.to) : nowMs + 56 * MS_PER_DAY;

  const inRange = ranked.filter((task) => {
    const due = toMs(task.dueAt);
    return Number.isFinite(due) && due >= from && due <= to;
  });

  const entries = inRange.map((task, index) => ({
    taskId: task.taskId,
    title: task.title,
    module: task.module || null,
    type: task.type,
    dueAt: task.dueAt,
    status: task.status,
    gradeWeight: task.gradeWeight ?? null,
    priorityScore: task.priorityScore,
    // The badge on a calendar entry is its rank in the ranked set it came from.
    rank: task.priorityScore === null ? null : index + 1,
    tight: Boolean(task.tight),
  }));

  const spans = inRange.map((task) => {
    const due = toMs(task.dueAt);
    const own = (milestones || [])
      .filter((m) => m.taskId === task.taskId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const { at, planned } = startFor(task, own, prefs);

    const created = toMs(task.createdAt);
    // E1 — a computed start before the task existed is clipped rather than
    // drawn off-canvas, and says why.
    const startedLate = Number.isFinite(created) && at < created;
    const start = startedLate ? created : at;

    const length = Math.max(due - start, MS_PER_DAY / 24);
    const elapsedPct = Math.round(clamp01((nowMs - start) / length) * 100);

    return {
      taskId: task.taskId,
      title: task.title,
      module: task.module || null,
      startAt: new Date(start).toISOString(),
      dueAt: task.dueAt,
      planned,
      startedLate,
      status: task.status,
      progressPct: Math.round(Number(task.progressPct) || 0),
      elapsedPct,
      // The gap the view exists to expose: time gone, work not done.
      behindBy: Math.max(elapsedPct - Math.round(Number(task.progressPct) || 0), 0),
      remainingHours: round1(remainingHours(task)),
      milestones: own.map((m) => ({
        milestoneId: m.milestoneId,
        name: m.name,
        dueAt: m.dueAt,
        hours: m.hours ?? null,
        done: Boolean(m.completedAt),
      })),
    };
  });

  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    entries,
    spans,
    // Alt B — the frontend switches to a weekly scale past eight weeks.
    scale: to - from > 56 * MS_PER_DAY ? 'week' : 'day',
    todayAvailableHours: round1(dailyAvailableHours(nowMs, prefs)),
  };
}

module.exports = { calendarView, startFor };
