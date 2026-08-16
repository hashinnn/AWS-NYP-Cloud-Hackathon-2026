'use strict';

/**
 * MILESTONE item access — UC-012. PROVISIONAL — Philena's [P-02].
 *
 * SK = MILESTONE#<taskId>#<milestoneId>, so one `begins_with` returns every
 * milestone for a task, and a shorter prefix returns every milestone for a
 * student (HLD §5.3.5).
 */

const { QueryCommand, UpdateCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { send, TABLE_NAME, pk, buildUpdate } = require('./client');

const MAX_TRANSACT_ITEMS = 25;

async function getMilestonesForTask(userId, taskId) {
  const page = await send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
    ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
    ExpressionAttributeValues: { ':pk': pk(userId), ':prefix': `MILESTONE#${taskId}#` },
  }));
  return (page.Items || []).sort((a, b) => (a.order || 0) - (b.order || 0));
}

function extractMilestones(items) {
  return items
    .filter((item) => String(item.SK || '').startsWith('MILESTONE#'))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * UC-012 step 6 / E4 — all-or-nothing. Either every milestone is written or
 * none is, so the student never sees a half-saved breakdown.
 */
async function putMilestones(userId, taskId, milestones) {
  if (milestones.length > MAX_TRANSACT_ITEMS) {
    throw new Error(`too many milestones for one transaction: ${milestones.length}`);
  }

  await send(new TransactWriteCommand({
    TransactItems: milestones.map((milestone) => ({
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: pk(userId),
          SK: `MILESTONE#${taskId}#${milestone.milestoneId}`,
          ...milestone,
          taskId,
        },
      },
    })),
  }));

  return getMilestonesForTask(userId, taskId);
}

async function patchMilestone(userId, taskId, milestoneId, changes) {
  const update = buildUpdate(changes);
  const result = await send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk(userId), SK: `MILESTONE#${taskId}#${milestoneId}` },
    UpdateExpression: update.UpdateExpression,
    ExpressionAttributeNames: update.ExpressionAttributeNames,
    ExpressionAttributeValues: update.ExpressionAttributeValues,
    ConditionExpression: 'attribute_exists(SK)',
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes;
}

module.exports = {
  getMilestonesForTask,
  extractMilestones,
  putMilestones,
  patchMilestone,
  MAX_TRANSACT_ITEMS,
};
