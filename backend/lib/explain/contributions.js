'use strict';

/**
 * UC-010 steps 2–3 — turning a scored task into the numbers-only payload.
 *
 * The payload built here is the ONLY thing the narration prompt ever sees.
 * The task title and notes are structurally absent, which is what makes
 * "the model cannot re-rank" a property of the code rather than a promise.
 */

const crypto = require('node:crypto');
const { availableHoursBetween, toMs, MS_PER_DAY } = require('../scoring/availability');
const { CLASH_WINDOW_MS } = require('../scoring/clashPenalty');

const LABELS = {
  urgency: 'Urgency',
  stakes: 'Stakes',
  effortPressure: 'Effort Pressure',
  progressDeficit: 'Progress Deficit',
  clashPenalty: 'Clash Penalty',
};

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Every sub-score with its weighted contribution, highest first.
 * The contribution — not the raw sub-score — is the reason a task ranks where
 * it does, and it is what the stacked bar in UC-011/UC-016 draws.
 */
function contributions(subScores, weights) {
  return Object.keys(LABELS)
    .map((key) => ({
      key,
      label: LABELS[key],
      value: round1(subScores[key] ?? 0),
      weighted: round1((subScores[key] ?? 0) * (weights[key] ?? 0)),
    }))
    .sort((a, b) => b.weighted - a.weighted || a.key.localeCompare(b.key));
}

/** The two or three that actually explain the ranking (UC-010 step 2). */
function topContributors(subScores, weights, limit = 3) {
  // A zero-weighted sub-score is excluded entirely — UC-015 Alt A keeps the
  // words and the bars consistent with the maths.
  return contributions(subScores, weights).filter((c) => c.weighted > 0).slice(0, limit);
}

function clashCount(task, peers) {
  const due = toMs(task.dueAt);
  return peers.filter((peer) => peer.taskId !== task.taskId
    && (!peer.status || peer.status === 'active')
    && Math.abs(toMs(peer.dueAt) - due) <= CLASH_WINDOW_MS).length;
}

/**
 * Supporting figures, pre-rounded so the model can only echo clean numbers
 * back — anything it invents fails the provenance check in ai/validate.js.
 */
function buildFigures(task, peers, prefs, nowMs) {
  const due = toMs(task.dueAt);
  const daysUntilDue = Math.round((due - nowMs) / MS_PER_DAY);
  const effortHours = Number(task.effortHours);
  const progress = Math.min(Math.max(Number(task.progressPct) || 0, 0), 100);

  const figures = {
    daysUntilDue: Math.max(daysUntilDue, 0),
    availableHours: round1(availableHoursBetween(nowMs, task.dueAt, prefs)),
    clashCount: clashCount(task, peers),
    progressPct: progress,
  };

  if (Number.isFinite(Number(task.gradeWeight))) figures.gradeWeight = Number(task.gradeWeight);
  if (task.module) figures.module = task.module;
  if (Number.isFinite(effortHours)) figures.remainingHours = round1(effortHours * (1 - progress / 100));
  if (Number(task.prepDays) > 0) figures.prepDays = Number(task.prepDays);
  if (due < nowMs) figures.daysOverdue = Math.max(Math.round((nowMs - due) / MS_PER_DAY), 0);

  return figures;
}

/**
 * @returns {{rank:number, topContributors:object[], figures:object, tight:boolean,
 *            dataGap:string[]}} — numbers only. No title. No notes.
 */
function buildPayload(task, peers, prefs, weights, nowMs, rank) {
  return {
    rank,
    topContributors: topContributors(task.subScores, weights),
    figures: buildFigures(task, peers, prefs, nowMs),
    tight: task.tight === true,
    dataGap: task.dataGap || [],
  };
}

/**
 * Cache key for UC-010 Alt A — an explanation is reusable exactly while the
 * sub-scores and the weights that ordered them are unchanged.
 */
function explanationHash(subScores, weights) {
  const canonical = Object.keys(LABELS)
    .map((key) => `${key}:${round1(subScores?.[key] ?? 0)}:${round1((weights?.[key] ?? 0) * 100)}`)
    .join('|');
  return crypto.createHash('sha1').update(canonical).digest('hex').slice(0, 16);
}

module.exports = {
  contributions,
  topContributors,
  buildFigures,
  buildPayload,
  explanationHash,
  clashCount,
  LABELS,
};
