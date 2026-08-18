'use strict';

/**
 * POST /api/auth/login — UC-001 Alternative Flow A.
 * Public route.
 *
 * UC-001 E2: unknown email and wrong password return the SAME status and the
 * SAME message. Anything that distinguishes them turns this endpoint into an
 * account-enumeration oracle.
 */

const bcrypt = require('bcryptjs');
const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const { findUserIdByEmail, getProfile, publicUser } = require('../../lib/dynamo/users');
const { sign } = require('../../lib/auth/jwt');
const schema = require('./schema');

const REJECT = () => fail(401, 'invalid_credentials', 'Email or password is incorrect.');

exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.login);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const userId = await findUserIdByEmail(body.email);
  if (!userId) return REJECT();

  const profile = await getProfile(userId);
  if (!profile) return REJECT();

  const matches = await bcrypt.compare(body.password, profile.passwordHash);
  if (!matches) return REJECT();

  return ok(200, { token: sign(profile), user: publicUser(profile) });
};
