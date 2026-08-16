'use strict';

/**
 * UC-011 step 6 — why the next task ranked below the previous one.
 *
 * A small feature with disproportionate impact: when a student overrides the
 * ordering with "Not now", the ordering stays transparent instead of becoming
 * a thing they argued with once and stopped trusting.
 */

const { contributions, LABELS } = require('./contributions');
const { toMs, MS_PER_DAY } = require('../scoring/availability');

const num = (value) => String(Math.round(value * 10) / 10).replace(/\.0$/, '');

function daysUntil(task, nowMs) {
  return Math.max(Math.round((toMs(task.dueAt) - nowMs) / MS_PER_DAY), 0);
}

function phrase(key, higher, lower, nowMs) {
  switch (key) {
    case 'stakes': {
      const a = Number(lower.gradeWeight);
      const b = Number(higher.gradeWeight);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return 'lower stakes';
      const of = (task) => (task.module ? ` of ${task.module}` : '');
      return `lower stakes: ${num(a)}%${of(lower)} versus ${num(b)}%${of(higher)}`;
    }
    case 'urgency':
      return `further away: due in ${daysUntil(lower, nowMs)} days versus ${daysUntil(higher, nowMs)}`;
    case 'effortPressure':
      return higher.tight && !lower.tight
        ? 'the other one no longer fits the time left, this one still does'
        : 'more breathing room for the hours it needs';
    case 'progressDeficit':
      return 'closer to where it should be by now';
    case 'clashPenalty':
      return 'fewer deadlines around it that week';
    default:
      return `lower ${LABELS[key] || key}`;
  }
}

/**
 * @returns {{key:string, label:string, delta:number, text:string}} the single
 *   biggest reason `lower` sits below `higher`
 */
function reasonRankedLower(higher, lower, weights, nowMs) {
  const a = contributions(higher.subScores || {}, weights);
  const b = new Map(contributions(lower.subScores || {}, weights).map((c) => [c.key, c]));

  const biggest = a
    .map((c) => ({ key: c.key, label: c.label, delta: c.weighted - (b.get(c.key)?.weighted ?? 0) }))
    .sort((x, y) => y.delta - x.delta)[0];

  if (!biggest || biggest.delta <= 0) {
    return { key: null, label: null, delta: 0, text: 'a close call — the scores are almost level' };
  }

  return { ...biggest, text: phrase(biggest.key, higher, lower, nowMs) };
}

module.exports = { reasonRankedLower };
