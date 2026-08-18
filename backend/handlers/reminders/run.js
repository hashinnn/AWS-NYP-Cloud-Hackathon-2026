'use strict';

/**
 * POST /api/reminders/run — UC-019 Alt B, the manual trigger.
 *
 * Runs exactly the same job the schedule runs, on demand, so the pipeline can
 * be shown live on stage without waiting an hour for the next tick.
 *
 * This route is NOT behind the JWT authoriser — it is gated by `CRON_SECRET`
 * in the Authorization header instead, because the caller is a machine.
 */

const { ok, fail } = require('../../lib/http');
const { runJob } = require('../../lib/reminders/run');

function authorised(event) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // unset means closed, never open

  const headers = event.headers || {};
  const header = headers.Authorization || headers.authorization || '';
  const presented = header.replace(/^Bearer\s+/i, '');

  // Fixed-length comparison is overkill for a hackathon demo route; a plain
  // comparison against a 32-byte secret is what we ship.
  return presented === secret;
}

exports.handler = async (event) => {
  if (!authorised(event)) {
    return fail(401, 'unauthorised', 'This endpoint requires the scheduler secret.');
  }

  const body = JSON.parse(event.body || '{}');
  const job = body.job === 'digest' ? 'digest' : 'recompute';

  try {
    const result = await runJob({ job, userId: body.userId, now: new Date() });
    return ok(200, result);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'reminder_run_failed', job, message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'The reminder run could not complete — please retry.');
  }
};
