'use strict';

/**
 * UC-010 — produce the sentence.
 *
 * Order of preference: cached (Alt A) → model (validated) → template (E1).
 * This function never throws. `POST /api/explain` never returns an error, and
 * that guarantee starts here.
 */

const { chat, isConfigured, AiUnavailable } = require('../ai/client');
const { validateNarration } = require('../ai/validate');
const { buildMessages } = require('../ai/prompts/narrate');
const { buildPayload, explanationHash, contributions } = require('./contributions');
const { templateSentence } = require('./template');

/**
 * @returns {Promise<{taskId:string, text:string, source:'ai'|'template',
 *   hash:string, contributions:object[], payload:object, cached:boolean}>}
 */
async function explainTask(task, peers, prefs, weights, nowMs, rank, options = {}) {
  const payload = buildPayload(task, peers, prefs, weights, nowMs, rank);
  const hash = explanationHash(task.subScores, weights);
  const bars = contributions(task.subScores || {}, weights);

  const base = { taskId: task.taskId, hash, contributions: bars, payload };

  // Alt A — sub-scores unchanged, so the sentence is still true. No model call:
  // this is what keeps the demo instant and inside free-tier rate limits.
  if (!options.force && task.explanation && task.explanationHash === hash) {
    return {
      ...base,
      text: task.explanation,
      source: task.explanationSource === 'ai' ? 'ai' : 'template',
      cached: true,
    };
  }

  const template = templateSentence(payload);

  if (options.templateOnly || !isConfigured()) {
    return { ...base, text: template, source: 'template', cached: false };
  }

  try {
    const raw = await chat(buildMessages(payload), { maxTokens: 120 });
    const checked = validateNarration(raw, payload);

    // E2/E3 — a sentence that is too long, or cites a number the arithmetic
    // never produced, is discarded outright. The template costs nothing.
    if (!checked.ok) {
      console.warn(JSON.stringify({
        level: 'WARN', event: 'narration_rejected', reason: checked.reason, taskId: task.taskId,
      }));
      return { ...base, text: template, source: 'template', cached: false };
    }

    return { ...base, text: checked.sentence, source: 'ai', cached: false };
  } catch (error) {
    if (!(error instanceof AiUnavailable)) throw error;
    console.warn(JSON.stringify({
      level: 'WARN', event: 'narration_unavailable', reason: error.reason,
    }));
    return { ...base, text: template, source: 'template', cached: false };
  }
}

/** Explanations for several tasks, one model call each, all failures absorbed. */
async function explainMany(tasks, peers, prefs, weights, nowMs, rankOf, options) {
  return Promise.all(tasks.map((task) => explainTask(
    task, peers, prefs, weights, nowMs, rankOf(task), options,
  )));
}

module.exports = { explainTask, explainMany };
