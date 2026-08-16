'use strict';

/**
 * UC-010 E1 — the deterministic explanation.
 *
 * This is not a degraded mode. It is the reference implementation: the model
 * is only ever allowed to phrase what this function already knows. With
 * AI_API_KEY unset the UI is byte-identical apart from the wording, which is
 * the whole point of the kill-switch test (AGENTS §15).
 */

const { MAX_WORDS, wordCount } = require('../ai/validate');

const RANK_WORDS = [
  'Top priority', 'Second priority', 'Third priority', 'Fourth priority',
  'Fifth priority', 'Sixth priority', 'Seventh priority', 'Eighth priority',
];

const plural = (n, one, many) => (n === 1 ? one : many);

/** Strip a trailing `.0` so "10.0 hours" reads as "10 hours". */
const num = (value) => String(Math.round(value * 10) / 10).replace(/\.0$/, '');

function rankLabel(rank) {
  return RANK_WORDS[rank - 1] || `Ranked #${rank}`;
}

/**
 * One clause per contributing sub-score, phrased from the same figures the
 * model would receive. Every numeral here comes out of the payload.
 */
function clauseFor(key, figures, tight, dataGap) {
  switch (key) {
    case 'stakes': {
      if (dataGap.includes('gradeWeight')) return 'no grade weight recorded yet';
      const of = figures.module ? ` of ${figures.module}` : ' of your grade';
      return `worth ${num(figures.gradeWeight)}%${of}`;
    }

    case 'urgency': {
      if (figures.daysOverdue !== undefined) {
        return figures.daysOverdue === 0
          ? 'the deadline has passed'
          : `overdue by ${figures.daysOverdue} ${plural(figures.daysOverdue, 'day', 'days')}`;
      }
      if (figures.prepDays) {
        return `${figures.prepDays} ${plural(figures.prepDays, 'day', 'days')} of prep needed before a deadline `
          + `${figures.daysUntilDue} ${plural(figures.daysUntilDue, 'day', 'days')} away`;
      }
      if (figures.daysUntilDue === 0) return 'due today';
      if (figures.daysUntilDue === 1) return 'due tomorrow';
      return `due in ${figures.daysUntilDue} days`;
    }

    case 'effortPressure': {
      // UC-009 Alt B — the explanation names the availability gap as the cause.
      if (figures.availableHours === 0) return 'no study hours free before the deadline';
      if (dataGap.includes('effortHours')) return `only ${num(figures.availableHours)} free hours left`;
      const verb = tight ? 'but only' : 'against';
      return `${num(figures.remainingHours)} hours of work left ${verb} ${num(figures.availableHours)} free`;
    }

    case 'progressDeficit':
      return `${num(figures.progressPct)}% done and behind pace`;

    case 'clashPenalty':
      return figures.clashCount === 1
        ? 'another deadline the same week'
        : `${figures.clashCount} other deadlines the same week`;

    default:
      return null;
  }
}

function joinClauses(clauses) {
  if (clauses.length === 1) return clauses[0];
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
}

/**
 * @param {object} payload from explain/contributions.buildPayload
 * @returns {string} one sentence, ≤ 30 words, every numeral from the payload
 */
function templateSentence(payload) {
  const { figures, rank, tight, dataGap = [] } = payload;

  const clauses = payload.topContributors
    .map((contributor) => clauseFor(contributor.key, figures, tight, dataGap))
    .filter(Boolean);

  if (clauses.length === 0) return `${rankLabel(rank)}: ranked on your current weightings.`;

  let sentence = `${rankLabel(rank)}: ${joinClauses(clauses)}.`;

  // The template obeys the same 30-word limit the model is held to, so the two
  // paths are interchangeable in the UI. Drop the weakest clause if needed.
  while (wordCount(sentence) > MAX_WORDS && clauses.length > 1) {
    clauses.pop();
    sentence = `${rankLabel(rank)}: ${joinClauses(clauses)}.`;
  }

  return sentence;
}

module.exports = { templateSentence, clauseFor, rankLabel };
