'use strict';

const { z } = require('../../lib/validate');

const quickParse = z.object({
  text: z.string().min(1).max(2000),
});

const bulkParse = z.object({
  text: z.string().min(1).max(8000),
});

const importRow = z.object({
  title: z.string().min(1).max(200),
  module: z.string().min(1).max(20).nullable().optional(),
  type: z.enum(['assignment', 'test', 'project', 'presentation']).default('assignment'),
  dueAt: z.string().min(8),
  gradeWeight: z.number().min(0).max(100).nullable().optional(),
  effortHours: z.number().positive().max(200).nullable().optional(),
  isGroup: z.boolean().optional(),
});

// UC-007 E1 — the same 20-line cap the preview step enforces.
const bulkImport = z.object({
  rows: z.array(importRow).min(1).max(20),
});

module.exports = {
  quickParse, bulkParse, bulkImport, importRow,
};
