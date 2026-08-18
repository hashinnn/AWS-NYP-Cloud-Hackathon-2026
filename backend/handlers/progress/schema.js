'use strict';

const { z } = require('../../lib/validate');

// progressPct's own 0–100 range is checked separately in the handler so a
// violation maps to the documented `progress_out_of_range` code (HLD §6.3)
// rather than the generic `validation_failed`.
const logProgress = z.object({
  progressPct: z.number().optional(),
  hoursLogged: z.number().positive().max(24).optional(),
}).refine((data) => data.progressPct !== undefined || data.hoursLogged !== undefined, {
  message: 'Provide progressPct or hoursLogged.',
});

module.exports = { logProgress };
