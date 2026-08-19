'use strict';

/**
 * Points and the cosmetics catalogue.
 *
 * Points are DERIVED from completed tasks, never incremented by a counter.
 * That means no double-award bug is possible, a replayed request cannot mint
 * anything, and the total is arithmetic a student can check by hand — the
 * same standard the priority score is held to. Only `spentPoints` is stored.
 *
 *   balance = earned(completed tasks) - spentPoints
 */

const BASE_POINTS = 10;          // for finishing anything at all
const WEIGHT_MULTIPLIER = 2;     // a 40% report is worth more than a 5% quiz
const ON_TIME_BONUS = 25;        // the behaviour the whole product exists to encourage

const SPECIES = [
  { id: 'cat', name: 'Cat' },
  { id: 'frog', name: 'Frog' },
  { id: 'cactus', name: 'Cactus' },
  { id: 'sprout', name: 'Sprout' },
];

// Four exclusive slots: one hat, one face piece, one neck piece, one outfit.
// The ladder runs from "one finished task" to "most of a semester finishing on
// time", so there is always something in reach and something still to want.
const SHOP = [
  // ── hats ──
  { id: 'beanie', slot: 'hat', name: 'Beanie', cost: 60 },
  { id: 'cap', slot: 'hat', name: 'Cap', cost: 70 },
  { id: 'party', slot: 'hat', name: 'Party Hat', cost: 90 },
  { id: 'bucket', slot: 'hat', name: 'Bucket Hat', cost: 110 },
  { id: 'flowers', slot: 'hat', name: 'Flower Crown', cost: 130 },
  { id: 'headphones', slot: 'hat', name: 'Headphones', cost: 160 },
  { id: 'bow', slot: 'hat', name: 'Hair Bow', cost: 140 },
  { id: 'graduate', slot: 'hat', name: 'Graduation Cap', cost: 250 },
  { id: 'wizard', slot: 'hat', name: 'Wizard Hat', cost: 300 },
  { id: 'tophat', slot: 'hat', name: 'Top Hat', cost: 420 },
  { id: 'crown', slot: 'hat', name: 'Crown', cost: 500 },
  { id: 'halo', slot: 'hat', name: 'Halo', cost: 700 },

  // ── face ──
  { id: 'glasses', slot: 'face', name: 'Glasses', cost: 75 },
  { id: 'round', slot: 'face', name: 'Round Glasses', cost: 85 },
  { id: 'stars', slot: 'face', name: 'Star Stickers', cost: 100 },
  { id: 'shades', slot: 'face', name: 'Sunglasses', cost: 140 },
  { id: 'monocle', slot: 'face', name: 'Monocle', cost: 220 },
  { id: 'patch', slot: 'face', name: 'Eye Patch', cost: 280 },
  { id: 'moustache', slot: 'face', name: 'Moustache', cost: 330 },

  // ── neck ──
  { id: 'scarf', slot: 'neck', name: 'Scarf', cost: 110 },
  { id: 'tie', slot: 'neck', name: 'Necktie', cost: 150 },
  { id: 'bowtie', slot: 'neck', name: 'Bow Tie', cost: 180 },
  { id: 'pearls', slot: 'neck', name: 'Pearls', cost: 240 },
  { id: 'medal', slot: 'neck', name: 'Gold Medal', cost: 350 },
  { id: 'cape', slot: 'neck', name: 'Cape', cost: 620 },

  // ── clothes ──
  { id: 'tee', slot: 'clothes', name: 'T-Shirt', cost: 80 },
  { id: 'stripes', slot: 'clothes', name: 'Striped Top', cost: 120 },
  { id: 'hoodie', slot: 'clothes', name: 'Hoodie', cost: 190 },
  { id: 'overalls', slot: 'clothes', name: 'Overalls', cost: 230 },
  { id: 'labcoat', slot: 'clothes', name: 'Lab Coat', cost: 380 },
  { id: 'varsity', slot: 'clothes', name: 'Varsity Jacket', cost: 450 },
  { id: 'raincoat', slot: 'clothes', name: 'Raincoat', cost: 540 },
  { id: 'spacesuit', slot: 'clothes', name: 'Space Suit', cost: 800 },
];

const SHOP_BY_ID = new Map(SHOP.map((item) => [item.id, item]));

/** Points for one finished task. Late still earns — it just earns less. */
function pointsFor(task) {
  const weight = Number(task.gradeWeight);
  const weighted = Number.isFinite(weight) ? weight * WEIGHT_MULTIPLIER : 0;
  const onTime = task.lateSubmission ? 0 : ON_TIME_BONUS;
  return Math.round(BASE_POINTS + weighted + onTime);
}

/**
 * @param {object[]} tasks every TASK item
 * @returns {{earned:number, breakdown:object[]}} newest first
 */
function earnedPoints(tasks) {
  const breakdown = (tasks || [])
    .filter((task) => task.status === 'completed')
    .map((task) => ({
      taskId: task.taskId,
      title: task.title,
      gradeWeight: task.gradeWeight ?? null,
      onTime: !task.lateSubmission,
      completedAt: task.completedAt || null,
      points: pointsFor(task),
    }))
    .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));

  return { earned: breakdown.reduce((sum, row) => sum + row.points, 0), breakdown };
}

module.exports = {
  SPECIES, SHOP, SHOP_BY_ID, earnedPoints, pointsFor,
  BASE_POINTS, WEIGHT_MULTIPLIER, ON_TIME_BONUS,
};
