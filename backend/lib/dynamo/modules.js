'use strict';

/**
 * MODULE item access — UC-004, and UC-002 Alt C's inline creation.
 */

const { QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { send, TABLE_NAME, pk } = require('./client');

const DEFAULT_TOTAL_WEIGHT = 100;

/**
 * The light-mode series palette from `frontend/src/lib/chartTheme.ts`, and the
 * same hash Hasini's `moduleSlot()` uses. Kept in step deliberately: a module
 * created inline here must come out the same colour the charts would have
 * given it, or the same module reads as two different modules across views.
 */
const SERIES = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
];

function colourFor(code) {
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  return SERIES[hash % SERIES.length];
}

/** Module codes are compared and stored uppercased (HLD §5.3.3). */
const normaliseCode = (code) => String(code || '').trim().toUpperCase();

function extractModules(items) {
  return items.filter((item) => String(item.SK || '').startsWith('MODULE#'));
}

async function getModules(userId) {
  const page = await send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
    ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
    ExpressionAttributeValues: { ':pk': pk(userId), ':prefix': 'MODULE#' },
  }));
  return page.Items || [];
}

/**
 * @returns {object|null} the created module, or null when the code already
 *   exists — UC-004 E1 offers to open the existing one rather than creating
 *   a second.
 */
async function createModule(userId, { code, name, colour, totalWeight }) {
  const moduleCode = normaliseCode(code);
  const item = {
    PK: pk(userId),
    SK: `MODULE#${moduleCode}`,
    code: moduleCode,
    name: name || moduleCode,
    colour: colour || colourFor(moduleCode),
    totalWeight: totalWeight ?? DEFAULT_TOTAL_WEIGHT,
  };

  try {
    await send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(SK)',
    }));
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') return null;
    throw error;
  }

  return item;
}

module.exports = {
  getModules,
  extractModules,
  createModule,
  colourFor,
  normaliseCode,
  DEFAULT_TOTAL_WEIGHT,
};
