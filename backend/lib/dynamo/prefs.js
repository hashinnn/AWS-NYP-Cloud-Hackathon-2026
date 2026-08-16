'use strict';

/**
 * PREFS and PROFILE access. PROVISIONAL — Philena's [P-02].
 */

const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { send, TABLE_NAME, pk, buildUpdate } = require('./client');
const { DEFAULT_WEIGHTS } = require('../scoring/normalise');
const { DEFAULT_AVAILABILITY, DEFAULT_TZ } = require('../scoring/availability');

const DEFAULT_PREFS = {
  availability: DEFAULT_AVAILABILITY,
  blockedDates: [],
  weights: DEFAULT_WEIGHTS,
  digestAt: '08:00',
  quietHours: { start: '22:00', end: '07:00' },
  dailyCap: 3,
  channels: { email: true, inApp: true },
  leadTimes: { test: 7, project: 5, assignment: 3, presentation: 3 },
  escalationEnabled: true,
};

async function getPrefs(userId) {
  const result = await send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk(userId), SK: 'PREFS' },
  }));
  return { ...DEFAULT_PREFS, ...(result.Item || {}) };
}

async function patchPrefs(userId, changes) {
  const update = buildUpdate(changes);
  if (update.isEmpty) return getPrefs(userId);

  const result = await send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk(userId), SK: 'PREFS' },
    UpdateExpression: update.UpdateExpression,
    ExpressionAttributeNames: update.ExpressionAttributeNames,
    ExpressionAttributeValues: update.ExpressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  }));
  return { ...DEFAULT_PREFS, ...result.Attributes };
}

/**
 * Scoring needs the student's timezone, which lives on PROFILE, but the fixed
 * `score(tasks, prefs, now)` signature only receives prefs — so callers merge
 * it here rather than each rebuilding the same object.
 */
function scoringPrefs(items, prefs) {
  const profile = items.find((item) => item.SK === 'PROFILE');
  return { ...prefs, tz: (profile && profile.tz) || DEFAULT_TZ };
}

function extractPrefs(items) {
  const stored = items.find((item) => item.SK === 'PREFS') || {};
  return { ...DEFAULT_PREFS, ...stored };
}

module.exports = { getPrefs, patchPrefs, scoringPrefs, extractPrefs, DEFAULT_PREFS };
