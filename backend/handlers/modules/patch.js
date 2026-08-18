'use strict';

/**
 * PATCH /api/modules/{code} — UC-004, editing a module after creation.
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const { patchModule } = require('../../lib/dynamo/modules');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const code = event.pathParameters.code;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.patchModule);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  // The code itself is the sort key, so renaming a module would be a delete
  // and a re-create — and would orphan every task pointing at the old code.
  const changes = {};
  for (const field of ['name', 'colour', 'totalWeight']) {
    if (field in body) changes[field] = body[field];
  }
  if (Object.keys(changes).length === 0) {
    return fail(400, 'validation_failed', 'Nothing to change.');
  }

  let updated;
  try {
    updated = await patchModule(userId, code, changes);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'module_patch_failed', userId, code, message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'That change could not be saved — please try again.');
  }

  if (!updated) return fail(404, 'not_found', 'That module no longer exists.');

  const { PK, SK, ...module } = updated;
  return ok(200, { module });
};
