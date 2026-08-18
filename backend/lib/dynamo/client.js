'use strict';

/**
 * DynamoDB access — HLD §4.5.
 *
 * Rules this layer exists to enforce:
 *   - one module-scoped client, reused across warm invocations
 *   - every exported function takes `userId` first and builds the partition key
 *     internally — no caller ever writes `USER#...` by hand
 *   - no Scan, ever
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME || 'deadlineiq';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const RETRYABLE = new Set([
  'ProvisionedThroughputExceededException',
  'ThrottlingException',
  'RequestLimitExceeded',
  'InternalServerError',
]);

const BACKOFF_MS = [100, 400, 1600];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 3 attempts, exponential backoff, only on throttling (HLD §4.5). */
async function send(command) {
  let lastError;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt += 1) {
    try {
      return await doc.send(command);
    } catch (error) {
      lastError = error;
      if (!RETRYABLE.has(error.name) || attempt === BACKOFF_MS.length) throw error;
      await sleep(BACKOFF_MS[attempt]);
    }
  }
  throw lastError;
}

const pk = (userId) => `USER#${userId}`;

/**
 * Build an UpdateExpression from a plain object of changes.
 * Only the changed fields are written — never a whole-item overwrite (§6.1.5).
 */
function buildUpdate(changes) {
  const names = {};
  const values = {};
  const sets = [];
  let i = 0;

  for (const [field, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    i += 1;
    names[`#f${i}`] = field;
    values[`:v${i}`] = value;
    sets.push(`#f${i} = :v${i}`);
  }

  return {
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    isEmpty: sets.length === 0,
  };
}

module.exports = { doc, send, TABLE_NAME, pk, buildUpdate };
