'use strict';

const { z } = require('../../lib/validate');

// A slider value. Any positive scale is accepted — the server normalises to
// sum 1.0 on write (UC-015 step 5), so the client never has to.
const weight = z.number().min(0).max(1000);

const putWeights = z.object({
  weights: z.object({
    urgency: weight,
    stakes: weight,
    effortPressure: weight,
    progressDeficit: weight,
    clashPenalty: weight,
  }),
});

module.exports = { putWeights };
