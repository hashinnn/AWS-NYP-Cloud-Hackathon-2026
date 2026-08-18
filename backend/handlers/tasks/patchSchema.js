'use strict';

const { z } = require('../../lib/validate');
const { TASK_TYPES } = require('./schema');

const STATUSES = ['active', 'completed', 'overdue', 'archived', 'deleted'];

/**
 * UC-003 step 4 — only the fields that changed.
 *
 * `status` is here so Alt B (archive) and step 8 (soft delete) and step 9
 * (restore) are all one partial write. Nothing in this system is ever hard
 * deleted during the hackathon, so there is no destructive path to guard.
 */
const patchTask = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  type: z.enum(TASK_TYPES).optional(),
  dueAt: z.string().min(1).optional(),
  module: z.string().trim().max(20).nullish(),
  gradeWeight: z.number().min(0).max(100).nullish(),
  effortHours: z.number().positive().max(200).nullish(),
  prepDays: z.number().int().min(0).max(30).optional(),
  progressPct: z.number().min(0).max(100).optional(),
  isGroup: z.boolean().optional(),
  blockedOnTeammate: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(STATUSES).optional(),

  // E2 — the value the client last read. Absent means "last write wins",
  // which is what an inline edit from a single tab wants.
  expectedUpdatedAt: z.string().optional(),
  // Alt A — the student answered "yes" to "shift milestones proportionally?".
  shiftMilestones: z.boolean().optional(),
});

module.exports = { patchTask, STATUSES };
