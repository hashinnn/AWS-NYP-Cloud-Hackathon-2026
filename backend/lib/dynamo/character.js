'use strict';

/**
 * CHARACTER item access.
 *
 *   PK = USER#<userId>   SK = CHARACTER
 *
 * A new sort key in the existing partition — no table change, no new index,
 * and it arrives in the same single Query that already loads the dashboard.
 * This is the single-table design paying for itself.
 */

const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { send, TABLE_NAME, pk, buildUpdate } = require('./client');

const DEFAULT_CHARACTER = {
  species: 'cat',
  name: 'Pip',
  owned: [],
  equipped: {},        // { hat?: id, face?: id, neck?: id }
  spentPoints: 0,
};

function extractCharacter(items) {
  const stored = (items || []).find((item) => item.SK === 'CHARACTER') || {};
  const { PK, SK, ...rest } = stored;
  return { ...DEFAULT_CHARACTER, ...rest };
}

async function getCharacter(userId) {
  const result = await send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk(userId), SK: 'CHARACTER' },
  }));
  const { PK, SK, ...rest } = result.Item || {};
  return { ...DEFAULT_CHARACTER, ...rest };
}

async function patchCharacter(userId, changes) {
  const update = buildUpdate({ ...changes, updatedAt: new Date().toISOString() });
  const result = await send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk(userId), SK: 'CHARACTER' },
    UpdateExpression: update.UpdateExpression,
    ExpressionAttributeNames: update.ExpressionAttributeNames,
    ExpressionAttributeValues: update.ExpressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  }));
  const { PK, SK, ...rest } = result.Attributes;
  return { ...DEFAULT_CHARACTER, ...rest };
}

module.exports = { getCharacter, patchCharacter, extractCharacter, DEFAULT_CHARACTER };
