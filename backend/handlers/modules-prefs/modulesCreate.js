'use strict';

/**
 * POST /api/modules — UC-004 steps 2–3.
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./modulesSchema');
const { createModule, normaliseCode } = require('../../lib/dynamo/modules');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.createModule);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const code = normaliseCode(body.code);

  let created;
  try {
    created = await createModule(userId, {
      code,
      name: body.name,
      colour: body.colour,
      totalWeight: body.totalWeight,
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'module_create_failed', userId, message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'That module could not be saved — please try again.');
  }

  // E1 — the conditional Put refused. The client offers to open the existing
  // module rather than creating a second one.
  if (!created) return fail(409, 'module_exists', `${code} already exists.`);

  const { PK, SK, ...module } = created;
  return ok(201, { module });
};
