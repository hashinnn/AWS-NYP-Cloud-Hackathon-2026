'use strict';

/**
 * POST /api/tasks — UC-002. Class B write: no LLM anywhere on this path.
 */

const { randomUUID } = require('node:crypto');
const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const { getAllForUser, createTask, rankedTasks, saveScores } = require('../../lib/dynamo/tasks');
const { extractModules, createModule, normaliseCode, DEFAULT_TOTAL_WEIGHT } = require('../../lib/dynamo/modules');
const { extractPrefs, scoringPrefs } = require('../../lib/dynamo/prefs');
const { smartDefaultsFor } = require('../../lib/parse/fields');
const { resolveDueAt } = require('../../lib/tasks/dueAt');
const { publicTask } = require('../../lib/loadRanked');
const score = require('../../lib/scoring');

const DUPLICATE_WINDOW_MS = 7 * 86400000;   // Alt B — "within ±7 days"
const TITLE_OVERLAP = 0.6;

/** Comparable form of a title: lowercase words, punctuation discarded. */
const titleTokens = (title) => new Set(
  String(title || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
);

/**
 * Alt B — "a similar title in the same module within ±7 days". Deliberately
 * generous: this only ever produces a soft warning the student can wave away,
 * so a false positive costs one extra click and a false negative costs a
 * duplicate task.
 */
function nearDuplicate(tasks, candidate) {
  const wanted = titleTokens(candidate.title);
  if (wanted.size === 0) return null;
  const dueMs = Date.parse(candidate.dueAt);

  return tasks.find((task) => {
    if (normaliseCode(task.module) !== normaliseCode(candidate.module)) return false;
    if (Math.abs(Date.parse(task.dueAt) - dueMs) > DUPLICATE_WINDOW_MS) return false;

    const other = titleTokens(task.title);
    if (other.size === 0) return false;
    const shared = [...wanted].filter((word) => other.has(word)).length;
    return shared / Math.min(wanted.size, other.size) >= TITLE_OVERLAP;
  }) || null;
}

/** Tasks that still consume a module's assessment weight (HLD §5.6). */
const countsTowardWeight = (task) => !['deleted', 'archived'].includes(task.status);

function assignedWeight(items, moduleCode) {
  return items
    .filter((item) => String(item.SK || '').startsWith('TASK#'))
    .filter((task) => normaliseCode(task.module) === moduleCode && countsTowardWeight(task))
    .reduce((total, task) => total + (Number(task.gradeWeight) || 0), 0);
}

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;   // NEVER from body
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.createTask);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  // One Query returns profile, prefs, modules and every task (HLD §5.1) —
  // all four are needed below, so this is the only read on the path.
  const items = await getAllForUser(userId);
  const prefs = scoringPrefs(items, extractPrefs(items));
  const modules = extractModules(items);
  const active = rankedTasks(items);

  const dueAt = resolveDueAt(body.dueAt, prefs.tz);
  if (!dueAt) return fail(400, 'validation_failed', 'That deadline is not a date we can read.');

  const moduleCode = body.module ? normaliseCode(body.module) : null;

  // Alt B — soft, and only on the first attempt. "Create anyway" resends.
  if (!body.createAnyway) {
    const existing = nearDuplicate(active, { title: body.title, module: moduleCode, dueAt });
    if (existing) {
      return fail(409, 'duplicate_suspected',
        `You may already have this: ${existing.title}, due ${existing.dueAt.slice(0, 10)}.`,
        { existing: publicTask(existing) });
    }
  }

  const now = new Date().toISOString();
  const warnings = [];

  // Alt C — a module the student typed that does not exist yet. Created here
  // so the form never has to navigate away mid-entry.
  let moduleItem = modules.find((item) => item.code === moduleCode) || null;
  if (moduleCode && !moduleItem) {
    moduleItem = await createModule(userId, { code: moduleCode, name: body.moduleName });
    if (moduleItem) {
      warnings.push({ code: 'module_created', message: `Created module ${moduleCode}.` });
    }
  }

  const defaults = smartDefaultsFor(body.type);

  // "Grade weight defaults to the module's average unassigned weight" — the
  // only computable reading is the weight the module has left unallocated.
  // Left undefined when there is nothing sensible to guess, so UC-009 records
  // a dataGap and substitutes a neutral 50 rather than inventing a figure.
  let gradeWeight = body.gradeWeight ?? undefined;
  if (gradeWeight === undefined && moduleItem) {
    const remaining = (moduleItem.totalWeight ?? DEFAULT_TOTAL_WEIGHT)
      - assignedWeight(items, moduleCode);
    if (remaining > 0) gradeWeight = remaining;
  }

  // E2 — over-allocation is reported, never blocked.
  if (moduleCode && gradeWeight !== undefined) {
    const total = assignedWeight(items, moduleCode) + gradeWeight;
    const capacity = (moduleItem && moduleItem.totalWeight) ?? DEFAULT_TOTAL_WEIGHT;
    if (total > capacity) {
      warnings.push({
        code: 'module_weight_exceeded',
        message: `${moduleCode} is now at ${Math.round(total)}% of assessment weight — check your figures.`,
      });
    }
  }

  // Alt A — a deadline already in the past is recorded as overdue and enters
  // the UC-021 flow. The "record it as overdue?" confirmation is the form's
  // job; by the time a request arrives the student has already answered it.
  const overdue = Date.parse(dueAt) < Date.parse(now);
  if (overdue) {
    warnings.push({ code: 'deadline_in_past', message: 'This deadline has already passed — recorded as overdue.' });
  }

  const task = {
    taskId: randomUUID(),
    title: body.title.trim(),
    module: moduleCode,
    type: body.type,
    dueAt,
    // Left *absent* rather than null when unknown: `Number(null)` is 0, which
    // scoring would read as "worth 0% of the grade" instead of "not recorded"
    // — skipping UC-009 Alt A's neutral-50 substitution and its dataGap flag.
    // The Dynamo client drops undefined attributes.
    gradeWeight,
    effortHours: body.effortHours ?? defaults.effortHours,
    hoursSpent: 0,
    progressPct: 0,
    isGroup: Boolean(body.isGroup),
    blockedOnTeammate: Boolean(body.blockedOnTeammate),
    prepDays: body.prepDays ?? defaults.prepDays,
    status: overdue ? 'overdue' : 'active',
    notes: body.notes || '',
    priorityScore: null,
    subScores: null,
    tight: false,
    dataGap: [],
    explanation: null,
    explanationHash: null,
    explanationStale: true,
    s3Key: body.s3Key ?? null,
    source: body.source || 'form',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    lateSubmission: false,
    overdueSince: overdue ? dueAt : null,
    history: [],
  };

  let created;
  try {
    created = await createTask(userId, task);
  } catch (error) {
    // E3 — nothing written; the form keeps its contents and offers a retry.
    console.error(JSON.stringify({
      level: 'ERROR', event: 'task_create_failed', userId, message: error.message,
    }));
    return fail(503, 'storage_unavailable', 'Task could not be saved — please try again.');
  }

  // Step 7 — the whole active set, not just this task: a new deadline changes
  // every other task's ClashPenalty.
  let ranking = [];
  let scored = created;
  try {
    const ranked = score([...active, created], prefs, now);
    await saveScores(userId, ranked);
    scored = ranked.find((item) => item.taskId === created.taskId) || created;
    ranking = ranked;
  } catch (error) {
    // E4 — creation is never blocked by scoring. The task is already saved
    // with priorityScore null; the hourly recompute (UC-019) fills it in.
    console.error(JSON.stringify({
      level: 'ERROR', event: 'scoring_failed_on_create', userId, taskId: created.taskId, message: error.message,
    }));
  }

  return ok(201, {
    task: publicTask(scored),
    ranking: ranking.map(publicTask),
    warnings,
  });
};
