'use strict';

/**
 * UC-006 Alt A — a short-lived read URL for the vision extraction path.
 *
 * The file itself still never passes through this Lambda's memory: the URL
 * is handed to the model provider, which fetches the image directly from S3.
 * Generating a presigned URL is a local SigV4 signing operation, not an S3
 * API call, so this never touches the network itself.
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const EXPIRES_SECONDS = 300; // long enough for one model call, no longer.
const s3 = new S3Client({});

async function presignGet(s3Key) {
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
  }), { expiresIn: EXPIRES_SECONDS });
}

module.exports = { presignGet, EXPIRES_SECONDS };
