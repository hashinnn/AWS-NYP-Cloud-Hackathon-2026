'use strict';

/**
 * GET /api/character — Class A read. No LLM: the companion's lines are
 * templates built from figures, for the same reason UC-010's are.
 */

const { ok, fail } = require('../../lib/http');
const { loadRanked, publicTask } = require('../../lib/loadRanked');
const { extractTasks } = require('../../lib/dynamo/tasks');
const { extractCharacter } = require('../../lib/dynamo/character');
const { mood } = require('../../lib/character/mood');
const { earnedPoints, SHOP, SPECIES } = require('../../lib/character/shop');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const now = new Date().toISOString();

  try {
    // One Query already returns tasks, prefs and milestones; the CHARACTER
    // item rides along in the same round trip.
    const { items, ranked } = await loadRanked(userId, now);
    const character = extractCharacter(items);
    const tasks = extractTasks(items);

    const { earned, breakdown } = earnedPoints(tasks);
    const balance = earned - (character.spentPoints || 0);

    return ok(200, {
      character,
      mood: mood(tasks, ranked.map(publicTask), now),
      points: { earned, spent: character.spentPoints || 0, balance, breakdown },
      shop: SHOP,
      species: SPECIES,
      computedAt: now,
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'character_read_failed', userId, message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'Your companion is having a nap — try again.');
  }
};
