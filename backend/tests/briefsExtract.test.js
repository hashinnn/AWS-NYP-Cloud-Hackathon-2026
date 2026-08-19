'use strict';

/**
 * UC-006 — POST /api/briefs/extract, focused on the Alt A vision-routing
 * decision (image key + too-little text + AI configured) since that branch
 * is new and its correctness is not obvious from reading the handler once.
 * Stubs only `chat` and `presignGet` — everything else is the real handler.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const USER = 'test-user';

function stub(relative, overrides) {
  const resolved = require.resolve(path.join(__dirname, '..', relative));
  delete require.cache[resolved];
  const real = require(resolved);
  require.cache[resolved].exports = { ...real, ...overrides };
  return resolved;
}

function event(body) {
  return {
    body: JSON.stringify(body),
    requestContext: { authorizer: { userId: USER } },
  };
}

let originalKey;

beforeEach(() => {
  originalKey = process.env.AI_API_KEY;
  delete require.cache[require.resolve('../lib/s3/presignGet.js')];
  delete require.cache[require.resolve('../lib/ai/client.js')];
  delete require.cache[require.resolve('../handlers/briefs/extract.js')];
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.AI_API_KEY;
  else process.env.AI_API_KEY = originalKey;
});

describe('POST /api/briefs/extract — UC-006 Alt A vision routing', () => {
  test('an image key with too little text and AI configured tries the vision path', async () => {
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'test-model';

    stub('lib/s3/presignGet.js', {
      presignGet: async (key) => `https://s3.example/${key}?sig=x`,
    });
    stub('lib/ai/client.js', {
      isConfigured: () => true,
      chat: async (messages) => {
        // Confirms the image URL and instructions actually reached the model.
        const userContent = messages[1].content;
        assert.ok(Array.isArray(userContent));
        assert.ok(userContent.some((part) => part.type === 'image_url'));
        return JSON.stringify({
          title: { value: 'IT2214 Assignment 2', confidence: 0.8, source: 'IT2214 Assignment 2' },
          dueAt: { value: '2026-08-22T15:59:00.000Z', confidence: 0.7, source: '22 Aug' },
          gradeWeight: { value: 30, confidence: 0.6, source: '30%' },
          deliverables: ['ER diagram'],
        });
      },
    });

    const { handler } = require('../handlers/briefs/extract.js');
    const result = await handler(event({ s3Key: 'briefs/u1/photo.jpg', extractedText: '' }));
    const responseBody = JSON.parse(result.body);

    assert.equal(result.statusCode, 200);
    assert.equal(responseBody.fields.title, 'IT2214 Assignment 2');
    assert.equal(responseBody.degraded, false);
  });

  test('a non-image key with too little text skips vision and goes straight to no_text_found', async () => {
    process.env.AI_API_KEY = 'test-key';
    let presignCalled = false;
    stub('lib/s3/presignGet.js', { presignGet: async () => { presignCalled = true; return 'x'; } });

    const { handler } = require('../handlers/briefs/extract.js');
    const result = await handler(event({ s3Key: 'briefs/u1/scan.pdf', extractedText: 'hi' }));

    assert.equal(presignCalled, false);
    assert.equal(result.statusCode, 422);
    assert.equal(JSON.parse(result.body).code, 'no_text_found');
  });

  test('AI unconfigured (kill switch) never attempts vision, falls to no_text_found', async () => {
    delete process.env.AI_API_KEY;
    let presignCalled = false;
    stub('lib/s3/presignGet.js', { presignGet: async () => { presignCalled = true; return 'x'; } });

    const { handler } = require('../handlers/briefs/extract.js');
    const result = await handler(event({ s3Key: 'briefs/u1/photo.png', extractedText: '' }));

    assert.equal(presignCalled, false);
    assert.equal(result.statusCode, 422);
  });

  test('a vision timeout returns 504 with a degraded, empty-but-valid shape', async () => {
    process.env.AI_API_KEY = 'test-key';
    stub('lib/s3/presignGet.js', { presignGet: async () => 'https://s3.example/x' });

    // Resolved lazily, at call time — `stub()` deletes and re-requires the
    // module, so an `AiUnavailable` grabbed before that call is a stale class
    // reference and fails `instanceof` against what the handler imports.
    const clientPath = require.resolve('../lib/ai/client.js');
    stub('lib/ai/client.js', {
      isConfigured: () => true,
      chat: async () => { throw new (require(clientPath).AiUnavailable)('timeout'); },
    });

    const { handler } = require('../handlers/briefs/extract.js');
    const result = await handler(event({ s3Key: 'briefs/u1/photo.jpeg', extractedText: '' }));
    const responseBody = JSON.parse(result.body);

    assert.equal(result.statusCode, 504);
    assert.equal(responseBody.degraded, true);
    assert.equal(responseBody.fields.title, null);
  });

  test('a non-timeout vision failure falls through to E2, not a 500', async () => {
    process.env.AI_API_KEY = 'test-key';
    stub('lib/s3/presignGet.js', { presignGet: async () => 'https://s3.example/x' });

    const clientPath = require.resolve('../lib/ai/client.js');
    stub('lib/ai/client.js', {
      isConfigured: () => true,
      chat: async () => { throw new (require(clientPath).AiUnavailable)('http_429'); },
    });

    const { handler } = require('../handlers/briefs/extract.js');
    const result = await handler(event({ s3Key: 'briefs/u1/photo.png', extractedText: '' }));

    assert.equal(result.statusCode, 422);
    assert.equal(JSON.parse(result.body).code, 'no_text_found');
  });
});
