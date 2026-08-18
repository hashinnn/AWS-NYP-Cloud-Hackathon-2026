'use strict';

/**
 * TASK item access.
 * Every function takes `userId` first and scopes to that partition.
 */

const {
  QueryCommand, UpdateCommand, GetCommand, PutCommand, BatchWriteCommand,
} = require('@aws-sdk/lib-dynamodb');
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

/**
 * Create a brand-new TASK item.
 *
 * UC-005/006's parse endpoints return proposals only and never call this —
 * they end at `POST /api/tasks` (Philena's UC-002 write path), which is the
 * one place a single confirmed task is created. UC-007's bulk import is the
 * exception: a review table confirms several rows at once, so it writes
 * directly (HLD §6.2 "parse/bulk").
 */
function taskItem(userId, task) {
  return {
    ...task,
    PK: pk(userId),
    SK: `TASK#${task.taskId}`,
    GSI1PK: pk(userId),
    GSI1SK: `DUE#${task.dueAt}`,
    userId,
  };
}

async function createTask(userId, task) {
  const item = taskItem(userId, task);
  await send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item,
    ConditionExpression: 'attribute_not_exists(SK)',
  }));
  return item;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chunked at 25 — BatchWriteItem's own limit (UC-007 step 6).
 *
 * BatchWriteItem does not throw for a partial failure; it returns the rows
 * it could not write in `UnprocessedItems`. UC-007 E2 requires reporting
 * exactly how many of how many succeeded, so those are retried a few times
 * and whatever is still unwritten afterwards comes back as `failed`, never
 * silently dropped.
 */
async function createTasks(userId, tasks) {
  const items = tasks.map((task) => taskItem(userId, task));
  const stillFailed = [];

  for (let i = 0; i < items.length; i += 25) {
    let chunk = items.slice(i, i + 25);
    let attempt = 0;
    while (chunk.length && attempt < 3) {
      // eslint-disable-next-line no-await-in-loop
      const result = await send(new BatchWriteCommand({
        RequestItems: { [TABLE_NAME]: chunk.map((item) => ({ PutRequest: { Item: item } })) },
      }));
      const unprocessed = (result.UnprocessedItems && result.UnprocessedItems[TABLE_NAME]) || [];
      chunk = unprocessed.map((request) => request.PutRequest.Item);
      attempt += 1;
      // eslint-disable-next-line no-await-in-loop
      if (chunk.length) await sleep(200 * attempt);
    }
    stillFailed.push(...chunk);
  }

  const failedIds = new Set(stillFailed.map((item) => item.taskId));
  return {
    created: items.filter((item) => !failedIds.has(item.taskId)),
    failed: items.filter((item) => failedIds.has(item.taskId)),
  };
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
  createTask,
  createTasks,
  patchTask,
  saveScores,
  rankedTasks,
  RANKED_STATUSES,
};
