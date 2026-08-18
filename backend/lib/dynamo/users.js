'use strict';

/**
 * PROFILE and account creation — UC-001, HLD §5.3.1 / §5.3.8.
 *
 * Registration writes three items in ONE transaction:
 *   EMAIL#<email> / EMAIL   — uniqueness guard, attribute_not_exists(PK)
 *   USER#<id>     / PROFILE — credentials and display name
 *   USER#<id>     / PREFS   — defaults, so scoring has a capacity model from
 *                             the very first task (HLD §5.3.2)
 *
 * Atomicity is the point: a duplicate email cancels the whole transaction, so
 * UC-001 E1's "no item written" is structural rather than a cleanup path.
 */

const { GetCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { send, TABLE_NAME, pk } = require('./client');
const { DEFAULT_PREFS } = require('./prefs');

const DEFAULT_TZ = 'Asia/Singapore';

/** Emails are matched case- and whitespace-insensitively. */
const normaliseEmail = (email) => String(email || '').trim().toLowerCase();

/** Strip storage keys and the password hash before a profile goes on the wire. */
function publicUser(profile) {
  if (!profile) return null;
  const {
    PK, SK, passwordHash, ...rest
  } = profile;
  return rest;
}

async function createUser(userId, { email, displayName, passwordHash, tz }) {
  const address = normaliseEmail(email);
  const createdAt = new Date().toISOString();

  const profile = {
    PK: pk(userId),
    SK: 'PROFILE',
    userId,
    email: address,
    displayName,
    passwordHash,
    tz: tz || DEFAULT_TZ,
    createdAt,
    feedToken: null,
  };

  try {
    await send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: { PK: `EMAIL#${address}`, SK: 'EMAIL', userId },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        { Put: { TableName: TABLE_NAME, Item: profile } },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: { PK: pk(userId), SK: 'PREFS', ...DEFAULT_PREFS },
          },
        },
      ],
    }));
  } catch (error) {
    if (error.name === 'TransactionCanceledException') {
      const cancelled = (error.CancellationReasons || [])
        .some((reason) => reason.Code === 'ConditionalCheckFailed');
      if (cancelled) return null;   // UC-001 E1 — email already registered
    }
    throw error;
  }

  return profile;
}

/**
 * The one lookup that does not start from a userId — it is what produces one.
 * A GetItem on the uniqueness guard, so login needs no GSI and no Scan
 * (HLD §5.4 pattern 8).
 */
async function findUserIdByEmail(email) {
  const result = await send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `EMAIL#${normaliseEmail(email)}`, SK: 'EMAIL' },
  }));
  return result.Item ? result.Item.userId : null;
}

async function getProfile(userId) {
  const result = await send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk(userId), SK: 'PROFILE' },
  }));
  return result.Item || null;
}

module.exports = {
  createUser,
  findUserIdByEmail,
  getProfile,
  publicUser,
  normaliseEmail,
  DEFAULT_TZ,
};
