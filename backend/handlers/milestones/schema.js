'use strict';

const { z } = require('../../lib/validate');

const milestone = z.object({
  milestoneId: z.string().optional(),
  name: z.string().min(1).max(80),
  hours: z.number().positive().max(200),
  dueAt: z.string().min(8),
  order: z.number().int().optional(),
  completedAt: z.string().nullable().optional(),
});

const putMilestones = z.object({
  milestones: z.array(milestone).min(1).max(25),
});

const generateMilestones = z.object({
  deliverables: z.array(z.string().min(1).max(120)).max(10).optional(),
});

const patchMilestone = z.object({
  name: z.string().min(1).max(80).optional(),
  hours: z.number().positive().max(200).optional(),
  dueAt: z.string().min(8).optional(),
  completedAt: z.string().nullable().optional(),
});

module.exports = { putMilestones, generateMilestones, patchMilestone };
