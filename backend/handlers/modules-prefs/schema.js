'use strict';

const { z } = require('../../lib/validate');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const availability = z.object(Object.fromEntries(
  DAYS.map((day) => [day, z.number().min(0).max(24)]),
));

/**
 * UC-004 steps 4–6.
 *
 * Deliberately narrow. Zod strips unknown keys, so a client that PUTs the
 * whole prefs object back — which the Workload view does — updates only
 * availability and blocked dates. `weights` has its own endpoint that
 * normalises to sum 1.0 (UC-015), and the notification block has its own
 * (UC-020); routing them through here as well would give normalisation two
 * homes and let them drift.
 */
const putPrefs = z.object({
  availability: availability.partial().optional(),
  blockedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Blocked dates are YYYY-MM-DD')).max(200).optional(),
});

module.exports = { putPrefs, DAYS };
