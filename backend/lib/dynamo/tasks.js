'use strict';

/**
 * TASK item access. PROVISIONAL — Philena's [P-02].
 * Every function takes `userId` first and scopes to that partition.
 */

const { QueryCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { send, TABLE_NAME, pk, buildUpdate } = require('./client');

const RANKED_STATUSES = new Set(['active', 'overdue']);

/**
 * One Query returns profile, prefs, modules, tasks and milestones together —
 * the dashboard render in a single round trip (HLD §5.1).
 */
async function getAllForUser(userId) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'PK' },
      ExpressionAttributeValues: { ':pk': pk(userId) },
      ExclusiveStartKey,
    }));
    items.push(...(page.Items || []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/** Tasks in a deadline window, in deadline order — GSI1, never a Scan. */
async function getTasksInWindow(userId, from, to) {
  const page = await send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'deadline-index',
    KeyConditionExpression: '#gpk = :pk AND #gsk BETWEEN :from AND :to',
    ExpressionAttributeNames: { '#gpk': 'GSI1PK', '#gsk': 'GSI1SK' },
    ExpressionAttributeValues: {
      ':pk': pk(userId),
      ':from': `DUE#${from}`,
      ':to': `DUE#${to}`,
    },
  }));
  return page.Items || [];
}

async function getTask(userId, taskId) {
  const result = await send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk(userId), SK: `TASK#${taskId}` },
  }));
  return result.Item || null;
}

/** Partial update of one task. Never a whole-item Put. */
async function patchTask(userId, taskId, changes, expectedUpdatedAt) {
  const update = buildUpdate({ ...changes, updatedAt: new Date().toISOString() });
  if (update.isEmpty) return getTask(userId, taskId);

  const result = await send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk(userId), SK: `TASK#${taskId}` },
    UpdateExpression: update.UpdateExpression,
    ExpressionAttributeNames: update.ExpressionAttributeNames,
    ExpressionAttributeValues: expectedUpdatedAt
      ? { ...update.ExpressionAttributeValues, ':expected': expectedUpdatedAt }
      : update.ExpressionAttributeValues,
    ConditionExpression: expectedUpdatedAt
      ? 'attribute_exists(SK) AND updatedAt = :expected'
      : 'attribute_exists(SK)',
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes;
}

/**
 * Persist the output of the scoring engine across a rescored set.
 *
 * Writes only the five score fields per task, so a concurrent edit to a title
 * or a deadline is never clobbered by a background recompute.
 */
async function saveScores(userId, scoredTasks) {
  await Promise.all(scoredTasks
    .filter((task) => task.taskId && task.subScores)
    .map((task) => patchTask(userId, task.taskId, {
      priorityScore: task.priorityScore,
      subScores: task.subScores,
      tight: task.tight,
      dataGap: task.dataGap,
      explanationStale: task.explanationStale,
    })));
}

/** Tasks that take part in the ranking (HLD §5.6). */
function rankedTasks(items) {
  return items.filter((item) => String(item.SK || '').startsWith('TASK#')
    && RANKED_STATUSES.has(item.status));
}

module.exports = {
  getAllForUser,
  getTasksInWindow,
  getTask,
  patchTask,
  saveScores,
  rankedTasks,
  RANKED_STATUSES,
};
