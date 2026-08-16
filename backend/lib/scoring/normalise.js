'use strict';

/**
 * Weight normalisation (UC-009 step 3, E3) and tie-breaking (HLD §7.3).
 */

const { toMs } = require('./availability');

const DEFAULT_WEIGHTS = Object.freeze({
  urgency: 0.30,
  stakes: 0.25,
  effortPressure: 0.20,
  progressDeficit: 0.15,
  clashPenalty: 0.10,
});

const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS);
const SUM_TOLERANCE = 1e-9;

function warn(event, detail) {
  // Structured so CloudWatch Logs Insights can filter on `event` (HLD §10.6).
  console.warn(JSON.stringify({ level: 'WARN', event, ...detail }));
}

/**
 * UC-009 E3 — corrupted PREFS weights are re-normalised to sum 1.0 and logged,
 * never rejected. A student is not blocked from seeing a ranking because a
 * slider wrote a bad number.
 *
 * @param {object|undefined} weights
 * @returns {{urgency:number, stakes:number, effortPressure:number,
 *            progressDeficit:number, clashPenalty:number}} sums to 1.0
 */
function normaliseWeights(weights) {
  if (!weights || typeof weights !== 'object') return { ...DEFAULT_WEIGHTS };

  const out = {};
  let sum = 0;
  for (const key of WEIGHT_KEYS) {
    const value = Number(weights[key]);
    out[key] = Number.isFinite(value) && value > 0 ? value : 0;
    sum += out[key];
  }

  if (sum <= 0) {
    warn('weights_invalid', { reason: 'sum_not_positive', received: weights });
    return { ...DEFAULT_WEIGHTS };
  }

  if (Math.abs(sum - 1) > SUM_TOLERANCE) {
    warn('weights_normalised', { sum });
    for (const key of WEIGHT_KEYS) out[key] /= sum;
  }

  return out;
}

/**
 * Tie-break order (HLD §7.3): higher priorityScore → earlier dueAt →
 * higher gradeWeight → taskId ascending.
 *
 * The final taskId comparison is what makes the order stable across renders,
 * which is what makes UC-015's reorder animation legible instead of jittery.
 */
function compareTasks(a, b) {
  const scoreA = Number.isFinite(a.priorityScore) ? a.priorityScore : -Infinity;
  const scoreB = Number.isFinite(b.priorityScore) ? b.priorityScore : -Infinity;
  if (scoreA !== scoreB) return scoreB - scoreA;

  const dueA = toMs(a.dueAt);
  const dueB = toMs(b.dueAt);
  if (dueA !== dueB) return dueA - dueB;

  const weightA = Number(a.gradeWeight) || 0;
  const weightB = Number(b.gradeWeight) || 0;
  if (weightA !== weightB) return weightB - weightA;

  return String(a.taskId ?? '').localeCompare(String(b.taskId ?? ''));
}

module.exports = { normaliseWeights, compareTasks, DEFAULT_WEIGHTS, WEIGHT_KEYS };
