'use strict';

/**
 * UC-009 (e) CLASH PENALTY — HLD §7.2e
 *
 *   n            = count of OTHER active tasks with dueAt within ±72 hours
 *   ClashPenalty = min(100, n × 30)
 *
 * Saturates at four clashing tasks. This is the sub-score that answers the
 * brief's "whether multiple deadlines are concentrated in the same week", and
 * it is why any deadline change has to rescore the whole active set rather
 * than one task.
 */

const { toMs } = require('./availability');

const CLASH_WINDOW_MS = 72 * 3600000;
const PER_CLASH = 30;

/**
 * @param {object} task the task being scored
 * @param {object[]} peers every scoreable task in the set, including `task`
 * @returns {number} 0–100
 */
function clashPenalty(task, peers) {
  const due = toMs(task.dueAt);
  let n = 0;

  for (const peer of peers) {
    if (peer === task || peer.taskId === task.taskId) continue;
    // "other ACTIVE tasks" — an overdue deadline is already behind the
    // student and pinned at Urgency 100; it does not also crowd the window.
    if (peer.status && peer.status !== 'active') continue;
    if (Math.abs(toMs(peer.dueAt) - due) <= CLASH_WINDOW_MS) n += 1;
  }

  return Math.min(100, n * PER_CLASH);
}

module.exports = clashPenalty;
module.exports.CLASH_WINDOW_MS = CLASH_WINDOW_MS;
