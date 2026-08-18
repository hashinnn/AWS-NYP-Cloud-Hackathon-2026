'use strict';

/**
 * UC-022 — what the student finished, and how wrong their estimates were.
 *
 * The estimation-accuracy figure is the self-correcting loop: it is offered
 * back as a suggestion at task creation, which makes every future
 * EffortPressure calculation a little more honest.
 *
 * Pure. `now` is a parameter.
 */

const { toMs, localDateKey, MS_PER_DAY } = require('../scoring/availability');

const MIN_SAMPLE = 3; // Alt A — below this the figure would be noise, not data
const OUTLIER_RATIO = 5; // E2 — a mis-logged overnight session, excluded

const round2 = (value) => Math.round(value * 100) / 100;

/** Monday of the local week containing `when`, as an ISO date key. */
function weekKey(when, tz) {
  const key = localDateKey(when, tz);
  if (!key) return null;
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
  const sinceMonday = (weekday + 6) % 7;
  return new Date(Date.parse(`${key}T00:00:00Z`) - sinceMonday * MS_PER_DAY)
    .toISOString().slice(0, 10);
}

function onTime(task) {
  if (task.lateSubmission) return false;
  const done = toMs(task.completedAt);
  const due = toMs(task.dueAt);
  if (!Number.isFinite(done) || !Number.isFinite(due)) return true;
  return done <= due;
}

/**
 * @param {object[]} tasks all TASK items, any status
 * @param {object} prefs   for `tz` — weeks are the student's weeks
 * @param {string|number|Date} now
 */
function completedView(tasks, prefs, now) {
  const tz = prefs && prefs.tz;
  const nowMs = toMs(now);
  const completed = tasks
    .filter((task) => task.status === 'completed')
    .sort((a, b) => toMs(b.completedAt || b.dueAt) - toMs(a.completedAt || a.dueAt));

  const buckets = new Map();
  for (const task of completed) {
    const key = weekKey(task.completedAt || task.dueAt, tz) || 'unknown';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({
      taskId: task.taskId,
      title: task.title,
      module: task.module || null,
      type: task.type,
      dueAt: task.dueAt,
      completedAt: task.completedAt || null,
      gradeWeight: task.gradeWeight ?? null,
      effortHours: task.effortHours ?? null,
      hoursSpent: task.hoursSpent ?? 0,
      onTime: onTime(task),
      lateSubmission: Boolean(task.lateSubmission),
    });
  }

  const weeks = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([weekStart, entries]) => ({
      weekStart,
      tasks: entries,
      onTime: entries.filter((entry) => entry.onTime).length,
      late: entries.filter((entry) => !entry.onTime).length,
    }));

  // E1 — a task with no logged hours says nothing about estimation accuracy;
  // including it as a zero would drag the mean toward "you always overestimate".
  const ratios = completed
    .filter((task) => Number(task.hoursSpent) > 0 && Number(task.effortHours) > 0)
    .map((task) => ({ task, ratio: Number(task.hoursSpent) / Number(task.effortHours) }));

  const usable = ratios.filter((entry) => entry.ratio <= OUTLIER_RATIO);
  const outliers = ratios
    .filter((entry) => entry.ratio > OUTLIER_RATIO)
    .map((entry) => ({
      taskId: entry.task.taskId, title: entry.task.title, ratio: round2(entry.ratio),
    }));

  const sampleSize = usable.length;
  const estimationAccuracy = sampleSize >= MIN_SAMPLE
    ? round2(usable.reduce((sum, entry) => sum + entry.ratio, 0) / sampleSize)
    : null;

  const perModule = [...usable.reduce((map, entry) => {
    const code = entry.task.module || '—';
    if (!map.has(code)) map.set(code, []);
    map.get(code).push(entry.ratio);
    return map;
  }, new Map())].map(([module, values]) => ({
    module,
    ratio: round2(values.reduce((sum, value) => sum + value, 0) / values.length),
    sampleSize: values.length,
  })).sort((a, b) => b.ratio - a.ratio);

  const inWindow = (task, days) => nowMs - toMs(task.completedAt || task.dueAt) <= days * MS_PER_DAY;

  return {
    weeks,
    stats: {
      completedThisWeek: completed.filter((task) => inWindow(task, 7)).length,
      completedThisMonth: completed.filter((task) => inWindow(task, 30)).length,
      onTimeRate: completed.length > 0
        ? round2(completed.filter(onTime).length / completed.length)
        : null,
      estimationAccuracy,
      sampleSize,
      minSample: MIN_SAMPLE,
      // Alt B — never logged hours at all. The panel explains rather than
      // showing an empty number.
      hoursLogged: ratios.length > 0,
      perModule,
      outliers,
    },
  };
}

/**
 * UC-022 step 4 — the suggestion offered at task creation, or null when the
 * evidence does not support one.
 */
function effortHint(stats, typedHours) {
  if (!stats || stats.estimationAccuracy === null) return null;
  const ratio = stats.estimationAccuracy;
  if (ratio >= 0.9 && ratio <= 1.1) return null; // close enough to say nothing

  const suggested = Math.round(Number(typedHours || 0) * ratio);
  return {
    ratio,
    suggestedHours: suggested,
    message: `You usually need about ${ratio}× your estimate`
      + (typedHours ? ` — consider ${suggested} hours instead of ${typedHours}.` : '.'),
  };
}

module.exports = {
  completedView, effortHint, weekKey, onTime, MIN_SAMPLE, OUTLIER_RATIO,
};
