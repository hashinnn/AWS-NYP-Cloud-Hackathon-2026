'use strict';

/**
 * Read-only context the parser can use to do a better job — existing module
 * codes to match against (UC-005 step 3), existing tasks to spot duplicates
 * against (UC-007 Alt B). Always best-effort: a Class C endpoint degrades
 * quietly rather than failing because a context read hiccuped (AGENTS §7).
 */

const { getAllForUser } = require('../dynamo/tasks');

async function existingModuleCodes(userId) {
  try {
    const items = await getAllForUser(userId);
    return items
      .filter((item) => String(item.SK || '').startsWith('MODULE#'))
      .map((item) => item.code)
      .filter(Boolean);
  } catch (error) {
    console.warn(JSON.stringify({ level: 'WARN', event: 'parse_module_lookup_failed', message: error.message }));
    return [];
  }
}

async function activeTasksFor(userId) {
  try {
    const items = await getAllForUser(userId);
    return items.filter((item) => String(item.SK || '').startsWith('TASK#')
      && (item.status === 'active' || item.status === 'overdue'));
  } catch (error) {
    console.warn(JSON.stringify({ level: 'WARN', event: 'parse_task_lookup_failed', message: error.message }));
    return [];
  }
}

module.exports = { existingModuleCodes, activeTasksFor };
