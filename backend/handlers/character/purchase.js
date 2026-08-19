'use strict';

/**
 * POST /api/character/purchase — spend points on a cosmetic.
 *
 * The balance is recomputed from completed tasks on every call rather than
 * trusted from the client, so the only thing a request can do is increase
 * `spentPoints`, and only when the arithmetic allows it.
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const { getAllForUser, extractTasks } = require('../../lib/dynamo/tasks');
const { extractCharacter, patchCharacter } = require('../../lib/dynamo/character');
const { earnedPoints, SHOP_BY_ID } = require('../../lib/character/shop');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.purchase);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const item = SHOP_BY_ID.get(body.itemId);
  const items = await getAllForUser(userId);
  const character = extractCharacter(items);
  const owned = new Set(character.owned || []);

  // Buying something twice is a no-op, not an error and not a second charge.
  if (owned.has(item.id)) {
    return ok(200, { character, purchased: false, message: `You already own the ${item.name}.` });
  }

  const { earned } = earnedPoints(extractTasks(items));
  const balance = earned - (character.spentPoints || 0);

  if (balance < item.cost) {
    return fail(400, 'insufficient_points',
      `The ${item.name} costs ${item.cost} points — you have ${balance}. Finish a task to earn more.`);
  }

  const updated = await patchCharacter(userId, {
    owned: [...owned, item.id],
    spentPoints: (character.spentPoints || 0) + item.cost,
    // Wearing what you just bought is what you wanted; it can be taken off.
    equipped: { ...character.equipped, [item.slot]: item.id },
  });

  return ok(201, {
    character: updated,
    purchased: true,
    points: { earned, spent: updated.spentPoints, balance: earned - updated.spentPoints },
  });
};
