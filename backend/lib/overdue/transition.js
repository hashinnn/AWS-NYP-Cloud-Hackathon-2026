'use strict';

/**
 * UC-021 steps 1–3 and Alt B — the system half of overdue handling.
 *
 * Pure. The scheduled run (UC-019) and the live countdown crossing zero in an
 * open session both arrive here, so a task can only become overdue one way.
 *
 * On timezones (E3): `dueAt` is stored as a UTC instant that already means
 * 23:59 in the student's own timezone, so "has it passed" is a comparison of
 * two instants and is timezone-safe by construction. The bug the use case
 * warns about comes from comparing *date strings* — which is why nothing here
 * ever truncates a timestamp to a date.
 */

const { toMs, MS_PER_DAY } = require('../scoring/availability');

const AUTO_ARCHIVE_DAYS = 30;

/** Active tasks whose deadline has passed with the work unfinished. */
function newlyOverdue(tasks, now) {
  const nowMs = toMs(now);
  return tasks.filter((task) => task.status === 'active'
    && Number(task.progressPct) < 100
    && Number.isFinite(toMs(task.dueAt))
    && toMs(task.dueAt) <= nowMs);
}

/**
 * Alt B — overdue for more than 30 days. Abandoned work is archived so it
 * stops distorting the capacity figures for the rest of the semester.
 */
function staleOverdue(tasks, now) {
  const nowMs = toMs(now);
  return tasks.filter((task) => task.status === 'overdue'
    && Number.isFinite(toMs(task.overdueSince || task.dueAt))
    && nowMs - toMs(task.overdueSince || task.dueAt) > AUTO_ARCHIVE_DAYS * MS_PER_DAY);
}

/** One entry appended to `history[]` for every status change (step 5). */
function historyEntry(task, action, at, detail) {
  return [
    ...(Array.isArray(task.history) ? task.history : []),
    { action, at, ...(detail || {}) },
  ];
}

/** The patch that marks a task overdue. */
function overduePatch(task, at) {
  return {
    status: 'overdue',
    overdueSince: at,
    history: historyEntry(task, 'went_overdue', at, { dueAt: task.dueAt }),
  };
}

/**
 * Step 4 — the three honest resolutions, as patches.
 * Returns null when the action is not valid for this task.
 */
function resolutionPatch(task, action, at, newDueAt) {
  if (action === 'complete') {
    return {
      status: 'completed',
      completedAt: at,
      // Feeds the UC-022 on-time rate: this one counts as late.
      lateSubmission: true,
      progressPct: 100,
      history: historyEntry(task, 'completed_late', at),
    };
  }

  if (action === 'reschedule') {
    if (!Number.isFinite(toMs(newDueAt)) || toMs(newDueAt) <= toMs(at)) return null; // E1
    return {
      status: 'active',
      dueAt: newDueAt,
      GSI1SK: `DUE#${newDueAt}`,
      overdueSince: null,
      explanationStale: true,
      history: historyEntry(task, 'rescheduled', at, { from: task.dueAt, to: newDueAt }),
    };
  }

  if (action === 'archive') {
    return {
      status: 'archived',
      history: historyEntry(task, 'archived', at, { reason: 'no longer relevant' }),
    };
  }

  return null;
}

module.exports = {
  newlyOverdue,
  staleOverdue,
  overduePatch,
  resolutionPatch,
  historyEntry,
  AUTO_ARCHIVE_DAYS,
};
