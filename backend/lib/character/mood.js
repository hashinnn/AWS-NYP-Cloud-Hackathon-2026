'use strict';

/**
 * The study companion's mood.
 *
 * Pure, like the scoring engine and for the same reason: a character that
 * reacts to your week is only reassuring if the reaction is explainable. Every
 * mood comes back with the figures that produced it, so the widget can say
 * *why* it looks the way it does instead of emoting at the student.
 *
 *   mood(tasks, ranking, now) -> { state, headline, detail, facts }
 *
 * No clock reads, no I/O — `now` is passed in.
 */

const MS_PER_DAY = 86400000;
const MS_PER_HOUR = 3600000;

// (b) Past this many hours in one day the companion stops encouraging and
// starts asking the student to stop. Six is the figure the product owner set.
const LONG_SESSION_HOURS = 6;

// (a) Neglect needs both halves: silence AND pressure. Two days of not
// studying during a quiet fortnight is a normal life, not a problem.
const NEGLECT_DAYS = 2;
const PRESSURE_WINDOW_DAYS = 7;

const toMs = (value) => (value ? Date.parse(value) : NaN);

/** Every `hoursSpent` increase ever recorded, newest first. */
function studyEvents(tasks) {
  const events = [];
  for (const task of tasks) {
    for (const entry of task.history || []) {
      if (entry.field !== 'hoursSpent') continue;
      const delta = Number(entry.to) - Number(entry.from);
      const at = toMs(entry.at);
      if (delta > 0 && Number.isFinite(at)) {
        events.push({ at, hours: delta, taskId: task.taskId, title: task.title });
      }
    }
  }
  return events.sort((a, b) => b.at - a.at);
}

/**
 * @param {object[]} tasks every TASK item, with its `history`
 * @param {object[]} ranking the scored active set, best first
 * @param {Date|number|string} now
 */
function mood(tasks, ranking, now) {
  const nowMs = toMs(typeof now === 'string' ? now : new Date(now).toISOString());
  const active = (ranking || []).filter((task) => task.priorityScore !== null);
  const events = studyEvents(tasks || []);

  const hoursToday = events
    .filter((event) => nowMs - event.at < MS_PER_DAY)
    .reduce((sum, event) => sum + event.hours, 0);

  const lastStudied = events.length > 0 ? events[0].at : null;
  const daysSinceStudy = lastStudied === null
    ? Infinity
    : (nowMs - lastStudied) / MS_PER_DAY;

  const dueSoon = active.filter((task) => {
    const due = toMs(task.dueAt);
    return Number.isFinite(due) && due > nowMs && due - nowMs < PRESSURE_WINDOW_DAYS * MS_PER_DAY;
  }).length;
  const overdue = active.filter((task) => task.status === 'overdue').length;
  const tight = active.filter((task) => task.tight).length;

  const facts = {
    hoursToday: Math.round(hoursToday * 10) / 10,
    daysSinceStudy: Number.isFinite(daysSinceStudy) ? Math.floor(daysSinceStudy) : null,
    dueSoon,
    overdue,
    tight,
    topTask: active[0] ? active[0].title : null,
  };

  // ── (b) overwork wins outright ──────────────────────────────────────────
  // Ranked first on purpose: everything below is about getting more work out
  // of the student, and none of it should be said to someone who has already
  // done six hours today.
  if (hoursToday >= LONG_SESSION_HOURS) {
    return {
      state: 'tired',
      headline: `${facts.hoursToday} hours today — take a break.`,
      detail: 'Long sessions stop paying off. Twenty minutes away will do more than another hour.',
      facts,
    };
  }

  // ── (c) the wrong task is being worked on ───────────────────────────────
  // The clearest expression of the whole product: the companion knows what
  // ranked first, notices you are on something else, and says which.
  const recent = events.find((event) => nowMs - event.at < MS_PER_DAY);
  if (recent && active.length > 1 && active[0].taskId !== recent.taskId) {
    const worked = active.find((task) => task.taskId === recent.taskId);
    if (worked) {
      const rank = active.indexOf(worked) + 1;
      return {
        state: 'worried',
        headline: `${active[0].title} outranks what you're working on.`,
        detail: `${worked.title} is #${rank}. ${active[0].title} is #1 — you can check the maths on its card.`,
        facts: { ...facts, workingOn: worked.title, workingOnRank: rank },
      };
    }
  }

  // ── (a) neglect: silence plus pressure ──────────────────────────────────
  if (daysSinceStudy >= NEGLECT_DAYS && (dueSoon > 0 || overdue > 0)) {
    const pile = overdue > 0 ? `${overdue} overdue` : `${dueSoon} due this week`;
    return {
      state: 'sad',
      headline: lastStudied === null
        ? `Nothing logged yet, and ${pile}.`
        : `No study logged in ${facts.daysSinceStudy} days, and ${pile}.`,
      detail: facts.topTask ? `Start with ${facts.topTask} — even 30 minutes counts.` : 'Even 30 minutes counts.',
      facts,
    };
  }

  if (hoursToday > 0) {
    return {
      state: 'happy',
      headline: `${facts.hoursToday} hours logged today.`,
      detail: tight > 0
        ? `${tight} task${tight === 1 ? '' : 's'} still won't fit — worth a look at Workload.`
        : 'On top of it.',
      facts,
    };
  }

  return {
    state: 'neutral',
    headline: facts.topTask ? `${facts.topTask} is next up.` : 'Nothing due — you\'re clear.',
    detail: dueSoon > 0 ? `${dueSoon} deadline${dueSoon === 1 ? '' : 's'} this week.` : 'Add a task to get started.',
    facts,
  };
}

module.exports = { mood, LONG_SESSION_HOURS, NEGLECT_DAYS, MS_PER_HOUR };
