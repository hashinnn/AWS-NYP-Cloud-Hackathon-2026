'use strict';

/**
 * UC-005/UC-007 — the deterministic parser and line-splitter. No AI, no
 * network, no DynamoDB: pure text in, fields out.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseDeterministic, detectDueAt, hasMultipleDueDates, isAmbiguousWeekday,
} = require('../lib/parse/deterministic');
const { splitCandidateLines, withDateToken, MAX_LINES } = require('../lib/parse/lines');
const {
  smartDefaultsFor, toApiShape, isEmptyResult, withSmartDefaults,
} = require('../lib/parse/fields');

// Tue 18 Aug 2026, 12:00 SGT.
const NOW = Date.parse('2026-08-18T04:00:00.000Z');

describe('parseDeterministic — UC-005 Alt B / UC-007 E3 fallback', () => {
  test('the worked demo phrase resolves every field correctly', () => {
    const fields = parseDeterministic(
      'db report due next friday 11:59pm, 30% of IT2214, about 9 hours work',
      { now: NOW },
    );
    assert.equal(fields.module.value, 'IT2214');
    assert.equal(fields.gradeWeight.value, 30);
    assert.equal(fields.effortHours.value, 9);
    // 11:59pm SGT next Friday (28 Aug) is 15:59 UTC.
    assert.equal(fields.dueAt.value, '2026-08-28T15:59:00.000Z');
    assert.ok(fields.dueAt.confidence > 0.7);
  });

  test('an effort estimate in hours is never mistaken for a second deadline', () => {
    // Regression: chrono-node's casual parser reads "9 hours" as a relative
    // time on its own, which used to make this look like two deadlines.
    assert.equal(
      hasMultipleDueDates('db report due next friday 11:59pm, about 9 hours work', NOW),
      false,
    );
  });

  test('two real deadlines in one line are detected — Alt C', () => {
    assert.equal(hasMultipleDueDates('report due friday, and test on next monday', NOW), true);
  });

  test('no time of day → defaults to 23:59 local (HLD §5.5)', () => {
    const dueAt = detectDueAt('tutorial due tomorrow', NOW);
    assert.equal(dueAt.value, '2026-08-19T15:59:00.000Z');
  });

  test('type keywords map to the UC-002 enum, defaulting to assignment', () => {
    assert.equal(parseDeterministic('IT2213 test on friday', { now: NOW }).type.value, 'test');
    assert.equal(parseDeterministic('group presentation next monday', { now: NOW }).type.value, 'presentation');
    assert.equal(parseDeterministic('project milestone due friday', { now: NOW }).type.value, 'project');
    assert.equal(parseDeterministic('tidy my notes by friday', { now: NOW }).type.value, 'assignment');
  });

  test('a known module code is matched with higher confidence than a bare regex guess', () => {
    const withKnownCode = parseDeterministic('IT2214 report due friday', {
      now: NOW, moduleCodes: ['IT2214'],
    });
    const withoutContext = parseDeterministic('IT2214 report due friday', { now: NOW });

    assert.equal(withKnownCode.module.value, 'IT2214');
    assert.ok(withKnownCode.module.confidence > withoutContext.module.confidence);
  });

  test('Alt A — a bare weekday is ambiguous; "next X" is not', () => {
    assert.equal(isAmbiguousWeekday('on friday'), true);
    assert.equal(isAmbiguousWeekday('next friday'), false);

    const bare = detectDueAt('test on friday', NOW);
    assert.equal(bare.candidates.length, 2);
    assert.equal(Date.parse(bare.candidates[1]) - Date.parse(bare.candidates[0]), 7 * 86400000);
  });

  test('E3 — no resolvable date at all leaves dueAt null', () => {
    const fields = parseDeterministic('asdf qwer zxcv', { now: NOW });
    assert.equal(fields.dueAt.value, null);
  });
});

describe('isEmptyResult / withSmartDefaults — shared across UC-005 and UC-007', () => {
  test('a required dueAt is the only thing that makes a result "empty"', () => {
    const noDate = parseDeterministic('a task with no date in it at all', { now: NOW });
    assert.equal(isEmptyResult(noDate), true);

    const dated = parseDeterministic('something due tomorrow', { now: NOW });
    assert.equal(isEmptyResult(dated), false);
  });

  test('UC-002 §5.5 defaults fill a missing effort estimate by type', () => {
    assert.equal(smartDefaultsFor('test').effortHours, 6);
    assert.equal(smartDefaultsFor('test').prepDays, 3);
    assert.equal(smartDefaultsFor('unknown-type').effortHours, 8); // falls back to assignment

    const fields = parseDeterministic('IT2213 test due friday', { now: NOW });
    const withDefaults = withSmartDefaults(fields);
    assert.equal(withDefaults.effortHours.value, 6);
    assert.ok(withDefaults.effortHours.confidence < 0.5, 'a defaulted field is never presented as a fact');
  });

  test('an explicitly parsed effort estimate is never overwritten by a default', () => {
    const fields = parseDeterministic('IT2213 test due friday, 4 hours', { now: NOW });
    assert.equal(withSmartDefaults(fields).effortHours.value, 4);
  });
});

describe('toApiShape — HLD §6.2 wire contract for POST /api/parse', () => {
  test('flattens {value,confidence,source} fields into {fields,confidence,sources}', () => {
    const shape = toApiShape({
      title: { value: 'Report', confidence: 0.9 },
      dueAt: { value: '2026-08-20T15:59:00.000Z', confidence: 0.8, source: 'friday' },
    }, { degraded: true });

    assert.deepEqual(shape.fields, { title: 'Report', dueAt: '2026-08-20T15:59:00.000Z' });
    assert.deepEqual(shape.confidence, { title: 0.9, dueAt: 0.8 });
    assert.deepEqual(shape.sources, { dueAt: 'friday' });
    assert.equal(shape.degraded, true);
  });
});

describe('splitCandidateLines / withDateToken — UC-007 step 2', () => {
  test('splits on newlines, semicolons, and strips bullet markers', () => {
    const lines = splitCandidateLines('- report due friday\n* test on monday; quiz tuesday');
    assert.deepEqual(lines, ['report due friday', 'test on monday', 'quiz tuesday']);
  });

  test('discards lines with no date-like token at all', () => {
    const lines = splitCandidateLines('report due friday\njust some notes\ntest on 22/08');
    assert.deepEqual(withDateToken(lines), ['report due friday', 'test on 22/08']);
  });

  test('E1 — more than MAX_LINES candidates is a caller-side truncation, not a crash', () => {
    const many = Array.from({ length: MAX_LINES + 5 }, (_, i) => `task ${i} due friday`);
    const dated = withDateToken(splitCandidateLines(many.join('\n')));
    assert.equal(dated.length, MAX_LINES + 5);
    assert.equal(dated.slice(0, MAX_LINES).length, MAX_LINES);
  });
});
