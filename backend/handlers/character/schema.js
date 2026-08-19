'use strict';

const { z } = require('../../lib/validate');
const { SPECIES, SHOP } = require('../../lib/character/shop');

const putCharacter = z.object({
  species: z.enum(SPECIES.map((s) => s.id)).optional(),
  name: z.string().trim().min(1).max(20).optional(),
  // Equipping is separate from owning; the handler checks ownership.
  equipped: z.object({
    hat: z.string().nullish(),
    face: z.string().nullish(),
    neck: z.string().nullish(),
    clothes: z.string().nullish(),
  }).optional(),
});

const purchase = z.object({
  itemId: z.enum(SHOP.map((item) => item.id)),
});

module.exports = { putCharacter, purchase };
