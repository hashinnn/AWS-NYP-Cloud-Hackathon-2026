'use strict';

const { z } = require('../../lib/validate');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const hours = z.number().min(0).max(24);

/**
 * UC-004 steps 4–6.
 *
 * This endpoint owns exactly two settings: study availability and blocked
 * dates. `weights` belongs to PUT /api/prefs/weights (UC-015) and the
 * notification block to PUT /api/prefs/notifications (UC-020) — three
 * endpoints write one PREFS item, so each one writes only its own fields.
 * Zod strips the rest, which is what stops a stale client from posting a
 * whole prefs object and silently reverting somebody else's setting.
 */
const putPrefs = z.object({
  availability: z.object(Object.fromEntries(DAYS.map((day) => [day, hours.optional()]))).optional(),
  blockedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Blocked dates must be YYYY-MM-DD')).max(365).optional(),
});

module.exports = { putPrefs, DAYS };
