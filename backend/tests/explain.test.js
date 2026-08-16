'use strict';

/**
 * UC-010 — explanation generation, and the validator that keeps the model
 * honest. No network: the AI path is exercised by deleting AI_API_KEY, which
 * is exactly what the kill-switch test does to the deployed Lambda.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const score = require('../lib/scoring');
const { DEFAULT_WEIGHTS } = require('../lib/scoring/normalise');
const {
  contributions, topContributors, buildPayload, explanationHash,
} = require('../lib/explain/contributions');
const { templateSentence } = require('../lib/explain/template');
const { reasonRankedLower } = require('../lib/explain/compare');
const { explainTask } = require('../lib/explain/generate');
const { validateNarration, firstSentence, wordCount } = require('../lib/ai/validate');

const NOW = Date.parse('2026-08-16T16:00:00.000Z');
const days = (n) => n * 86400000;
const iso = (ms) => new Date(ms).toISOString();

const PREFS = {
  tz: 'Asia/Singapore',
  availability: { mon: 2, tue: 2, wed: 2, thu: 0, fri: 0, sat: 0, sun: 0 },
  blockedDates: [],
  weights: { ...DEFAULT_WEIGHTS },
};

// The HLD §7.4 task, so the sentence under test is the one in the document.
const report = {
  taskId: 'a-report',
  title: 'IT2214 Database Report',
  notes: 'ask the tutor about the ER diagram',
  module: 'IT2214',
  type: 'assignment',
  status: 'active',
  gradeWeight: 40,
  effortHours: 12,
  progressPct: 15,
  prepDays: 0,
  createdAt: iso(NOW - days(7)),
  dueAt: iso(NOW + days(3)),
};
const clashA = { ...report, taskId: 'b', title: 'Quiz', gradeWeight: 5, effortHours: 2, dueAt: iso(NOW + days(2)) };
const clashB = { ...report, taskId: 'c', title: 'Lab', gradeWeight: 10, effortHours: 3, dueAt: iso(NOW + days(4)) };

const ranked = score([report, clashA, clashB], PREFS, NOW);
const scored = ranked[0];
const payload = buildPayload(scored, ranked, PREFS, DEFAULT_WEIGHTS, NOW, 1);

describe('The numbers-only payload — UC-010 step 3', () => {
  test('carries the sub-score contributions and the supporting figures', () => {
    assert.equal(payload.rank, 1);
    assert.deepEqual(payload.topContributors.map((c) => c.label),
      ['Stakes', 'Effort Pressure', 'Urgency']);
    assert.deepEqual(payload.topContributors.map((c) => c.weighted), [25, 20, 14.2]);
    assert.equal(payload.figures.gradeWeight, 40);
    assert.equal(payload.figures.remainingHours, 10.2);
    assert.equal(payload.figures.availableHours, 6);
    assert.equal(payload.figures.daysUntilDue, 3);
    assert.equal(payload.figures.clashCount, 2);
  });

  test('the task title and notes are structurally absent', () => {
    const serialised = JSON.stringify(payload);
    assert.ok(!serialised.includes('Database Report'));
    assert.ok(!serialised.includes('ER diagram'));
    // The module code is deliberately present — HLD §7.4 sends it.
    assert.equal(payload.figures.module, 'IT2214');
  });

  test('contributions are weighted, not raw — that is what the bar draws', () => {
    const all = contributions(scored.subScores, DEFAULT_WEIGHTS);
    assert.equal(all[0].key, 'stakes');
    assert.equal(all[0].value, 100);
    assert.equal(all[0].weighted, 25);
    // The bars add up to the badge, exactly — see scoring/index.js.
    assert.equal(all.reduce((sum, c) => sum + c.weighted, 0).toFixed(1), '73.5');
    assert.equal(scored.priorityScore, 73.5);
  });

  test('UC-015 Alt A — a zero weight removes that factor entirely', () => {
    const noStakes = { ...DEFAULT_WEIGHTS, stakes: 0 };
    const top = topContributors(scored.subScores, noStakes);
    assert.ok(!top.some((c) => c.key === 'stakes'));
  });
});

describe('The deterministic sentence — UC-010 E1', () => {
  test('is one sentence, within the word limit, and reads like English', () => {
    const sentence = templateSentence(payload);
    assert.ok(wordCount(sentence) <= 30, `${wordCount(sentence)} words: ${sentence}`);
    assert.equal(firstSentence(sentence), sentence); // exactly one sentence
    assert.match(sentence, /^Top priority: /);
    assert.match(sentence, /40% of IT2214/);
  });

  test('every numeral in it comes from the payload', () => {
    const checked = validateNarration(templateSentence(payload), payload);
    assert.equal(checked.ok, true, checked.reason);
  });

  test('UC-009 Alt B — no availability is named as the cause', () => {
    const noTime = { ...PREFS, availability: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 } };
    const blocked = score([{ ...report, taskId: 'x' }], noTime, NOW)[0];
    const sentence = templateSentence(
      buildPayload(blocked, [blocked], noTime, DEFAULT_WEIGHTS, NOW, 1),
    );
    assert.match(sentence, /no study hours free/);
  });

  test('an overdue task is described as overdue, not as due in zero days', () => {
    const late = score([{ ...report, taskId: 'late', status: 'overdue', dueAt: iso(NOW - days(2)) }],
      PREFS, NOW)[0];
    const sentence = templateSentence(
      buildPayload(late, [late], PREFS, DEFAULT_WEIGHTS, NOW, 1),
    );
    assert.match(sentence, /overdue by 2 days/);
  });

  test('a task with no data at all still gets a sentence', () => {
    const sparse = score([{
      taskId: 'sparse', status: 'active', createdAt: iso(NOW - days(1)), dueAt: iso(NOW + days(5)),
    }], PREFS, NOW)[0];
    const sentence = templateSentence(
      buildPayload(sparse, [sparse], PREFS, DEFAULT_WEIGHTS, NOW, 4),
    );
    assert.ok(sentence.length > 0);
    assert.ok(wordCount(sentence) <= 30);
  });
});

describe('Numeral provenance — HLD §8.4, the check that enforces the thesis', () => {
  test('accepts a sentence built only from supplied figures', () => {
    const good = 'Top priority: worth 40% of IT2214, 10 hours of work left against 6 free hours.';
    assert.equal(validateNarration(good, payload).ok, true);
  });

  test('rejects a hallucinated figure outright — UC-010 E2', () => {
    const bad = 'Top priority: worth 40% of IT2214 and 87 hours of work remain.';
    const result = validateNarration(bad, payload);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unsupported_numeral:87');
  });

  test('rejects anything over 30 words', () => {
    const long = `Top priority ${'word '.repeat(31)}.`;
    assert.equal(validateNarration(long, payload).reason, 'too_long');
  });

  test('strips markdown, quotes and preamble, then takes the first sentence — E3', () => {
    const messy = 'Sure, here is your sentence:\n\n**"Top priority: worth 40% of IT2214."**\nLet me know!';
    const result = validateNarration(messy, payload);
    assert.equal(result.ok, true);
    assert.equal(result.sentence, 'Top priority: worth 40% of IT2214.');
  });

  test('firstSentence never returns a fragment of a second sentence', () => {
    assert.equal(firstSentence('One. Two. Three.'), 'One.');
  });
});

describe('Caching — UC-010 Alt A', () => {
  test('the hash is stable for unchanged sub-scores and moves when they change', () => {
    const a = explanationHash(scored.subScores, DEFAULT_WEIGHTS);
    assert.equal(a, explanationHash({ ...scored.subScores }, DEFAULT_WEIGHTS));
    assert.notEqual(a, explanationHash({ ...scored.subScores, urgency: 90 }, DEFAULT_WEIGHTS));
    // Re-weighting reorders the contributions, so the sentence must be redone.
    assert.notEqual(a, explanationHash(scored.subScores, { ...DEFAULT_WEIGHTS, stakes: 0.45 }));
  });

  test('a cached sentence is served without touching the model', async () => {
    const hash = explanationHash(scored.subScores, DEFAULT_WEIGHTS);
    const cached = {
      ...scored,
      explanation: 'Cached sentence.',
      explanationHash: hash,
      explanationSource: 'ai',
    };
    const result = await explainTask(cached, ranked, PREFS, DEFAULT_WEIGHTS, NOW, 1);
    assert.equal(result.cached, true);
    assert.equal(result.text, 'Cached sentence.');
    assert.equal(result.source, 'ai');
  });
});

describe('The kill-switch — AGENTS §15', () => {
  test('with AI_API_KEY unset, explanations still arrive and nothing throws', async () => {
    const original = process.env.AI_API_KEY;
    delete process.env.AI_API_KEY;
    try {
      const result = await explainTask(scored, ranked, PREFS, DEFAULT_WEIGHTS, NOW, 1);
      assert.equal(result.source, 'template');
      assert.ok(result.text.includes('40%'));
      assert.equal(result.contributions.length, 5);
    } finally {
      if (original !== undefined) process.env.AI_API_KEY = original;
    }
  });
});

describe('"Not now" — UC-011 step 6', () => {
  test('names the single biggest reason the next task ranked lower', () => {
    const higher = ranked[0];
    const lower = ranked.find((t) => t.taskId === 'b');
    const reason = reasonRankedLower(higher, lower, DEFAULT_WEIGHTS, NOW);
    assert.equal(reason.key, 'stakes');
    assert.equal(reason.text, 'lower stakes: 5% of IT2214 versus 40% of IT2214');
  });

  test('says so honestly when the two are almost level', () => {
    const twin = { ...ranked[0] };
    const reason = reasonRankedLower(ranked[0], twin, DEFAULT_WEIGHTS, NOW);
    assert.match(reason.text, /close call/);
  });
});
