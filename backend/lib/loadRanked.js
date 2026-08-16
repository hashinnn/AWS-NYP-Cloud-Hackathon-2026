'use strict';

/**
 * One Query, one scoring pass — the shape every Intelligence read starts from.
 *
 * The dashboard, the ranking, Focus Mode, the heatmap and the daily plan all
 * need the same thing: this student's items, scored by the same engine. Doing
 * it in one place is what guarantees they can never disagree with each other.
 */

const score = require('./scoring');
const { normaliseWeights } = require('./scoring/normalise');
const { getAllForUser, rankedTasks } = require('./dynamo/tasks');
const { extractMilestones } = require('./dynamo/milestones');
const { extractPrefs, scoringPrefs } = require('./dynamo/prefs');

/**
 * @param {string} userId from the authoriser context, never from the body
 * @param {Date|number|string} now
 * @returns {Promise<{items, tasks, ranked, milestones, prefs, weights, rankOf}>}
 */
async function loadRanked(userId, now) {
  const items = await getAllForUser(userId);

  const storedPrefs = extractPrefs(items);
  const prefs = scoringPrefs(items, storedPrefs);
  const weights = normaliseWeights(prefs.weights);
  const milestones = extractMilestones(items);
  const tasks = rankedTasks(items);

  const ranked = score(tasks, prefs, now);
  const positions = new Map();
  ranked
    .filter((task) => task.priorityScore !== null)
    .forEach((task, index) => positions.set(task.taskId, index + 1));

  return {
    items,
    tasks,
    ranked,
    milestones,
    prefs,
    storedPrefs,
    weights,
    rankOf: (task) => positions.get(task.taskId) || ranked.length,
  };
}

/** Strip the DynamoDB keys before a task goes over the wire. */
function publicTask(task) {
  const { PK, SK, GSI1PK, GSI1SK, ...rest } = task;
  return rest;
}

module.exports = { loadRanked, publicTask };
