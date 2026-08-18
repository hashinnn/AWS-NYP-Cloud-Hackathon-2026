'use strict';

const { z } = require('../../lib/validate');

const SUPPORTED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
]);

const MAX_BYTES = 5 * 1024 * 1024; // UC-006 — 5 MB cap.

const presign = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().refine((v) => SUPPORTED_TYPES.has(v), {
    message: 'Please upload a PDF, Word document or image under 5 MB.',
  }),
  sizeBytes: z.number().int().positive().max(MAX_BYTES, {
    message: 'Please upload a PDF, Word document or image under 5 MB.',
  }),
});

// A generous sanity bound only — the handler truncates to the actual token
// budget before sending anything to the model (HLD §6.2 "briefs/extract").
const extract = z.object({
  s3Key: z.string().min(1).max(500),
  extractedText: z.string().max(200000),
});

module.exports = {
  presign, extract, SUPPORTED_TYPES, MAX_BYTES,
};
