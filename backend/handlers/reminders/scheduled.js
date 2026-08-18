'use strict';

/**
 * The EventBridge entry point — UC-019 [Z-05].
 *
 * Two rules, one Lambda, distinguished only by the input payload:
 *
 *   deadlineiq-hourly-recompute  rate(1 hour)        {"job":"recompute"}
 *   deadlineiq-daily-digest      cron(0 0 * * ? *)   {"job":"digest"}
 *
 * One handler, one log group, one code path to debug.
 */

const { runJob } = require('../../lib/reminders/run');

exports.handler = async (event = {}) => {
  const job = event.job === 'digest' ? 'digest' : 'recompute';
  const startedAt = Date.now();

  const result = await runJob({ job, now: new Date() });

  // The line the team points at in CloudWatch during judging.
  console.log(JSON.stringify({
    level: 'INFO',
    event: 'reminder_job',
    job,
    durationMs: Date.now() - startedAt,
    ...result,
  }));

  return result;
};
