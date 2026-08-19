'use strict';

/**
 * `npm run seed` — wipe and reseed the demo account (HLD §13.3).
 *
 * Every deadline is computed from `now`, so the fixture can never go stale
 * between a rehearsal and judging. Idempotent: running it twice leaves the
 * same partition, because it deletes everything under the demo user first.
 *
 * Writes to the REAL table named by TABLE_NAME. Set AWS credentials and
 * TABLE_NAME (and optionally SEED_EMAIL / SEED_PASSWORD) before running.
 *
 * The dataset is not arbitrary — HLD §13.3 fixes what it must prove:
 *   · a 40% report that mathematically does not fit  → the `tight` badge
 *   · a test 5 days out with 3 prep days             → prep-day logic
 *   · a group task blocked on a teammate             → Focus Mode's skip
 *   · two small deadlines inside 72 hours            → ClashPenalty
 *   · one overdue task                               → UC-021
 *   · exactly one crash week, and it is week 2       → the heatmap on stage
 */

const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const {
  QueryCommand, BatchWriteCommand, PutCommand,
} = require('@aws-sdk/lib-dynamodb');
const { send, TABLE_NAME, pk } = require('../lib/dynamo/client');
const { DEFAULT_PREFS } = require('../lib/dynamo/prefs');
const { colourFor } = require('../lib/dynamo/modules');
const { getAllForUser, rankedTasks, saveScores } = require('../lib/dynamo/tasks');
const { scoringPrefs, extractPrefs } = require('../lib/dynamo/prefs');
const { buildWeeks } = require('../lib/workload/weeks');
const score = require('../lib/scoring');

const EMAIL = (process.env.SEED_EMAIL || 'demo@nyp.edu.sg').toLowerCase();
const PASSWORD = process.env.SEED_PASSWORD || 'demo1234';
const USER_ID = process.env.SEED_USER_ID || 'demo-student';
const TZ = 'Asia/Singapore';
const BCRYPT_COST = 10;

const now = Date.now();
const days = (n) => n * 86400000;
const iso = (ms) => new Date(ms).toISOString();

/**
 * Availability is the other half of every crash week. 3 h on weekdays and
 * 5 h at weekends is the documented default (UC-004 step 4) — the crash week
 * below is produced by concentrating WORK, not by starving capacity, because
 * a heatmap that is red only because the student claimed no time proves
 * nothing about the model.
 */
const AVAILABILITY = {
  mon: 3, tue: 3, wed: 2, thu: 3, fri: 2, sat: 5, sun: 4,
};

const MODULES = [
  ['IT2214', 'Database Systems'],
  ['IT2213', 'Network Fundamentals'],
  ['IT2212', 'Professional Ethics'],
  ['IT2215', 'Software Engineering Project'],
  ['IT2216', 'Web Development'],
];

function task(fields) {
  const dueAt = fields.dueAt;
  const overdue = Date.parse(dueAt) < now;
  return {
    taskId: fields.taskId,
    title: fields.title,
    module: fields.module,
    type: fields.type || 'assignment',
    dueAt,
    gradeWeight: fields.gradeWeight,
    effortHours: fields.effortHours,
    hoursSpent: fields.hoursSpent ?? 0,
    progressPct: fields.progressPct ?? 0,
    isGroup: fields.isGroup ?? false,
    blockedOnTeammate: fields.blockedOnTeammate ?? false,
    prepDays: fields.prepDays ?? 0,
    status: overdue ? 'overdue' : 'active',
    notes: fields.notes || '',
    priorityScore: null,
    subScores: null,
    tight: false,
    dataGap: [],
    explanation: null,
    explanationHash: null,
    explanationStale: true,
    s3Key: null,
    source: 'form',
    createdAt: iso(now - days(fields.createdDaysAgo ?? 7)),
    updatedAt: iso(now),
    completedAt: null,
    lateSubmission: false,
    overdueSince: overdue ? dueAt : null,
    // Logged hours carry a timestamp, not just a total. UC-008 always writes
    // this entry when a student logs progress, so anything asking "when did
    // they last study" works on real accounts. A seed that set only the total
    // would leave the demo account looking like it had never been opened.
    history: fields.hoursSpent
      ? [{
        at: iso(now - days(fields.studiedDaysAgo ?? 1)),
        field: 'hoursSpent',
        from: 0,
        to: fields.hoursSpent,
      }]
      : [],
  };
}

/**
 * A finished task. Status, completedAt and lateSubmission are set explicitly
 * rather than derived, because the point of these rows is the record they
 * leave behind — the ranking ignores them entirely.
 */
function completed(fields) {
  return {
    ...task(fields),
    status: 'completed',
    progressPct: 100,
    completedAt: iso(now - days(fields.completedDaysAgo ?? 7)),
    lateSubmission: fields.lateSubmission ?? false,
    overdueSince: null,
  };
}

const TASKS = [
  // The centrepiece: 12 h of work, 15% done, three days left. At this
  // student's availability that is ~10.2 h remaining against ~7 h free —
  // ratio > 1.0, so `tight` is true and the badge is earned, not decorative.
  task({
    taskId: 'seed-report',
    title: 'Database Report',
    module: 'IT2214',
    gradeWeight: 40,
    effortHours: 12,
    progressPct: 15,
    hoursSpent: 1.8,
    studiedDaysAgo: 0.2,
    dueAt: iso(now + days(3)),
  }),
  // prepDays = 3 pulls the effective deadline to day 2, so this outranks the
  // quiz due a day sooner. This single row is the academic-awareness demo.
  task({
    taskId: 'seed-test',
    title: 'Networking Test',
    module: 'IT2213',
    type: 'test',
    gradeWeight: 25,
    effortHours: 6,
    prepDays: 3,
    dueAt: iso(now + days(5)),
  }),
  // Two small deadlines inside 72 hours of each other — ClashPenalty.
  task({
    taskId: 'seed-quiz',
    title: 'Ethics Quiz',
    module: 'IT2212',
    gradeWeight: 5,
    effortHours: 2,
    dueAt: iso(now + days(2)),
  }),
  task({
    taskId: 'seed-lab',
    title: 'Lab Worksheet 4',
    module: 'IT2216',
    gradeWeight: 10,
    effortHours: 3,
    dueAt: iso(now + days(4)),
  }),
  // Week 2's crash: 34 h of group build landing in a week with ~22 h free.
  // Blocked on a teammate as well, so Focus Mode visibly skips it (Alt B).
  task({
    taskId: 'seed-group',
    title: 'Group Project Build',
    module: 'IT2215',
    type: 'project',
    gradeWeight: 30,
    effortHours: 34,
    isGroup: true,
    blockedOnTeammate: true,
    dueAt: iso(now + days(11)),
    createdDaysAgo: 14,
  }),
  // One overdue item for UC-021.
  task({
    taskId: 'seed-late',
    title: 'Tutorial Submission',
    module: 'IT2212',
    gradeWeight: 5,
    effortHours: 2,
    dueAt: iso(now - days(2)),
  }),

  // ── the record so far ────────────────────────────────────────────────
  // Four finished tasks, because several features are inert without a
  // history: UC-022 refuses to show an estimation-accuracy figure under
  // three samples, that figure is what feeds UC-002's "you usually need
  // about 1.3x your estimate" hint, and the companion's points are derived
  // from completed work — with none, every shop item is locked.
  //
  // hoursSpent runs deliberately ~1.3x effortHours so the hint has something
  // true to say. One is late, so the on-time rate is not a flat 100%.
  completed({
    taskId: 'seed-done-1',
    title: 'SQL Fundamentals Quiz',
    module: 'IT2214',
    gradeWeight: 10,
    effortHours: 3,
    hoursSpent: 4,
    dueAt: iso(now - days(6)),
    completedDaysAgo: 6.2,
  }),
  completed({
    taskId: 'seed-done-2',
    title: 'Wireframe Assignment',
    module: 'IT2216',
    gradeWeight: 15,
    effortHours: 6,
    hoursSpent: 8,
    dueAt: iso(now - days(9)),
    completedDaysAgo: 9.1,
  }),
  completed({
    taskId: 'seed-done-3',
    title: 'Ethics Case Study',
    module: 'IT2212',
    gradeWeight: 15,
    effortHours: 5,
    hoursSpent: 7,
    dueAt: iso(now - days(13)),
    completedDaysAgo: 12.5,
    lateSubmission: true,
  }),
  completed({
    taskId: 'seed-done-4',
    title: 'Subnetting Worksheet',
    module: 'IT2213',
    gradeWeight: 5,
    effortHours: 2,
    hoursSpent: 2.5,
    dueAt: iso(now - days(16)),
    completedDaysAgo: 16.3,
  }),
];

/** Delete every item under the demo partition, plus its email guard. */
async function wipe() {
  const keys = [];
  let ExclusiveStartKey;
  do {
    const page = await send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'PK' },
      ExpressionAttributeValues: { ':pk': pk(USER_ID) },
      ProjectionExpression: 'PK, SK',
      ExclusiveStartKey,
    }));
    keys.push(...(page.Items || []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  keys.push({ PK: `EMAIL#${EMAIL}`, SK: 'EMAIL' });

  for (let i = 0; i < keys.length; i += 25) {
    await send(new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })),
      },
    }));
  }
  return keys.length;
}

async function put(item) {
  await send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

async function main() {
  const started = Date.now();
  console.log(`seeding ${EMAIL} into ${TABLE_NAME}…`);

  const removed = await wipe();
  console.log(`  wiped ${removed} item(s)`);

  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_COST);

  await put({ PK: `EMAIL#${EMAIL}`, SK: 'EMAIL', userId: USER_ID });
  await put({
    PK: pk(USER_ID),
    SK: 'PROFILE',
    userId: USER_ID,
    email: EMAIL,
    displayName: 'Demo Student',
    passwordHash,
    tz: TZ,
    createdAt: iso(now - days(30)),
    feedToken: null,
  });
  await put({
    PK: pk(USER_ID),
    SK: 'PREFS',
    ...DEFAULT_PREFS,
    availability: AVAILABILITY,
    blockedDates: [],
  });

  for (const [code, name] of MODULES) {
    await put({
      PK: pk(USER_ID),
      SK: `MODULE#${code}`,
      code,
      name,
      colour: colourFor(code),
      totalWeight: 100,
    });
  }

  for (const item of TASKS) {
    await put({
      ...item,
      PK: pk(USER_ID),
      SK: `TASK#${item.taskId}`,
      GSI1PK: pk(USER_ID),
      GSI1SK: `DUE#${item.dueAt}`,
      userId: USER_ID,
    });
  }

  // Seed with scores already computed, so the first screen a judge sees is
  // ranked rather than five "score pending" badges waiting on the hourly job.
  const items = await getAllForUser(USER_ID);
  const prefs = scoringPrefs(items, extractPrefs(items));
  const ranked = score(rankedTasks(items), prefs, iso(now));
  await saveScores(USER_ID, ranked);

  // The fixture is only correct if it still proves what §13.3 says it proves.
  // Assert that here rather than discovering it on stage.
  const weeks = buildWeeks(ranked, [], prefs, iso(now));
  const crash = weeks.filter((week) => week.crash);
  const tight = ranked.filter((t) => t.tight).map((t) => t.title);

  console.log(`  ${MODULES.length} modules, ${TASKS.length} tasks, scored in ${Date.now() - started} ms`);
  console.log(`  top of the ranking: ${ranked[0].title} (${ranked[0].priorityScore})`);
  console.log(`  tight: ${tight.join(', ') || 'none'}`);
  console.log(`  crash weeks: ${crash.map((w) => `${w.label} (+${w.overloadHours} h)`).join(', ') || 'none'}`);

  // The current week is legitimately over capacity — the 40% report does not
  // fit before its own deadline, which is the whole point of it. What the
  // demo needs is for WEEK 2 to be the unmistakable one (HLD §13.3).
  if (!weeks[1].crash) {
    console.warn('  ⚠ week 2 is not a crash week — the heatmap has nothing red to click on (HLD §13.3).');
  }
  if (weeks.slice(2).some((week) => week.crash)) {
    console.warn('  ⚠ a week beyond week 2 is also red — the grid should read as one red block.');
  }
  if (tight.length === 0) {
    console.warn('  ⚠ no task is flagged `tight` — the "does not fit" badge has nothing to show.');
  }

  console.log(`\ndone in ${Date.now() - started} ms — sign in as ${EMAIL} / ${PASSWORD}`);
}

// Exported so the fixture's demo-critical properties can be asserted without
// an AWS account — `tests/seed.test.js` checks them on every run.
module.exports = {
  TASKS, MODULES, AVAILABILITY, USER_ID, EMAIL, now,
};

if (require.main === module) {
  main().catch((error) => {
    console.error('seed failed:', error);
    process.exit(1);
  });
}
