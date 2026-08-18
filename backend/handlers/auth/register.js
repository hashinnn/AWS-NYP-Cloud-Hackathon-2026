'use strict';

/**
 * POST /api/auth/register — UC-001 main flow steps 2–6.
 * Public route: there is no token yet.
 */

const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');
const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const { createUser, publicUser } = require('../../lib/dynamo/users');
const { sign } = require('../../lib/auth/jwt');
const schema = require('./schema');

const BCRYPT_COST = 10;   // HLD §10.4

exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.register);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);

  let profile;
  try {
    profile = await createUser(userId, {
      email: body.email,
      displayName: body.displayName,
      passwordHash,
      tz: body.tz,
    });
  } catch (error) {
    // The access layer has already retried throttling three times (UC-001 E5).
    console.error({ uc: 'UC-001', action: 'register', outcome: 'storage_error', name: error.name });
    return fail(503, 'storage_unavailable', 'Could not create your account — please try again.');
  }

  if (!profile) {
    return fail(409, 'email_exists', 'An account with this email already exists.');
  }

  return ok(201, { token: sign(profile), user: publicUser(profile) });
};
