'use strict';

/**
 * The single door to the model — HLD §4.6.
 *
 * SHARED FILE: used by UC-010/UC-012 (Hasini) and UC-005/UC-006/UC-007
 * (Mahdiya). No ticket owns it, so it is written here to the documented
 * contract. Mahdiya: extend rather than replace, please.
 *
 * Every caller catches `AiUnavailable` and runs its deterministic fallback.
 * A caller that does not catch it is a bug.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 6000;

class AiUnavailable extends Error {
  constructor(reason) {
    super(`AI unavailable: ${reason}`);
    this.name = 'AiUnavailable';
    this.reason = reason;
  }
}

/** True when the model can even be attempted — the kill-switch test flips this. */
function isConfigured() {
  return Boolean(process.env.AI_API_KEY);
}

/**
 * @param {Array<{role:string, content:string}>} messages
 * @param {{maxTokens?:number, timeoutMs?:number, temperature?:number}} options
 * @returns {Promise<string>} raw assistant text
 * @throws {AiUnavailable} on missing key, timeout, 429, 5xx, or a malformed body
 */
async function chat(messages, options = {}) {
  if (!isConfigured()) throw new AiUnavailable('no_api_key');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL,
        messages,
        max_tokens: options.maxTokens || 300,
        temperature: options.temperature ?? 0.2,
      }),
    });

    if (!response.ok) throw new AiUnavailable(`http_${response.status}`);

    const body = await response.json();
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new AiUnavailable('empty_response');

    return text.trim();
  } catch (error) {
    if (error instanceof AiUnavailable) throw error;
    if (error.name === 'AbortError') throw new AiUnavailable('timeout');
    throw new AiUnavailable(error.name || 'network_error');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chat, isConfigured, AiUnavailable, TIMEOUT_MS };
