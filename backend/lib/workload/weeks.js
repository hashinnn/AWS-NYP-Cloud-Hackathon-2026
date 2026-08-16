'use strict';

/**
 * UC-013 steps 1–3 and UC-018 — the 12-week capacity picture.
 *
 *   requiredHours  = work that has to happen in that week
 *   availableHours = study hours the student actually has
 *   loadRatio      = required / available      > 1.0 → CRASH WEEK
 *
 * INTERPRETATION worth knowing (HLD §11.3 reads as if both tasks and
 * milestones always contribute): a task WITH milestones contributes through
 * its milestones only, and a task WITHOUT milestones contributes its remaining
 * hours in its deadline week. Counting both would double-count the same work,
 * and — more importantly — UC-013 step 6 requires that shifting milestone
 * dates visibly lowers a crash week's ratio, which is only true if milestones
 * are what the buckets are made of.
 */

const {
  availableHoursBetween, toMs, localDateKey, startOfLocalDay, MS_PER_DAY,
} = require('../scoring/availability');

const WEEK_MS = 7 * MS_PER_DAY;
const DEFAULT_WEEK_COUNT = 12;

const round1 = (value) => Math.round(value * 10) / 10;

/** Monday 00:00 in the student's timezone, for the week containing `when`. */
function localWeekStart(when, tz) {
  const dayStart = startOfLocalDay(when, tz);
  const key = localDateKey(dayStart, tz);
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const sinceMonday = (weekday + 6) % 7;
  return startOfLocalDay(dayStart - sinceMonday * MS_PER_DAY, tz);
}

function remainingHours(task) {
  const effort = Number(task.effortHours);
  if (!Number.isFinite(effort)) return 0;
  const progress = Math.min(Math.max(Number(task.progressPct) || 0, 0), 100);
  return effort * (1 - progress / 100);
}

/**
 * Everything that has to be done, as dated units of work.
 * Overdue tasks are deliberately absent: they are pinned at the top of every
 * list but must not distort future capacity (HLD §5.6).
 */
function workUnits(tasks, milestones) {
  const units = [];
  const byTask = new Map();
  for (const milestone of milestones) {
    if (milestone.completedAt) continue;
    if (!byTask.has(milestone.taskId)) byTask.set(milestone.taskId, []);
    byTask.get(milestone.taskId).push(milestone);
  }

  for (const task of tasks) {
    if (task.status !== 'active') continue;

    const own = byTask.get(task.taskId) || [];
    if (own.length > 0) {
      for (const milestone of own) {
        units.push({
          taskId: task.taskId,
          milestoneId: milestone.milestoneId,
          title: milestone.name,
          taskTitle: task.title,
          module: task.module || null,
          hours: Number(milestone.hours) || 0,
          at: toMs(milestone.dueAt),
          source: 'milestone',
        });
      }
      continue;
    }

    units.push({
      taskId: task.taskId,
      milestoneId: null,
      title: task.title,
      taskTitle: task.title,
      module: task.module || null,
      hours: remainingHours(task),
      at: toMs(task.dueAt),
      source: 'task',
      tight: task.tight === true,
      priorityScore: task.priorityScore,
    });
  }

  return units.filter((unit) => Number.isFinite(unit.at) && unit.hours > 0);
}

/**
 * @returns {object[]} one entry per week, starting with the week containing `now`
 */
function buildWeeks(tasks, milestones, prefs, now, weekCount = DEFAULT_WEEK_COUNT) {
  const nowMs = toMs(now);
  const tz = prefs && prefs.tz;
  const units = workUnits(tasks, milestones);
  const firstWeekStart = localWeekStart(nowMs, tz);

  const weeks = [];
  for (let i = 0; i < weekCount; i += 1) {
    const start = startOfLocalDay(firstWeekStart + i * WEEK_MS, tz);
    const end = startOfLocalDay(firstWeekStart + (i + 1) * WEEK_MS, tz);

    // Hours already gone in the current week cannot be spent — the first
    // bucket measures from now, not from Monday.
    const capacityFrom = Math.max(start, nowMs);
    const availableHours = round1(availableHoursBetween(capacityFrom, end, prefs));

    const inWeek = units.filter((unit) => unit.at >= start && unit.at < end);
    const requiredHours = round1(inWeek.reduce((sum, unit) => sum + unit.hours, 0));

    // E1 — a fully blocked week has no ratio, not a zero and not an error.
    const unavailable = availableHours === 0;
    const loadRatio = unavailable ? null : round1(requiredHours / availableHours);

    weeks.push({
      weekStart: new Date(start).toISOString(),
      weekEnd: new Date(end).toISOString(),
      label: weekLabel(start, tz),
      requiredHours,
      availableHours,
      loadRatio,
      unavailable,
      crash: unavailable ? requiredHours > 0 : loadRatio > 1,
      overloadHours: round1(Math.max(requiredHours - availableHours, 0)),
      tasks: inWeek.map((unit) => ({
        taskId: unit.taskId,
        milestoneId: unit.milestoneId,
        title: unit.title,
        module: unit.module,
        hours: round1(unit.hours),
        at: new Date(unit.at).toISOString(),
        source: unit.source,
      })),
    });
  }

  return weeks;
}

/** "17 Aug" — how the recommendation sentence names a week. */
function weekLabel(when, tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'Asia/Singapore', day: 'numeric', month: 'short',
    }).format(new Date(toMs(when)));
  } catch {
    return new Date(toMs(when)).toISOString().slice(0, 10);
  }
}

module.exports = {
  buildWeeks,
  workUnits,
  localWeekStart,
  weekLabel,
  remainingHours,
  WEEK_MS,
  DEFAULT_WEEK_COUNT,
};
