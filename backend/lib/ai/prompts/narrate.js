'use strict';

/**
 * UC-010 — the constrained prompt. HLD §8.3.
 *
 * The model receives numbers and nothing else. It writes the sentence; the
 * arithmetic already wrote the ranking.
 */

const SYSTEM = [
  'You rephrase pre-computed study-priority numbers as one plain-English sentence for a student.',
  'Rules, all mandatory:',
  '- Exactly ONE sentence, maximum 30 words.',
  '- Use only the figures given in the JSON. Never introduce a number that is not in it.',
  '- Never invent a task name, a subject, or a date.',
  '- No preamble, no markdown, no quotes, no hedging. Output the sentence only.',
  '- Lead with why it ranks where it does, using the highest-contribution factors first.',
].join('\n');

/**
 * @param {object} payload numbers-only payload from explain/contributions
 * @returns {Array<{role:string, content:string}>}
 */
function buildMessages(payload) {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: JSON.stringify(payload) },
  ];
}

module.exports = { buildMessages, SYSTEM };
