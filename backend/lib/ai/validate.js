'use strict';

/**
 * Response validation pipeline — HLD §8.4.
 *
 * The numeral-provenance check is the mechanism that makes the thesis
 * enforceable: a sentence may only contain numbers the arithmetic put in front
 * of it. A hallucinated figure inside a priority explanation would destroy the
 * credibility of the whole system, so this is strict rather than lenient — and
 * a discarded response costs nothing, because the template is always ready.
 */

const MAX_WORDS = 30;

/** Strip ``` fences, leading prose and trailing commentary, then parse. */
function extractJson(raw) {
  const text = String(raw || '').trim();

  const attempts = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1]);
  attempts.push(text);

  // Last resort: the outermost {...} or [...] in the response.
  const firstBrace = text.search(/[[{]/);
  const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate.trim());
    } catch {
      // try the next shape — HLD §8.4 allows one re-parse attempt
    }
  }
  return null;
}

/** Every numeral the payload legitimately authorises the model to use. */
function allowedNumerals(payload) {
  const allowed = new Set();

  const add = (value) => {
    if (!Number.isFinite(value)) return;
    allowed.add(String(value));
    allowed.add(String(Math.round(value)));
    allowed.add(value.toFixed(1));
    allowed.add(String(Math.floor(value)));
  };

  const walk = (node) => {
    if (node === null || node === undefined) return;
    if (typeof node === 'number') return add(node);
    if (typeof node === 'string') {
      // Numbers embedded in supplied strings (e.g. a module code) count too.
      for (const match of node.matchAll(/\d+(?:\.\d+)?/g)) allowed.add(match[0]);
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === 'object') return Object.values(node).forEach(walk);
  };

  walk(payload);
  return allowed;
}

/** Strip markdown, quotes and preamble; keep the first sentence (UC-010 E3). */
function firstSentence(raw) {
  let text = String(raw || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]/g, '')
    // "Sure, here is your sentence:" and friends.
    .replace(/^\s*(?:sure|certainly|of course|absolutely|here(?:'s| is)?)[^:\n]{0,60}:\s*/i, '')
    .replace(/^["'\s]+/, '')
    .trim();

  // Cut at the first terminator that ends a sentence — a closing quote may sit
  // between it and the whitespace, and "10.2" is not a sentence break.
  const match = text.match(/^[\s\S]*?[.!?](?=["']?(?:\s|$))/);
  if (match) text = match[0];

  return text.replace(/^["'\s]+|["'\s]+$/g, '').trim();
}

function wordCount(sentence) {
  return sentence.split(/\s+/).filter(Boolean).length;
}

/**
 * UC-010 steps 5–6 / E2 / E3.
 *
 * @param {string} raw model output
 * @param {object} payload the numbers-only input the model was given
 * @returns {{ok:true, sentence:string} | {ok:false, reason:string}}
 */
function validateNarration(raw, payload) {
  const sentence = firstSentence(raw);
  if (!sentence) return { ok: false, reason: 'empty' };

  if (wordCount(sentence) > MAX_WORDS) return { ok: false, reason: 'too_long' };

  const allowed = allowedNumerals(payload);
  for (const match of sentence.matchAll(/\d+(?:\.\d+)?/g)) {
    if (!allowed.has(match[0])) {
      return { ok: false, reason: `unsupported_numeral:${match[0]}` };
    }
  }

  return { ok: true, sentence };
}

module.exports = {
  extractJson,
  validateNarration,
  allowedNumerals,
  firstSentence,
  wordCount,
  MAX_WORDS,
};
