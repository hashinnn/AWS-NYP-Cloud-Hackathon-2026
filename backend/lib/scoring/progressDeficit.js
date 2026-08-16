'use strict';

/**
 * UC-009 (d) PROGRESS DEFICIT — HLD §7.2d
 *
 *   expected        = 100 × (now − createdAt) / (dueAt − createdAt)
 *   ProgressDeficit = max(0, expected − progressPct)
 *
 * Linear expectation across the task's own lifetime. Being ahead of pace
 * scores 0 — the formula never penalises good behaviour.
 */

const { toMs } = require('./availability');

/**
 * @param {object} task with a valid `dueAt`
 * @param {number} nowMs
 * @returns {number} 0–100
 */
function progressDeficit(task, nowMs) {
  const due = toMs(task.dueAt);
  const created = toMs(task.createdAt);
  const progress = Math.min(Math.max(Number(task.progressPct) || 0, 0), 100);

  // No usable creation timestamp means no pace to be behind — stay silent
  // rather than invent a deficit.
  if (!Number.isFinite(created)) return 0;

  const window = due - created;
  // A task created at or after its own deadline (an overdue import) has spent
  // its whole window already.
  const expected = window > 0
    ? Math.min(Math.max((100 * (nowMs - created)) / window, 0), 100)
    : 100;

  return Math.max(0, expected - progress);
}

module.exports = progressDeficit;
