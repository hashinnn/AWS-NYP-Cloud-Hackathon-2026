'use strict';

/**
 * Thin schema helper over **Zod** — the team's one validation library
 * (AGENTS §3: "Joi or Zod, pick one, tell the team, never both").
 *
 * PROVISIONAL: belongs to Philena's [P-02]. The call shape matches the handler
 * skeleton in AGENTS §9 exactly:
 *
 *   const errors = validate(body, schema.createTask);
 *   if (errors) return fail(400, 'validation_failed', errors[0].message);
 */

const { z } = require('zod');

/**
 * @param {unknown} value
 * @param {import('zod').ZodType} schema
 * @returns {null | Array<{path:string, message:string}>} null when valid
 */
function validate(value, schema) {
  const result = schema.safeParse(value);
  if (result.success) return null;

  return result.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return { path, message: path ? `${path}: ${issue.message}` : issue.message };
  });
}

module.exports = { validate, z };
