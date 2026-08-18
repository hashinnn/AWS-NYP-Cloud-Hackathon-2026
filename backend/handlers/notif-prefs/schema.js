'use strict';

const { z } = require('../../lib/validate');

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:mm');

const leadDays = z.number().int().min(0).max(30);

const notificationPrefs = z.object({
  channels: z.object({
    email: z.boolean().optional(),
    // Alt A — in-app is not a switch. Nothing is ever lost entirely, so the
    // field is accepted and ignored rather than rejected with an error the
    // student cannot act on.
    inApp: z.boolean().optional(),
  }).optional(),
  digestAt: hhmm.optional(),
  quietHours: z.object({ start: hhmm, end: hhmm }).optional(),
  dailyCap: z.number().int().min(1).max(5).optional(),
  leadTimes: z.object({
    test: leadDays.optional(),
    project: leadDays.optional(),
    assignment: leadDays.optional(),
    presentation: leadDays.optional(),
  }).optional(),
  escalationEnabled: z.boolean().optional(),
}).strict();

module.exports = { notificationPrefs };
