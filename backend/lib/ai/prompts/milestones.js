'use strict';

/**
 * UC-012 — milestone proposal. HLD §8.3.
 *
 * The two hard constraints (one full day of buffer, no blocked days) are NOT
 * asked for here. They are enforced in code afterwards, because a constraint
 * expressed only in a prompt is a suggestion.
 */

const SYSTEM = [
  'You break an academic task into 3 to 6 concrete work milestones.',
  'Return STRICT JSON only — no prose, no markdown fences:',
  '{"milestones":[{"name":"...","hours":0,"dueAt":"YYYY-MM-DD"}]}',
  'Rules:',
  '- Between 3 and 6 milestones, in the order they should be done.',
  '- `hours` must sum to the task\'s effortHours.',
  '- Each `name` is a short actionable phrase, at most 6 words.',
  '- Dates must fall between today and the task deadline.',
].join('\n');

/**
 * @param {object} input {title, type, effortHours, dueAt, today, availability, deliverables}
 */
function buildMessages(input) {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: JSON.stringify({
        title: input.title,
        type: input.type,
        effortHours: input.effortHours,
        dueAt: input.dueAt,
        today: input.today,
        availabilityPerWeekday: input.availability,
        deliverables: input.deliverables || [],
      }),
    },
  ];
}

/** Schema check for the parsed response (HLD §8.4, before the code constraints). */
function isValidShape(parsed) {
  if (!parsed || !Array.isArray(parsed.milestones)) return false;
  if (parsed.milestones.length < 3 || parsed.milestones.length > 6) return false;
  return parsed.milestones.every((m) => typeof m.name === 'string'
    && m.name.trim().length > 0
    && Number.isFinite(Number(m.hours))
    && Number(m.hours) > 0);
}

module.exports = { buildMessages, isValidShape, SYSTEM };
