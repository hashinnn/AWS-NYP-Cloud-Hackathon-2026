'use strict';

/**
 * UC-014 — today's study plan.
 *
 * Greedy allocation of today's hours against the same deterministic priority
 * scores that drive every other view. Every block carries the reason it is
 * there, so the plan is as inspectable as the ranking.
 */

const {
  dailyAvailableHours, toMs, MS_PER_DAY,
} = require('../scoring/availability');
const { topContributors, buildFigures } = require('../explain/contributions');
const { clauseFor } = require('../explain/template');

const MIN_BLOCK_HOURS = 0.75; // 45 minutes — no 10-minute fragments
const MAX_BLOCK_HOURS = 3; // switch before one task eats the day

const round2 = (value) => Math.round(value * 100) / 100;
const round1 = (value) => Math.round(value * 10) / 10;

function remainingHours(task) {
  const effort = Number(task.effortHours);
  if (!Number.isFinite(effort)) return 0;
  const progress = Math.min(Math.max(Number(task.progressPct) || 0, 0), 100);
  return effort * (1 - progress / 100);
}

/** The next thing to actually do for a task: its next milestone, else itself. */
function nextUnit(task, milestones) {
  const own = milestones
    .filter((m) => m.taskId === task.taskId && !m.completedAt)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || toMs(a.dueAt) - toMs(b.dueAt));

  if (own.length > 0) {
    return {
      taskId: task.taskId,
      milestoneId: own[0].milestoneId,
      label: own[0].name,
      taskTitle: task.title,
      module: task.module || null,
      hours: Number(own[0].hours) || 0,
      task,
    };
  }

  return {
    taskId: task.taskId,
    milestoneId: null,
    label: task.title,
    taskTitle: task.title,
    module: task.module || null,
    hours: remainingHours(task),
    task,
  };
}

function rationaleFor(task, rank, peers, prefs, nowMs, weights) {
  const reasons = [];
  if (task.tight) reasons.push('the work does not fit the time left');

  const figures = buildFigures(task, peers, prefs, nowMs);
  for (const contributor of topContributors(task.subScores || {}, weights, 2)) {
    const clause = clauseFor(contributor.key, figures, task.tight === true, task.dataGap || []);
    if (clause && reasons.length < 2) reasons.push(clause);
  }

  return `#${rank} priority — ${reasons.join(', ')}`;
}

/**
 * @param {object[]} ranked tasks already scored and sorted by the engine
 * @param {object[]} milestones every milestone for the student
 * @param {object} prefs
 * @param {string|number|Date} now
 * @param {object} weights normalised weights (for the rationale wording)
 * @returns {object} the Today view payload
 */
function planToday(ranked, milestones, prefs, now, weights) {
  const nowMs = toMs(now);
  const availableHours = round1(dailyAvailableHours(nowMs, prefs));

  // Overdue work is shown, never scheduled — it needs a decision (UC-021),
  // not an hour allocation, and counting it would distort today's capacity.
  const overdueStrip = ranked
    .filter((task) => task.status === 'overdue')
    .map((task) => ({
      taskId: task.taskId,
      title: task.title,
      module: task.module || null,
      dueAt: task.dueAt,
      priorityScore: task.priorityScore,
    }));

  const active = ranked.filter((task) => task.status === 'active' && task.priorityScore !== null);

  // E1 — nothing to do is a real state, not a blank page.
  if (active.length === 0) {
    const upcoming = ranked
      .filter((task) => task.status === 'active')
      .sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt))[0];

    return {
      availableHours,
      blocks: [],
      spareHours: availableHours,
      overdueStrip,
      restState: {
        message: overdueStrip.length > 0
          ? 'Nothing scheduled — resolve the overdue items above.'
          : "Nothing due — you're ahead.",
        nextStartBy: upcoming
          ? new Date(toMs(upcoming.dueAt) - (Number(upcoming.prepDays) || 0) * MS_PER_DAY).toISOString()
          : null,
        nextTaskId: upcoming ? upcoming.taskId : null,
      },
    };
  }

  const units = active.map((task, index) => ({
    ...nextUnit(task, milestones),
    rank: index + 1,
    tight: task.tight === true,
  }));

  // UC-014 step 3 — a task the maths says is impossible gets the day's hours first.
  const queue = [...units].sort((a, b) => Number(b.tight) - Number(a.tight) || a.rank - b.rank);
  const pending = queue.map((unit) => ({ ...unit, left: unit.hours }));

  const blocks = [];
  let hoursLeft = availableHours;
  let progressed = true;

  while (hoursLeft >= MIN_BLOCK_HOURS && progressed) {
    progressed = false;
    for (const unit of pending) {
      if (hoursLeft < MIN_BLOCK_HOURS) break;
      if (unit.left <= 0) continue;

      const allocation = round2(Math.min(unit.left, MAX_BLOCK_HOURS, hoursLeft));
      if (allocation < MIN_BLOCK_HOURS) continue;

      blocks.push({
        taskId: unit.taskId,
        milestoneId: unit.milestoneId,
        title: unit.label,
        taskTitle: unit.taskTitle,
        module: unit.module,
        hours: allocation,
        rationale: rationaleFor(unit.task, unit.rank, active, prefs, nowMs, weights),
      });

      unit.left = round2(unit.left - allocation);
      hoursLeft = round2(hoursLeft - allocation);
      progressed = true;
    }
  }

  // E2 — a leftover shorter than a useful block extends the previous one
  // instead of appearing as a fragment.
  if (hoursLeft > 0 && hoursLeft < MIN_BLOCK_HOURS && blocks.length > 0) {
    const last = blocks[blocks.length - 1];
    last.hours = round2(last.hours + hoursLeft);
    hoursLeft = 0;
  }

  const outstanding = round1(pending.reduce((sum, unit) => sum + Math.max(unit.left, 0), 0));

  // Alt A — no hours today. Say what moves and what it costs, rather than
  // showing an empty plan.
  if (availableHours === 0) {
    const tomorrow = round1(dailyAvailableHours(nowMs + MS_PER_DAY, prefs));
    const first = units[0];
    return {
      availableHours: 0,
      blocks: [],
      spareHours: 0,
      overdueStrip,
      shift: {
        message: `No study time today. ${first.taskTitle} moves to tomorrow, leaving `
          + `${round1(first.hours)} hours of work in ${tomorrow} available hours.`,
        taskId: first.taskId,
        hoursDeferred: round1(outstanding),
        tomorrowAvailableHours: tomorrow,
      },
    };
  }

  const result = {
    availableHours,
    blocks,
    spareHours: round1(hoursLeft),
    overdueStrip,
  };

  // Alt B — everything scheduled for today fits, with room left over. The
  // suggestion is the next piece of work in rank order that today's plan did
  // not already reach: the following milestone of the top task, usually.
  if (hoursLeft >= MIN_BLOCK_HOURS && outstanding === 0) {
    const scheduled = new Set(units.map((unit) => unit.milestoneId).filter(Boolean));
    const next = units
      .flatMap((unit) => milestones
        .filter((m) => m.taskId === unit.taskId && !m.completedAt && !scheduled.has(m.milestoneId))
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((m) => ({ taskId: unit.taskId, title: m.name, milestoneId: m.milestoneId })))[0]
      || null;

    result.spare = {
      hours: round1(hoursLeft),
      message: next
        ? `You have ${round1(hoursLeft)} hours spare — you could start ${next.title} early.`
        : `You have ${round1(hoursLeft)} hours spare — you're ahead.`,
      taskId: next ? next.taskId : null,
      milestoneId: next ? next.milestoneId : null,
      title: next ? next.title : null,
    };
  }

  return result;
}

module.exports = { planToday, nextUnit, MIN_BLOCK_HOURS, MAX_BLOCK_HOURS };
