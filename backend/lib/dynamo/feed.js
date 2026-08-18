'use strict';

/**
 * UC-023 Alt A — the tokenised subscription feed.
 *
 * `PROFILE.feedToken` is the student's copy of the token (HLD §5.3.1). The
 * public feed route arrives with only the token and no session, so it needs to
 * get from token → userId without a `Scan`: a second item, keyed on the token
 * itself, is that lookup. Revoking deletes it, which makes the old URL 404
 * immediately rather than eventually.
 */

const { randomBytes } = require('node:crypto');
const {
  GetCommand, PutCommand, UpdateCommand, DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { send, TABLE_NAME, pk } = require('./client');

const feedPk = (token) => `FEED#${token}`;

/** Rotates on every call: issuing a new token invalidates the previous URL. */
async function issueToken(userId, previousToken) {
  const token = randomBytes(24).toString('base64url');

  await send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: feedPk(token), SK: 'FEED', userId, createdAt: new Date().toISOString(),
    },
  }));

  await send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk(userId), SK: 'PROFILE' },
    UpdateExpression: 'SET feedToken = :t',
    ExpressionAttributeValues: { ':t': token },
  }));

  if (previousToken && previousToken !== token) await revokeLookup(previousToken);
  return token;
}

async function revokeLookup(token) {
  await send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: feedPk(token), SK: 'FEED' },
  }));
}

async function revokeToken(userId, token) {
  if (token) await revokeLookup(token);
  await send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk(userId), SK: 'PROFILE' },
    UpdateExpression: 'REMOVE feedToken',
  }));
}

/** @returns {Promise<string|null>} the owning userId, or null for a dead token */
async function userIdForToken(token) {
  if (!token) return null;
  const result = await send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: feedPk(token), SK: 'FEED' },
  }));
  return result.Item ? result.Item.userId : null;
}

module.exports = { issueToken, revokeToken, userIdForToken };
