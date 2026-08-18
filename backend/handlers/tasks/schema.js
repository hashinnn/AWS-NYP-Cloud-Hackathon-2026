'use strict';

const { z } = require('../../lib/validate');

const TASK_TYPES = ['assignment', 'test', 'project', 'presentation'];

/**
 * UC-002 step 5. Zod strips unknown keys, which is why `status`, `userId`,
 * `priorityScore` and `subScores` are absent here rather than explicitly
 * rejected: a client cannot set them because they never survive parsing.
 *
 * `dueAt` is only checked for shape. A deadline in the past is NOT a
 * validation failure — UC-002 Alt A records it as overdue rather than
 * rejecting it.
 */
const createTask = z.object({
  title: z.string().trim().min(1, 'Give the task a title').max(200),
  type: z.enum(TASK_TYPES),
  dueAt: z.string().min(1, 'A deadline is required'),

  module: z.string().trim().max(20).nullish(),
  gradeWeight: z.number().min(0).max(100).nullish(),
  effortHours: z.number().positive('Estimated effort must be more than 0 hours').max(200).nullish(),
  prepDays: z.number().int().min(0).max(30).nullish(),
  isGroup: z.boolean().optional(),
  blockedOnTeammate: z.boolean().optional(),
  notes: z.string().max(2000).optional(),

  // Alt C — the name to give a module being created inline.
  moduleName: z.string().trim().max(100).optional(),
  // Alt B — the student saw the near-duplicate warning and chose "Create anyway".
  createAnyway: z.boolean().optional(),
});

/**
 * UC-003 step 4 — a partial update. Every field is optional; only what the
 * student actually changed is sent, and only what is sent is written.
 *
 * `status` accepts `archived` (Alt B) and `active` (un-archiving) and nothing
 * else. `completed` belongs to UC-008's progress path, `deleted` to DELETE,
 * and `overdue` is derived from the clock — letting a client assert any of
 * them would let it bypass the logic that owns them.
 */
const patchTask = z.object({
  title: z.string().trim().min(1, 'Give the task a title').max(200).optional(),
  type: z.enum(TASK_TYPES).optional(),
  dueAt: z.string().min(1).optional(),
  module: z.string().trim().max(20).nullish(),
  gradeWeight: z.number().min(0).max(100).nullish(),
  effortHours: z.number().positive('Estimated effort must be more than 0 hours').max(200).optional(),
  prepDays: z.number().int().min(0).max(30).optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
  isGroup: z.boolean().optional(),
  blockedOnTeammate: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['active', 'archived']).optional(),

  // E2 — the optimistic-concurrency token the student's tab last saw.
  expectedUpdatedAt: z.string().optional(),
  // Alt A — the student accepted "Shift milestones proportionally?".
  shiftMilestones: z.boolean().optional(),
});

module.exports = { createTask, patchTask, TASK_TYPES };
