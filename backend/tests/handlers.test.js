'use strict';

/**
 * Structural guards over the Intelligence handlers.
 *
 * These are cheap to run and they enforce the rules that are easiest to break
 * by accident in a hurry — which is exactly when they get broken.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HANDLERS = [
  'views/ranking.js',
  'explain/explain.js',
  'focus/get.js',
  'weights/put.js',
  'milestones/generate.js',
  'milestones/put.js',
  'milestones/patch.js',
  'workload/heatmap.js',
  'workload/crashWeeks.js',
  'workload/apply.js',
  'workload/dismiss.js',
  'plan/today.js',
];

// The only two paths in this track allowed anywhere near the model: UC-010's
// narration endpoint and UC-012's proposal endpoint. Everything else is a
// Class A read or a Class B write, where an LLM call is a bug (AGENTS §7).
const MAY_USE_AI = new Set(['explain/explain.js', 'milestones/generate.js']);

const root = path.join(__dirname, '..', 'handlers');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Every handler loads and exposes a Lambda entry point', () => {
  for (const file of HANDLERS) {
    test(file, () => {
      const module = require(path.join(root, file));
      assert.equal(typeof module.handler, 'function', 'no exported handler');
    });
  }
});

describe('Rules that fail review — AGENTS §13', () => {
  test('userId always comes from the authoriser, never from the body', () => {
    for (const file of HANDLERS) {
      const source = read(file);
      assert.ok(source.includes('event.requestContext.authorizer.userId'),
        `${file} does not read userId from the authoriser`);
      assert.ok(!/body\.userId|body\[['"]userId/.test(source),
        `${file} reads userId from the request body`);
    }
  });

  test('no handler scans the table', () => {
    for (const file of HANDLERS) {
      assert.ok(!/ScanCommand|\bScan\(/.test(read(file)), `${file} performs a Scan`);
    }
  });

  test('no LLM call on a read or write path', () => {
    for (const file of HANDLERS) {
      if (MAY_USE_AI.has(file)) continue;
      const source = read(file);
      assert.ok(!/require\(['"][^'"]*lib\/ai/.test(source),
        `${file} imports the AI client on a Class A/B path`);
      assert.ok(!/\bchat\(/.test(source), `${file} calls the model on a Class A/B path`);
    }
  });

  test('Focus Mode asks for the template explicitly — UC-011 E1', () => {
    // It reaches the explanation layer, which can call the model; passing
    // templateOnly is what keeps this Class A read off that path.
    assert.match(read('focus/get.js'), /templateOnly: true/);
  });

  test('every caller of the model catches AiUnavailable and has a fallback', () => {
    const roots = [root, path.join(__dirname, '..', 'lib')];
    const callers = [];

    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js')) {
          const source = fs.readFileSync(full, 'utf8');
          // The client itself defines the error; everyone else must catch it.
          if (/\bchat\(/.test(source) && !full.endsWith(path.join('ai', 'client.js'))) {
            callers.push([path.relative(path.join(__dirname, '..'), full), source]);
          }
        }
      }
    };
    roots.forEach(walk);

    assert.ok(callers.length >= 2, 'expected the UC-010 and UC-012 callers');
    for (const [file, source] of callers) {
      assert.ok(/AiUnavailable/.test(source), `${file} does not handle AiUnavailable`);
      assert.ok(/[Tt]emplate/.test(source), `${file} has no deterministic fallback`);
    }
  });

  test('errors use the documented {code, message} catalogue', () => {
    const catalogue = new Set([
      'validation_failed', 'not_found', 'task_too_small', 'hours_mismatch',
      'no_valid_move', 'scoring_unavailable', 'storage_unavailable',
    ]);
    for (const file of HANDLERS) {
      for (const match of read(file).matchAll(/fail\(\d+,\s*'([a-z_]+)'/g)) {
        assert.ok(catalogue.has(match[1]), `${file} uses undocumented code "${match[1]}"`);
      }
    }
  });
});
