'use strict';

/**
 * POST /api/parse/bulk/import — UC-007 steps 5–7.
 *
 * Commits the rows the student ticked on the review table returned by
 * POST /api/parse/bulk. This is this track's one exception to "creation
 * always goes through POST /api/tasks": the review table already IS the
 * per-task confirmation UC-002 would otherwise require, and UC-007 step 6
 * explicitly asks for a single BatchWriteItem across every ticked row, not
 * N separate single-task creates. (HLD §6.2's endpoint table lists only the
 * preview step; this sibling endpoint follows the same generate → commit
 * shape UC-012's milestones/generate → milestones PUT already uses.)
 */

const crypto = require('node:crypto');
const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');
const { createTasks, saveScores } = require('../../lib/dynamo/tasks');
const { smartDefaultsFor } = require('../../lib/parse/fields');
const { loadRanked, publicTask } = require('../../lib/loadRanked');
const score = require('../../lib/scoring');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.bulkImport);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  const now = new Date().toISOString();

  // Same shape UC-002's create.js writes, so a task created via paste is
  // indistinguishable from one created via the form once it lands in the
  // table — same fields, same overdue handling, same scoring inputs.
  const prepared = body.rows.map((row) => {
    const defaults = smartDefaultsFor(row.type);
    const overdue = Date.parse(row.dueAt) < Date.parse(now);

    return {
      taskId: crypto.randomUUID(),
      title: row.title,
      module: row.module ?? null,
      type: row.type,
      dueAt: row.dueAt,
      // Left *absent*, not null, when unknown: `Number(null)` is 0, which
      // UC-009's Stakes would read as "worth 0% of the grade" rather than
      // "not recorded" — skipping the Alt A neutral-50 substitution and its
      // dataGap flag entirely (create.js §UC-002 makes the same choice).
      gradeWeight: row.gradeWeight ?? undefined,
      effortHours: row.effortHours ?? defaults.effortHours,
      hoursSpent: 0,
      progressPct: 0,
      isGroup: Boolean(row.isGroup),
      blockedOnTeammate: false,
      prepDays: defaults.prepDays,
      status: overdue ? 'overdue' : 'active',
      notes: '',
      priorityScore: null,
      subScores: null,
      tight: false,
      dataGap: [],
      explanation: null,
      explanationHash: null,
      explanationStale: true,
      s3Key: null,
      source: 'paste',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      lateSubmission: false,
      overdueSince: overdue ? row.dueAt : null,
      history: [],
    };
  });

  let created;
  let failed;
  try {
    ({ created, failed } = await createTasks(userId, prepared));
  } catch (error) {
    // Nothing to report per-row here — the write layer itself rejected the
    // whole call (e.g. every attempt exhausted its retries).
    console.error(JSON.stringify({
      level: 'ERROR', event: 'bulk_import_failed', message: error.message, attempted: prepared.length,
    }));
    return fail(503, 'storage_unavailable',
      `Could not save these tasks — 0 of ${prepared.length} succeeded. Please try again.`);
  }

  const { tasks, prefs } = await loadRanked(userId, now);
  const ranked = score(tasks, prefs, now);
  await saveScores(userId, ranked);

  // E2 — exactly how many of how many succeeded; failed rows are returned
  // as-is (not persisted) so the client can flag them "not saved — retry".
  return ok(201, {
    created: created.map(publicTask),
    failed: failed.map((item) => ({ taskId: item.taskId, title: item.title })),
    savedCount: created.length,
    attemptedCount: prepared.length,
    ranking: ranked.map(publicTask),
  });
};
