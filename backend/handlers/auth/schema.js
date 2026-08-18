'use strict';

const { z } = require('../../lib/validate');

// UC-001 step 2 — 8 characters is the stated minimum; the strength meter is a
// frontend affordance, not a server rule.
const register = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().trim().min(1).max(60),
  tz: z.string().optional(),
});

const login = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

module.exports = { register, login };
