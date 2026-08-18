'use strict';

/**
 * NOTIF# item access — HLD §5.3.6, plus the two SYSTEM# partitions the
 * scheduled job needs (roster and cursor).
 *
 * The composite sort key IS the idempotency key:
 *
 *   NOTIF#<local date>#<taskId>#<rule>
 *
 * Every write is a conditional Put on `attribute_not_exists(SK)`. EventBridge
 * invokes at least once, so the same reminder can be evaluated twice; the
 * second write fails the condition and nothing is sent (UC-019 E3).
 */

const {
  QueryCommand, PutCommand, UpdateCommand, GetCommand,
} = require('@aws-sdk/lib-dynamodb');
const { send, TABLE_NAME, pk } = require('./client');

const ROSTER_PK = 'SYSTEM#users';
const CURSOR_PK = 'SYSTEM#reminders';

const notifSk = ({ date, taskId, rule }) => `NOTIF#${date}#${taskId || rule}#${rule}`;

/**
 * Write the in-app record of a reminder.
 * @returns {Promise<object|null>} the item, or null when it already existed
 */
async function putNotification(userId, notification) {
  const item = {
    PK: pk(userId),
    SK: notifSk(notification),
    userId,
    ...notification,
  };

  try {
    await send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(SK)',
    }));
    return item;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') return null;
    throw error;
  }
}

/** Flip `delivered` after the fact — SNS failed, the in-app copy stands (E1). */
async function markDelivery(userId, sk, { delivered, deliveredAt, failure }) {
  await send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk(userId), SK: sk },
    UpdateExpression: 'SET delivered = :d, deliveredAt = :at, failure = :f',
    ExpressionAttributeValues: {
      ':d': delivered,
      ':at': deliveredAt || null,
      ':f': failure || null,
    },
  }));
}

/** Notifications written on one local date — the daily-cap denominator. */
async function listForDate(userId, date) {
  const page = await send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
    ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
    ExpressionAttributeValues: { ':pk': pk(userId), ':prefix': `NOTIF#${date}#` },
  }));
  return page.Items || [];
}

/**
 * The most recent notifications, newest first.
 *
 * `NOTIF#<date>#…` sorts lexicographically, and an ISO date sorts
 * chronologically, so reverse order is newest-first for free.
 */
async function listRecent(userId, limit = 30) {
  const page = await send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
    ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
    ExpressionAttributeValues: { ':pk': pk(userId), ':prefix': 'NOTIF#' },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return page.Items || [];
}

async function markRead(userId, sk, at) {
  try {
    await send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk(userId), SK: sk },
      UpdateExpression: 'SET readAt = :at',
      ExpressionAttributeValues: { ':at': at },
      ConditionExpression: 'attribute_exists(SK)',
    }));
    return true;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

/**
 * The roster of students the scheduled sweep walks.
 *
 * A `Scan` would be the obvious way to find every student and is forbidden
 * (AGENTS §3), so the sweep reads a partition instead: one small item per
 * student under `SYSTEM#users`. It is written on a dashboard load rather than
 * at registration, which keeps this entirely inside Zoe's files — and "has
 * opened the app" is a fair reading of UC-019 step 2's "each active student".
 */
async function rememberUser(userId, email) {
  try {
    await send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: ROSTER_PK, SK: `USER#${userId}`, userId, email: email || null,
      },
      ConditionExpression: 'attribute_not_exists(SK)',
    }));
  } catch (error) {
    if (error.name !== 'ConditionalCheckFailedException') throw error;
  }
}

/**
 * One page of students, resumable. `after` is the last userId processed, so a
 * run that timed out mid-batch continues rather than restarting (UC-019 E2).
 */
async function listUsers(after, limit = 50) {
  const page = await send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: '#pk = :pk AND #sk > :after',
    ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
    ExpressionAttributeValues: {
      ':pk': ROSTER_PK,
      ':after': after ? `USER#${after}` : 'USER#',
    },
    Limit: limit,
  }));
  return page.Items || [];
}

async function getCursor(job) {
  const result = await send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: CURSOR_PK, SK: `CURSOR#${job}` },
  }));
  return result.Item || null;
}

async function setCursor(job, lastUserId, startedAt) {
  await send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: CURSOR_PK, SK: `CURSOR#${job}`, job, lastUserId, startedAt,
    },
  }));
}

module.exports = {
  putNotification,
  markDelivery,
  listForDate,
  listRecent,
  markRead,
  rememberUser,
  listUsers,
  getCursor,
  setCursor,
  notifSk,
};
