'use strict';

const { z } = require('../../lib/validate');
const { SERIES } = require('../../lib/dynamo/modules');

// Colours are constrained to the eight accessible palette steps. A free-form
// hex would let a student pick something unreadable on one of the two themes,
// and would not map back to a palette slot at render time (HLD §5.3.3).
const colour = z.enum(SERIES);

const createModule = z.object({
  code: z.string().trim().min(2, 'A module code is required').max(10),
  name: z.string().trim().max(80).optional(),
  colour: colour.optional(),
  totalWeight: z.number().min(0).max(1000).optional(),
});

const patchModule = z.object({
  name: z.string().trim().max(80).optional(),
  colour: colour.optional(),
  totalWeight: z.number().min(0).max(1000).optional(),
});

module.exports = { createModule, patchModule };
