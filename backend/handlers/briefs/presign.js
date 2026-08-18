'use strict';

/**
 * POST /api/briefs/presign — UC-006 step 2.
 *
 * The file goes straight from the browser to S3 on this URL; it never
 * touches Lambda, which is what keeps a multi-page brief off the payload
 * limit (HLD §4.3). Key is namespaced by `userId` so no student can guess
 * another student's object key from the pattern alone.
 */

const crypto = require('node:crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');

const EXPIRES_SECONDS = 300; // UC-006 precondition — 5-minute expiry.
const s3 = new S3Client({});

function sanitize(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}

/** UC-006 E1 needs `file_too_large` / `unsupported_type`, not a generic 400. */
function errorCodeFor(path) {
  if (path === 'contentType') return 'unsupported_type';
  if (path === 'sizeBytes') return 'file_too_large';
  return 'validation_failed';
}

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.presign);
  if (errors) return fail(400, errorCodeFor(errors[0].path), errors[0].message);

  const s3Key = `briefs/${userId}/${crypto.randomUUID()}-${sanitize(body.filename)}`;

  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
    ContentType: body.contentType,
  }), { expiresIn: EXPIRES_SECONDS });

  return ok(200, { uploadUrl, s3Key, expiresIn: EXPIRES_SECONDS });
};
