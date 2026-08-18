'use strict';

/**
 * POST /api/reminders/test — UC-020 step 6.
 *
 * Sends a real reminder through the real delivery path. This button exists to
 * diagnose delivery, so a failure reports the specific reason rather than a
 * generic error (E1) — "email delivery failed" is what tells the student their
 * address is wrong, and it is what proves the pipeline on stage.
 */

const { ok, fail } = require('../../lib/http');
const { send, channelAvailable } = require('../../lib/notify/send');
const { getAllForUser } = require('../../lib/dynamo/tasks');
const { extractPrefs, scoringPrefs } = require('../../lib/dynamo/prefs');
const { localDateKey } = require('../../lib/scoring/availability');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const now = new Date();

  try {
    const items = await getAllForUser(userId);
    const profile = items.find((item) => item.SK === 'PROFILE') || {};
    const prefs = scoringPrefs(items, extractPrefs(items));
    const emailEnabled = !(prefs.channels && prefs.channels.email === false);

    const outcome = await send({
      userId,
      rule: 'digest',
      // A unique subject key so the idempotency guard never swallows a second
      // press of the button — the student pressed it twice on purpose.
      taskId: `test-${now.toISOString()}`,
      date: localDateKey(now, prefs.tz),
      subject: 'DeadlineIQ — test notification',
      body: 'This is a test reminder from DeadlineIQ. Your notification pipeline is working.',
      email: profile.email,
      emailEnabled,
      test: true,
    });

    if (outcome.failure) {
      return fail(502, 'delivery_failed', `Email delivery failed — ${outcome.failure}`);
    }

    return ok(200, {
      delivered: outcome.delivered,
      channel: outcome.channel,
      // When no channel is configured the in-app copy is still written, and
      // saying so beats a success message the student cannot see anywhere.
      note: channelAvailable() && emailEnabled
        ? null
        : 'No email channel is configured — the reminder was written in-app only.',
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'test_notification_failed', message: error.message,
    }));
    return fail(502, 'delivery_failed', `Test notification failed — ${error.message}`);
  }
};
