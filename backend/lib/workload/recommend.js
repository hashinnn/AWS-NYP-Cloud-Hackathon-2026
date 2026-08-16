'use strict';

/**
 * UC-013 step 4 — the redistribution search.
 *
 * Deterministic, like everything that produces advice in this system. The
 * recommendation names a task, a number of days and a number of hours, and a
 * student can check every one of them. Where no plan exists, it says so
 * instead of inventing one (Alt A).
 */

const { toMs, MS_PER_DAY } = require('../scoring/availability');
const { weekLabel } = require('./weeks');

const MAX_CASCADE_WEEKS = 4; // how far back to look for spare capacity
const DISMISS_WINDOW_MS = 48 * 3600000; // UC-013 step 7

// "Move 0.1 hours earlier" is true, useless, and reads as the system flailing.
// Below this, treat the week as having no capacity and say so instead.
const MIN_USEFUL_MOVE_HOURS = 0.5;

// A template breakdown produces at most six pieces, so spreading only helps if
// the earlier weeks can absorb at least one whole piece.
const MAX_TEMPLATE_PIECES = 6;

const round1 = (value) => Math.round(value * 10) / 10;

/** Hours per task inside one week, largest first. */
function candidatesIn(week) {
  const totals = new Map();
  for (const unit of week.tasks) {
    const entry = totals.get(unit.taskId) || { taskId: unit.taskId, hours: 0, earliestAt: Infinity };
    entry.hours += unit.hours;
    totals.set(unit.taskId, entry);
  }
  return [...totals.values()].sort((a, b) => b.hours - a.hours || a.taskId.localeCompare(b.taskId));
}

function spareIn(week) {
  if (week.unavailable) return 0;
  return Math.max(round1(week.availableHours - week.requiredHours), 0);
}

/**
 * @returns {object|null} recommendation, or null when the card should be
 *   suppressed entirely (UC-013 E2 — no misleading advice)
 */
function recommendForWeek(weeks, index, tasksById, prefs) {
  const week = weeks[index];
  if (!week.crash) return null;

  const candidates = candidatesIn(week);
  if (candidates.length === 0) return null; // E2

  const top = candidates[0];
  const task = tasksById.get(top.taskId);
  if (!task) return null; // E2

  const title = task.title || 'this task';
  const overload = week.unavailable
    ? round1(week.requiredHours)
    : round1(week.requiredHours - week.availableHours);

  // Cascade backwards, nearest week first, taking whatever spare capacity exists.
  const moves = [];
  let outstanding = overload;
  for (let j = index - 1; j >= 0 && j >= index - MAX_CASCADE_WEEKS && outstanding > 0; j -= 1) {
    const spare = spareIn(weeks[j]);
    if (spare < MIN_USEFUL_MOVE_HOURS) continue;
    const hours = round1(Math.min(outstanding, spare));
    moves.push({ weekStart: weeks[j].weekStart, label: weeks[j].label, hours, spareHours: spare });
    outstanding = round1(outstanding - hours);
  }

  const spareBefore = round1(moves.reduce((sum, move) => sum + move.hours, 0));

  // Work moves in whole pieces, not in fractions of an hour: a milestone if the
  // task already has them, otherwise one slice of a template breakdown. Spare
  // capacity smaller than one piece cannot receive anything, however
  // encouraging the total looks.
  const hasMilestones = week.tasks.some((u) => u.taskId === top.taskId && u.milestoneId);
  const ownUnits = week.tasks.filter((u) => u.taskId === top.taskId);
  const smallestPiece = hasMilestones
    ? Math.min(...ownUnits.map((u) => u.hours))
    : top.hours / MAX_TEMPLATE_PIECES;

  // Alt A — nowhere to put it. Say so, and name the cheapest thing to cut,
  // rather than offering an Apply button that would change nothing.
  if (moves.length === 0 || spareBefore < smallestPiece) {
    const lowestStakes = candidates
      .map((c) => tasksById.get(c.taskId))
      .filter(Boolean)
      .sort((a, b) => (Number(a.gradeWeight) || 0) - (Number(b.gradeWeight) || 0))[0];

    const scope = lowestStakes
      ? ` Consider reducing scope on your lowest-stakes item — ${lowestStakes.title}`
        + `${Number.isFinite(Number(lowestStakes.gradeWeight)) ? ` (${lowestStakes.gradeWeight}%)` : ''}.`
      : '';

    return {
      kind: 'no_capacity',
      taskId: top.taskId,
      taskTitle: title,
      hoursToMove: overload,
      moves: [],
      suggestTaskId: lowestStakes ? lowestStakes.taskId : null,
      text: `There is no spare capacity in the weeks before this one.${scope}`,
    };
  }

  // Alt B — one task alone is bigger than the whole week. Spreading it is the
  // only real fix, and by now we know there is somewhere to spread it to.
  if (!hasMilestones && top.hours > week.availableHours) {
    return {
      kind: 'break_down',
      taskId: top.taskId,
      taskTitle: title,
      hoursToMove: overload,
      moves,
      text: `${title} alone needs ${round1(top.hours)} hours in a week with ${week.availableHours}. `
        + `Break it into milestones and spread them across the weeks before, starting with the week of ${moves[0].label}.`,
    };
  }

  const primary = moves[0];
  const currentAt = Math.min(...ownUnits.map((u) => toMs(u.at ?? week.weekEnd)));
  const targetAt = toMs(primary.weekStart) + 6 * MS_PER_DAY;
  const daysEarlier = Math.max(Math.round(((Number.isFinite(currentAt) ? currentAt : toMs(week.weekEnd)) - targetAt) / MS_PER_DAY), 1);

  const extra = moves.slice(1)
    .map((move) => ` and ${move.hours} hours into the week of ${move.label}`)
    .join('');
  const shortfall = outstanding > 0
    ? ` That still leaves ${outstanding} hours over — consider trimming scope as well.`
    : '';

  return {
    kind: 'move',
    taskId: top.taskId,
    taskTitle: title,
    hoursToMove: overload,
    daysEarlier,
    moves,
    text: `Start ${title} ${daysEarlier} ${daysEarlier === 1 ? 'day' : 'days'} earlier and move `
      + `${primary.hours} hours into the week of ${primary.label}, which has ${primary.spareHours} spare hours${extra}.${shortfall}`,
  };
}

/** UC-013 step 7 — a dismissed week stays quiet for 48 hours. */
function isDismissed(weekStart, dismissals, now) {
  const at = toMs((dismissals || {})[weekStart]);
  if (!Number.isFinite(at)) return false;
  return toMs(now) - at < DISMISS_WINDOW_MS;
}

/**
 * Every crash week with its recommendation, dismissed ones filtered out.
 */
function crashWeeks(weeks, tasks, prefs, dismissals, now) {
  const tasksById = new Map(tasks.map((task) => [task.taskId, task]));

  return weeks
    .map((week, index) => ({ week, index }))
    .filter(({ week }) => week.crash)
    .filter(({ week }) => !isDismissed(week.weekStart, dismissals, now))
    .map(({ week, index }) => ({
      weekStart: week.weekStart,
      label: week.label,
      loadRatio: week.loadRatio,
      requiredHours: week.requiredHours,
      availableHours: week.availableHours,
      overloadHours: week.overloadHours,
      recommendation: recommendForWeek(weeks, index, tasksById, prefs),
    }))
    .filter((entry) => entry.recommendation !== null); // E2 — suppress, never guess
}

module.exports = {
  crashWeeks,
  recommendForWeek,
  isDismissed,
  spareIn,
  candidatesIn,
  DISMISS_WINDOW_MS,
  MAX_CASCADE_WEEKS,
};
