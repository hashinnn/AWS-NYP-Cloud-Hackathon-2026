'use strict';

/**
 * UC-023 step 2 — what goes into the export.
 *
 * Shared by the download and the subscription feed so a student's calendar
 * subscription can never contain a different set of deadlines from the file
 * they downloaded five minutes earlier.
 */

const { toMs } = require('../scoring/availability');

const EXPORTABLE = new Set(['active', 'overdue']);

/**
 * @param {object[]} tasks all TASK items
 * @param {object[]} milestones
 * @param {object} query `{scope, module, from, to, includeMilestones}`
 */
function selectForExport(tasks, milestones, query = {}) {
  const scope = query.scope || 'all';

  let selected = tasks.filter((task) => EXPORTABLE.has(task.status));

  if (scope === 'module' && query.module) {
    selected = selected.filter((task) => task.module === query.module);
  }

  if (scope === 'range') {
    const from = toMs(query.from);
    const to = toMs(query.to);
    selected = selected.filter((task) => {
      const due = toMs(task.dueAt);
      if (!Number.isFinite(due)) return false;
      if (Number.isFinite(from) && due < from) return false;
      if (Number.isFinite(to) && due > to) return false;
      return true;
    });
  }

  selected.sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt));

  const include = query.includeMilestones === true || query.includeMilestones === 'true';
  const ids = new Set(selected.map((task) => task.taskId));

  return {
    tasks: selected,
    milestones: include ? (milestones || []).filter((m) => ids.has(m.taskId)) : [],
  };
}

module.exports = { selectForExport, EXPORTABLE };
