'use strict';

/**
 * UC-009 — the priority engine. HLD §7.
 *
 * The whole product is that this file contains no model call, no randomness
 * and no hidden state: identical inputs always produce identical output, and a
 * judge can reproduce any ranking on a whiteboard.
 *
 *   score(tasks, prefs, now) → tasks[]
 *
 * Imported by the task write handlers (UC-002/003/008), the availability and
 * weight handlers (UC-004/015) and the hourly recompute Lambda (UC-019).
 * Never called over HTTP — there is exactly one implementation of the ranking.
 */

const urgency = require('./urgency');
const stakes = require('./stakes');
const effortPressure = require('./effortPressure');
const progressDeficit = require('./progressDeficit');
const clashPenalty = require('./clashPenalty');
const { normaliseWeights, compareTasks, DEFAULT_WEIGHTS } = require('./normalise');
const { toMs } = require('./availability');

// UC-009 E2 — a very large set is capped at the nearest deadlines, which is
// every task that could plausibly rank. The rest are marked for the next pass
// rather than dropped.
const MAX_SCORED_TASKS = 100;

// Only these statuses take part in the ranking and in ClashPenalty (HLD §5.6).
const RANKED_STATUSES = new Set(['active', 'overdue']);

// UC-009 step 4 — a move larger than this invalidates the UC-010 sentence.
const STALE_THRESHOLD = 5;

function round1(value) {
  return Math.round(value * 10) / 10;
}

function scoreOne(task, peers, prefs, weights, nowMs) {
  const dataGap = [];

  const stakesResult = stakes(task);
  if (stakesResult.dataGap) dataGap.push(stakesResult.dataGap);

  const effortResult = effortPressure(task, prefs, nowMs);
  if (effortResult.dataGap) dataGap.push(effortResult.dataGap);

  const subScores = {
    urgency: round1(urgency(task, nowMs)),
    stakes: round1(stakesResult.value),
    effortPressure: round1(effortResult.value),
    progressDeficit: round1(progressDeficit(task, nowMs)),
    clashPenalty: round1(clashPenalty(task, peers)),
  };

  // Priority is the sum of the five ROUNDED contributions — the exact figures
  // the stacked bar and the explanation show. Summing full-precision
  // intermediates instead would leave a badge reading 73.4 above five bars
  // that add to 73.5, and an invisible decimal is precisely the "arbitrary"
  // behaviour this system exists to eliminate. It is also how HLD §7.4
  // computes the worked example.
  const priorityScore = round1(
    round1(weights.urgency * subScores.urgency)
    + round1(weights.stakes * subScores.stakes)
    + round1(weights.effortPressure * subScores.effortPressure)
    + round1(weights.progressDeficit * subScores.progressDeficit)
    + round1(weights.clashPenalty * subScores.clashPenalty),
  );

  const moved = !Number.isFinite(task.priorityScore)
    || Math.abs(priorityScore - task.priorityScore) > STALE_THRESHOLD;

  return {
    ...task,
    priorityScore,
    subScores,
    tight: effortResult.tight,
    dataGap,
    // Never clears the flag: only UC-010 writing a fresh explanation does that.
    explanationStale: task.explanationStale === true || moved,
  };
}

/**
 * Rank a student's tasks.
 *
 * @param {object[]} tasks TASK items — the caller supplies the active set
 *   (UC-009 main flow step 1); anything completed/archived/deleted is passed
 *   through untouched and never affects another task's ClashPenalty.
 * @param {object} prefs PREFS item — `weights`, `availability`, `blockedDates`,
 *   plus `tz` copied from PROFILE (defaults to Asia/Singapore).
 * @param {Date|string|number} now explicit clock, so the maths is testable
 * @returns {object[]} new task objects gaining `priorityScore`, `subScores`,
 *   `tight`, `dataGap` and `explanationStale`. Ordered: unscoreable first (the
 *   UC-009 E1 "needs attention" strip), then the ranking, then anything
 *   deferred by E2, then non-ranked statuses.
 */
function score(tasks, prefs, now) {
  const nowMs = toMs(now);
  if (!Number.isFinite(nowMs)) {
    throw new TypeError('score(): `now` must be a Date, epoch ms, or ISO-8601 string');
  }

  const weights = normaliseWeights(prefs && prefs.weights);
  const input = Array.isArray(tasks) ? tasks : [];

  const unscoreable = [];
  const unranked = [];
  let scoreable = [];

  for (const task of input) {
    if (task.status && !RANKED_STATUSES.has(task.status)) {
      unranked.push({ ...task });
      continue;
    }
    // UC-009 E1 — a malformed dueAt must never make a task disappear.
    if (!Number.isFinite(toMs(task.dueAt))) {
      unscoreable.push({
        ...task,
        priorityScore: null,
        subScores: null,
        tight: false,
        dataGap: ['dueAt'],
        unscoreable: true,
      });
      continue;
    }
    scoreable.push(task);
  }

  // ClashPenalty counts across the whole scoreable set, including anything the
  // E2 cap defers, so the cap cannot change another task's score.
  const peers = scoreable;

  let deferred = [];
  if (scoreable.length > MAX_SCORED_TASKS) {
    const byDeadline = [...scoreable].sort(
      (a, b) => toMs(a.dueAt) - toMs(b.dueAt)
        || String(a.taskId ?? '').localeCompare(String(b.taskId ?? '')),
    );
    scoreable = byDeadline.slice(0, MAX_SCORED_TASKS);
    deferred = byDeadline.slice(MAX_SCORED_TASKS).map((task) => ({
      ...task,
      priorityScore: null,
      subScores: null,
      scorePending: true,
    }));
  }

  const ranked = scoreable
    .map((task) => scoreOne(task, peers, prefs, weights, nowMs))
    .sort(compareTasks);

  return [...unscoreable, ...ranked, ...deferred, ...unranked];
}

module.exports = score;
module.exports.score = score;
module.exports.DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;
module.exports.MAX_SCORED_TASKS = MAX_SCORED_TASKS;
module.exports.STALE_THRESHOLD = STALE_THRESHOLD;
