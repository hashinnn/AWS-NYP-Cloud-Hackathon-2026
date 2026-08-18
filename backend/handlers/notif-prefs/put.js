'use strict';

/**
 * PUT /api/prefs/notifications — UC-020 [Z-06]. Class B write.
 *
 * Changes take effect on the next EventBridge invocation; nothing here sends
 * anything. The only cleverness is Alt B: a digest time that falls inside the
 * student's own quiet hours is a conflict they should be told about, not one
 * the system resolves silently by dropping the digest.
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const { patchPrefs, getPrefs, publicPrefs } = require('../../lib/dynamo/prefs');
const { effectiveDigestAt } = require('../../lib/notify/rules');
const schema = require('./schema');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.notificationPrefs);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  try {
    const current = await getPrefs(userId);

    const changes = {};
    if (body.channels) {
      changes.channels = {
        ...current.channels,
        ...body.channels,
        inApp: true, // Alt A — in-app stays on whatever the student sends
      };
    }
    if (body.digestAt) changes.digestAt = body.digestAt;
    if (body.quietHours) changes.quietHours = body.quietHours;
    if (body.dailyCap) changes.dailyCap = body.dailyCap;
    if (body.leadTimes) changes.leadTimes = { ...current.leadTimes, ...body.leadTimes };
    if (body.escalationEnabled !== undefined) changes.escalationEnabled = body.escalationEnabled;

    const prefs = await patchPrefs(userId, changes);

    const warnings = [];
    const digest = effectiveDigestAt(prefs);
    if (digest.deferred) {
      const at = `${String(Math.floor(digest.minutes / 60)).padStart(2, '0')}:${String(digest.minutes % 60).padStart(2, '0')}`;
      warnings.push({
        code: 'digest_in_quiet_hours',
        message: `Your digest time falls inside quiet hours — it will be delivered at ${at} instead.`,
      });
    }
    if (prefs.channels && prefs.channels.email === false) {
      warnings.push({
        code: 'email_disabled',
        message: 'You’ll only see reminders inside the app.',
      });
    }

    return ok(200, { prefs: publicPrefs(prefs), warnings });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'notif_prefs_write_failed', message: error.message,
    }));
    // E2 — the client reverts its controls to the persisted values.
    return fail(503, 'storage_unavailable', 'Settings could not be saved — please try again.');
  }
};
