'use strict';

// POST /api/notifications/{id}/read — marks one in-app notification read.

const { ok, fail } = require('../../lib/http');
const { markRead } = require('../../lib/dynamo/notifications');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const id = decodeURIComponent((event.pathParameters || {}).id || '');

  if (!id) return fail(400, 'validation_failed', 'A notification id is required.');

  try {
    const updated = await markRead(userId, `NOTIF#${id}`, new Date().toISOString());
    // 404 rather than 403 for something in another partition — existence is
    // never leaked (HLD §10.1).
    if (!updated) return fail(404, 'not_found', 'That notification no longer exists.');
    return ok(204);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'notification_read_failed', message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'Could not update that notification — please retry.');
  }
};
