'use strict';

/**
 * PUT /api/character — species, name, and what it is wearing.
 */

const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const { getCharacter, patchCharacter } = require('../../lib/dynamo/character');
const { SHOP_BY_ID } = require('../../lib/character/shop');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.putCharacter);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const current = await getCharacter(userId);
  const changes = {};
  if (body.species) changes.species = body.species;
  if (body.name) changes.name = body.name.trim();

  if (body.equipped) {
    const owned = new Set(current.owned || []);
    const equipped = { ...current.equipped };

    for (const [slot, itemId] of Object.entries(body.equipped)) {
      if (itemId === null || itemId === undefined || itemId === '') {
        delete equipped[slot];
        continue;
      }
      const item = SHOP_BY_ID.get(itemId);
      // Checked server-side: a client that has never bought the crown cannot
      // wear it by editing a request.
      if (!item) return fail(400, 'validation_failed', 'No such item.');
      if (item.slot !== slot) return fail(400, 'validation_failed', `${item.name} is not a ${slot} item.`);
      if (!owned.has(itemId)) return fail(400, 'validation_failed', `You do not own the ${item.name} yet.`);
      equipped[slot] = itemId;
    }
    changes.equipped = equipped;
  }

  if (Object.keys(changes).length === 0) return ok(200, { character: current });

  try {
    return ok(200, { character: await patchCharacter(userId, changes) });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'character_write_failed', userId, message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'That change could not be saved — please try again.');
  }
};
