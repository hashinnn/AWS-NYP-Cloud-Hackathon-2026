'use strict';

/**
 * GET /api/notifications — the in-app inbox.
 *
 * This is what makes "the student never silently misses a reminder" true: a
 * reminder whose email failed (UC-019 E1), and one the daily cap held back
 * (step 5), are both here waiting on next login.
 */

const { ok, fail } = require('../../lib/http');
const { listRecent } = require('../../lib/dynamo/notifications');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;

  try {
    const items = await listRecent(userId, 30);

    return ok(200, {
      notifications: items.map((item) => ({
        // The SK minus its prefix — the id the read endpoint takes back.
        id: String(item.SK).replace(/^NOTIF#/, ''),
        rule: item.rule,
        date: item.date,
        taskId: item.taskId || null,
        subject: item.subject,
        body: item.body,
        delivered: Boolean(item.delivered),
        absorbed: Boolean(item.absorbed),
        failure: item.failure || null,
        createdAt: item.createdAt || null,
        readAt: item.readAt || null,
      })),
      unread: items.filter((item) => !item.readAt).length,
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'notifications_failed', message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'Could not load your notifications — please retry.');
  }
};
