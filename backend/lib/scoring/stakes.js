'use strict';

/**
 * UC-009 (b) STAKES — HLD §7.2b
 *
 *   Stakes = min(100, gradeWeight × 2.5)
 *
 * Saturates at a 40% component: beyond that, more weight does not change the
 * behaviour it should drive.
 */

const NEUTRAL = 50;

/**
 * @param {object} task
 * @returns {{value:number, dataGap:(string|null)}}
 */
function stakes(task) {
  const weight = Number(task.gradeWeight);

  // UC-009 Alt A — degrade in quality, never in availability. A task with no
  // recorded weight still ranks; it just ranks less precisely, and the card
  // says so.
  if (!Number.isFinite(weight)) return { value: NEUTRAL, dataGap: 'gradeWeight' };

  return { value: Math.min(100, Math.max(0, weight) * 2.5), dataGap: null };
}

module.exports = stakes;
module.exports.NEUTRAL = NEUTRAL;
