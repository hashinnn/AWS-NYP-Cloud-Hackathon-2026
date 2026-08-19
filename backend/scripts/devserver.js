'use strict';

/**
 * Local dev API — `npm run dev:api` (from `backend/`).
 *
 * Runs the REAL Intelligence handlers against an in-memory table so the
 * frontend can be developed and demoed with no AWS account, no deployed stack
 * and no network. It stubs only the I/O layer; every line of scoring,
 * explanation, crash-week and planning logic is the code that ships.
 *
 * NOT FOR DEPLOYMENT. There is no authentication here — any email and password
 * are accepted and mapped to the same demo student. Endpoints owned by other
 * members (auth, prefs, progress) are faked just enough to render.
 *
 * All dates are relative to `now`, so this fixture can never go stale.
 */

const http = require('node:http');
const path = require('node:path');

// PORT is honoured too, so a second instance can run alongside the default.
const PORT = Number(process.env.DEV_API_PORT || process.env.PORT) || 3001;
const BACKEND = path.join(__dirname, '..');
const USER = 'demo-user';

const now = Date.now();
const days = (n) => n * 86400000;
const iso = (ms) => new Date(ms).toISOString();

const task = (o) => ({
  PK: `USER#${USER}`,
  SK: `TASK#${o.taskId}`,
  userId: USER,
  status: 'active',
  type: 'assignment',
  progressPct: 0,
  prepDays: 0,
  isGroup: false,
  blockedOnTeammate: false,
  source: 'form',
  createdAt: iso(now - days(7)),
  updatedAt: iso(now),
  priorityScore: null,
  ...o,
});

const module_ = (code, name, colour, totalWeight = 100) => ({
  PK: `USER#${USER}`, SK: `MODULE#${code}`, code, name, colour, totalWeight,
});

const milestone = (taskId, milestoneId, o) => ({
  PK: `USER#${USER}`, SK: `MILESTONE#${taskId}#${milestoneId}`, taskId, milestoneId, ...o,
});

// The HLD §13.3 demo shape: a tight 40% report, a test with prep days, a
// blocked group project, two clashing small tasks, and one overdue item —
// PLUS the texture of an account that has been used all semester: named
// modules, milestones mid-flight, hours logged, a completed history and an
// inbox. The invariants above are load-bearing for the demo; the texture is
// what makes the screens read as a product rather than a fixture.
let ITEMS = [
  {
    PK: `USER#${USER}`,
    SK: 'PROFILE',
    userId: USER,
    displayName: 'Alex Tan',
    email: 'demo@nyp.edu.sg',
    tz: 'Asia/Singapore',
  },
  {
    PK: `USER#${USER}`,
    SK: 'PREFS',
    availability: {
      mon: 3, tue: 3, wed: 2, thu: 3, fri: 2, sat: 5, sun: 4,
    },
    availabilitySetAt: iso(now - days(30)),
    blockedDates: [iso(now + days(6)).slice(0, 10)],   // work shift this weekend
    weights: {
      urgency: 0.30, stakes: 0.25, effortPressure: 0.20, progressDeficit: 0.15, clashPenalty: 0.10,
    },
  },

  // ── modules (UC-004) — colours are light-palette steps, resolved to slots ──
  module_('IT2214', 'Database Systems', '#2a78d6'),
  module_('IT2213', 'Networking Fundamentals', '#eb6834'),
  module_('IT2212', 'Professional Ethics', '#1baf7a'),
  module_('IT2216', 'Full-Stack Development', '#eda100'),
  module_('IT2215', 'Agile Team Project', '#e87ba4'),

  // ── the active week ──
  task({
    taskId: 't-report',
    title: 'Database Report',
    module: 'IT2214',
    gradeWeight: 40,
    effortHours: 12,
    progressPct: 15,
    hoursSpent: 2,
    dueAt: iso(now + days(3)),
    notes: 'ERD + normalisation write-up. Prof wants the query plans annotated.',
    history: [
      { at: iso(now - days(2)), field: 'progressPct', from: 0, to: 15 },
      // WHEN the hours went in, not just how many — the companion's mood and
      // anything else time-aware reads this, exactly as UC-008 writes it.
      { at: iso(now - days(0.2)), field: 'hoursSpent', from: 0, to: 2 },
    ],
  }),
  task({
    taskId: 't-test',
    title: 'Networking Test',
    module: 'IT2213',
    type: 'test',
    gradeWeight: 25,
    effortHours: 6,
    prepDays: 3,
    dueAt: iso(now + days(5)),
    notes: 'Covers subnetting, TCP handshake, and the OSI layers. Past papers on Brightspace.',
  }),
  task({
    taskId: 't-quiz', title: 'Ethics Quiz', module: 'IT2212', gradeWeight: 5, effortHours: 2, dueAt: iso(now + days(2)),
  }),
  task({
    taskId: 't-lab', title: 'Lab Worksheet 4', module: 'IT2216', gradeWeight: 10, effortHours: 3, progressPct: 30, hoursSpent: 1, dueAt: iso(now + days(4)),
  }),
  task({
    taskId: 't-group',
    title: 'Group Project Build',
    module: 'IT2215',
    type: 'project',
    gradeWeight: 30,
    effortHours: 30,
    progressPct: 20,
    hoursSpent: 6,
    isGroup: true,
    blockedOnTeammate: true,
    dueAt: iso(now + days(11)),
    notes: 'Waiting on Daniel’s API branch before the frontend can integrate.',
  }),
  task({
    taskId: 't-late', title: 'Tutorial Submission', module: 'IT2212', status: 'overdue', gradeWeight: 5, effortHours: 2, dueAt: iso(now - days(2)), overdueSince: iso(now - days(2)),
  }),
  task({
    taskId: 't-pitch',
    title: 'Sprint Review Presentation',
    module: 'IT2215',
    type: 'presentation',
    gradeWeight: 10,
    effortHours: 5,
    prepDays: 1,
    dueAt: iso(now + days(14)),
  }),

  // ── the report, broken down (UC-012) — first step already done ──
  milestone('t-report', 'm-erd', {
    name: 'Draft the ER diagram', hours: 2, order: 1, dueAt: iso(now + days(0.5)), completedAt: iso(now - days(1)),
  }),
  milestone('t-report', 'm-write', {
    name: 'Write normalisation section', hours: 6, order: 2, dueAt: iso(now + days(1.5)), completedAt: null,
  }),
  milestone('t-report', 'm-queries', {
    name: 'Annotate query plans and revise', hours: 4, order: 3, dueAt: iso(now + days(2)), completedAt: null,
  }),

  // ── the record so far (UC-022) — estimates run ~1.3× reality here, which
  //    is what makes the estimation-accuracy hint appear on the next create ──
  task({
    taskId: 't-done-1',
    title: 'SQL Fundamentals Quiz',
    module: 'IT2214',
    status: 'completed',
    gradeWeight: 10,
    effortHours: 3,
    hoursSpent: 4,
    progressPct: 100,
    dueAt: iso(now - days(6)),
    completedAt: iso(now - days(6.2)),
  }),
  task({
    taskId: 't-done-2',
    title: 'Wireframe Assignment',
    module: 'IT2216',
    status: 'completed',
    gradeWeight: 15,
    effortHours: 6,
    hoursSpent: 8,
    progressPct: 100,
    dueAt: iso(now - days(9)),
    completedAt: iso(now - days(9.1)),
  }),
  task({
    taskId: 't-done-3',
    title: 'Ethics Case Study',
    module: 'IT2212',
    status: 'completed',
    gradeWeight: 15,
    effortHours: 5,
    hoursSpent: 7,
    progressPct: 100,
    dueAt: iso(now - days(13)),
    completedAt: iso(now - days(12.5)),
    lateSubmission: true,
  }),
  task({
    taskId: 't-done-4',
    title: 'Subnetting Worksheet',
    module: 'IT2213',
    status: 'completed',
    gradeWeight: 5,
    effortHours: 2,
    hoursSpent: 2.5,
    progressPct: 100,
    dueAt: iso(now - days(16)),
    completedAt: iso(now - days(16.3)),
  }),
];

// ── stub the I/O layer, keep every pure helper real ────────────────────────
function stub(relative, overrides) {
  const resolved = require.resolve(path.join(BACKEND, relative));
  const real = require(resolved);
  require.cache[resolved].exports = { ...real, ...overrides };
}

const upsert = (sk, changes) => {
  const item = ITEMS.find((i) => i.SK === sk);
  if (item) Object.assign(item, changes);
  return item;
};

stub('lib/dynamo/tasks.js', {
  getAllForUser: async () => JSON.parse(JSON.stringify(ITEMS)),
  getTask: async (userId, taskId) => ITEMS.find((i) => i.SK === `TASK#${taskId}`) || null,
  // The conditional write is honoured here, not just in the deployed stack,
  // so UC-003 E2 (two tabs, one loses) can be demonstrated locally.
  patchTask: async (userId, taskId, changes, expectedUpdatedAt) => {
    const existing = ITEMS.find((i) => i.SK === `TASK#${taskId}`);
    if (expectedUpdatedAt !== undefined && existing && existing.updatedAt !== expectedUpdatedAt) {
      const error = new Error('stale');
      error.name = 'ConditionalCheckFailedException';
      throw error;
    }
    return upsert(`TASK#${taskId}`, { ...changes, updatedAt: iso(Date.now()) });
  },
  saveScores: async (userId, scored) => {
    for (const t of scored) {
      if (t.subScores) {
        upsert(`TASK#${t.taskId}`, {
          priorityScore: t.priorityScore,
          subScores: t.subScores,
          tight: t.tight,
          dataGap: t.dataGap,
        });
      }
    }
  },
  // UC-007's bulk import — mirrors the real BatchWriteItem call against the
  // in-memory table; nothing here ever fails, so `failed` is always empty.
  createTasks: async (userId, tasks) => {
    const items = tasks.map((t) => ({ PK: `USER#${USER}`, SK: `TASK#${t.taskId}`, ...t }));
    ITEMS.push(...items);
    return { created: items, failed: [] };
  },
  // UC-002's single create (Philena's POST /api/tasks).
  createTask: async (userId, task) => {
    const item = {
      ...task,
      PK: `USER#${USER}`,
      SK: `TASK#${task.taskId}`,
      GSI1PK: `USER#${USER}`,
      GSI1SK: `DUE#${task.dueAt}`,
      userId: USER,
    };
    ITEMS.push(item);
    return item;
  },
});

stub('lib/dynamo/modules.js', {
  // UC-002 Alt C — inline module creation. Returns null when it already
  // exists, exactly as the conditional Put does (UC-004 E1).
  createModule: async (userId, { code, name, colour, totalWeight }) => {
    const sk = `MODULE#${code}`;
    if (ITEMS.some((i) => i.SK === sk)) return null;
    const real = require(path.join(BACKEND, 'lib/dynamo/modules.js'));
    const item = {
      PK: `USER#${USER}`,
      SK: sk,
      code,
      name: name || code,
      colour: colour || real.colourFor(code),
      totalWeight: totalWeight ?? 100,
    };
    ITEMS.push(item);
    return item;
  },
  patchModule: async (userId, code, changes) => upsert(`MODULE#${code}`, changes),
});

stub('lib/dynamo/prefs.js', {
  getPrefs: async () => ITEMS.find((i) => i.SK === 'PREFS'),
  patchPrefs: async (userId, changes) => upsert('PREFS', changes),
});

// ── ZOE — notifications, roster and the calendar feed ──────────────────────
// The reminder pipeline is stubbed at exactly the same seam as everything
// else: the conditional write is honoured, so UC-019 E3 (a duplicate
// EventBridge invocation sending nothing twice) is demonstrable locally.
// The inbox arrives lived-in: yesterday's digest already read, today's nudge
// and escalation waiting — the state UC-019 would have produced overnight.
const notif = (daysAgo, taskId, rule, subject, body, readAt) => {
  const date = iso(now - days(daysAgo)).slice(0, 10);
  return {
    PK: `USER#${USER}`,
    SK: `NOTIF#${date}#${taskId || rule}#${rule}`,
    userId: USER,
    date,
    taskId,
    rule,
    subject,
    body,
    delivered: true,
    createdAt: iso(now - days(daysAgo)),
    readAt: readAt || null,
  };
};

let NOTIFS = [
  notif(1, null, 'digest', 'Your day: 3 priorities, 1 overdue',
    'Today’s plan: Database Report (2 h), Networking Test revision (1.5 h). '
    + 'Top 3: Database Report, Tutorial Submission, Networking Test. '
    + 'Overdue — resolve first: Tutorial Submission.', iso(now - days(0.9))),
  notif(0.2, 't-quiz', 'same_day_nudge', 'Ethics Quiz is due in 20 hours',
    'Ethics Quiz (IT2212) is due in 20 hours and is at 0% — about 2 hours of work remain.'),
  notif(0.1, 't-report', 'escalation', 'You’re behind on Database Report',
    'You’re 25% behind pace on Database Report, due in 3 days. 10 hours of work remain '
    + 'against 11 free hours before the deadline.'),
];
let FEED = new Map();

stub('lib/dynamo/notifications.js', {
  putNotification: async (userId, notification) => {
    const SK = `NOTIF#${notification.date}#${notification.taskId || notification.rule}#${notification.rule}`;
    if (NOTIFS.some((n) => n.SK === SK)) return null;
    const item = { PK: `USER#${USER}`, SK, userId, ...notification };
    NOTIFS.push(item);
    return item;
  },
  markDelivery: async (userId, sk, changes) => {
    const item = NOTIFS.find((n) => n.SK === sk);
    if (item) Object.assign(item, changes);
  },
  listForDate: async (userId, date) => NOTIFS.filter((n) => n.SK.startsWith(`NOTIF#${date}#`)),
  listRecent: async () => [...NOTIFS].reverse(),
  markRead: async (userId, sk, at) => {
    const item = NOTIFS.find((n) => n.SK === sk);
    if (!item) return false;
    item.readAt = at;
    return true;
  },
  rememberUser: async () => {},
  listUsers: async (after) => (after ? [] : [{ userId: USER, email: 'demo@nyp.edu.sg' }]),
  getCursor: async () => null,
  setCursor: async () => {},
});

stub('lib/dynamo/feed.js', {
  issueToken: async (userId) => {
    const token = 'dev-feed-token';
    FEED.set(token, userId);
    return token;
  },
  revokeToken: async () => { FEED = new Map(); },
  userIdForToken: async (token) => (FEED.has(token) ? USER : null),
});

stub('lib/dynamo/users.js', {
  getProfile: async () => ITEMS.find((i) => i.SK === 'PROFILE'),
});

stub('lib/dynamo/character.js', {
  getCharacter: async () => {
    const real = require(path.join(BACKEND, 'lib/dynamo/character.js'));
    const item = ITEMS.find((i) => i.SK === 'CHARACTER');
    return { ...real.DEFAULT_CHARACTER, ...(item || {}) };
  },
  patchCharacter: async (userId, changes) => {
    const real = require(path.join(BACKEND, 'lib/dynamo/character.js'));
    let item = ITEMS.find((i) => i.SK === 'CHARACTER');
    if (!item) { item = { PK: `USER#${USER}`, SK: 'CHARACTER', ...real.DEFAULT_CHARACTER }; ITEMS.push(item); }
    Object.assign(item, changes);
    return { ...real.DEFAULT_CHARACTER, ...item };
  },
});

stub('lib/dynamo/milestones.js', {
  getMilestonesForTask: async (userId, taskId) => ITEMS
    .filter((i) => String(i.SK).startsWith(`MILESTONE#${taskId}#`))
    .sort((a, b) => (a.order || 0) - (b.order || 0)),
  putMilestones: async (userId, taskId, milestones) => {
    ITEMS = ITEMS.filter((i) => !String(i.SK).startsWith(`MILESTONE#${taskId}#`));
    for (const m of milestones) {
      ITEMS.push({
        PK: `USER#${USER}`, SK: `MILESTONE#${taskId}#${m.milestoneId}`, ...m, taskId,
      });
    }
    return ITEMS.filter((i) => String(i.SK).startsWith(`MILESTONE#${taskId}#`));
  },
  patchMilestone: async (userId, taskId, milestoneId, changes) => upsert(`MILESTONE#${taskId}#${milestoneId}`, changes),
});

const H = (p) => require(path.join(BACKEND, 'handlers', p)).handler;
const routes = [
  ['POST', /^\/api\/tasks$/, H('tasks/create.js')],
  ['GET', /^\/api\/tasks$/, H('tasks/list.js')],
  ['POST', /^\/api\/tasks\/([^/]+)\/restore$/, H('tasks/restore.js'), ['taskId']],
  ['GET', /^\/api\/tasks\/([^/]+)$/, H('tasks/get.js'), ['taskId']],
  ['PATCH', /^\/api\/tasks\/([^/]+)$/, H('tasks/patch.js'), ['taskId']],
  ['DELETE', /^\/api\/tasks\/([^/]+)$/, H('tasks/remove.js'), ['taskId']],
  ['GET', /^\/api\/modules$/, H('modules-prefs/modulesList.js')],
  ['POST', /^\/api\/modules$/, H('modules-prefs/modulesCreate.js')],
  ['PATCH', /^\/api\/modules\/([^/]+)$/, H('modules-prefs/modulesPatch.js'), ['code']],
  ['GET', /^\/api\/character$/, H('character/get.js')],
  ['PUT', /^\/api\/character$/, H('character/put.js')],
  ['POST', /^\/api\/character\/purchase$/, H('character/purchase.js')],
  ['GET', /^\/api\/ranking$/, H('views/ranking.js')],
  ['POST', /^\/api\/explain$/, H('explain/explain.js')],
  ['GET', /^\/api\/focus$/, H('focus/get.js')],
  ['PUT', /^\/api\/prefs\/weights$/, H('weights/put.js')],
  ['GET', /^\/api\/plan\/today$/, H('plan/today.js')],
  ['GET', /^\/api\/workload\/heatmap$/, H('workload/heatmap.js')],
  ['GET', /^\/api\/workload\/crash-weeks$/, H('workload/crashWeeks.js')],
  ['POST', /^\/api\/workload\/crash-weeks\/([^/]+)\/apply$/, H('workload/apply.js'), ['weekStart']],
  ['POST', /^\/api\/workload\/crash-weeks\/([^/]+)\/dismiss$/, H('workload/dismiss.js'), ['weekStart']],
  ['POST', /^\/api\/tasks\/([^/]+)\/milestones\/generate$/, H('milestones/generate.js'), ['taskId']],
  ['PUT', /^\/api\/tasks\/([^/]+)\/milestones$/, H('milestones/put.js'), ['taskId']],
  ['PATCH', /^\/api\/tasks\/([^/]+)\/milestones\/([^/]+)$/, H('milestones/patch.js'), ['taskId', 'id']],
  // Smart Capture — Mahdiya. `briefs/presign.js` needs a real S3 bucket and
  // real AWS credentials, so it is not wired here; test it against
  // `sam local` or a deployed stack instead.
  ['POST', /^\/api\/parse$/, H('parse/quick.js')],
  ['POST', /^\/api\/parse\/bulk$/, H('parse/bulk.js')],
  ['POST', /^\/api\/parse\/bulk\/import$/, H('parse/bulkImport.js')],
  ['POST', /^\/api\/briefs\/extract$/, H('briefs/extract.js')],
  ['POST', /^\/api\/tasks\/([^/]+)\/progress$/, H('progress/logProgress.js'), ['taskId']],
  // UC-004 prefs — real handlers now, not the stand-ins that used to live in
  // the request loop below. (The task routes above are Philena's own.)
  ['GET', /^\/api\/prefs$/, H('modules-prefs/get.js')],
  ['PUT', /^\/api\/prefs$/, H('modules-prefs/put.js')],
  // ── Experience & Notifications — Zoe ──
  ['GET', /^\/api\/dashboard$/, H('views/dashboard.js')],
  ['GET', /^\/api\/calendar$/, H('views/calendar.js')],
  ['GET', /^\/api\/completed$/, H('completed/list.js')],
  ['GET', /^\/api\/notifications$/, H('notif-prefs/list.js')],
  ['POST', /^\/api\/notifications\/([^/]+)\/read$/, H('notif-prefs/read.js'), ['id']],
  ['PUT', /^\/api\/prefs\/notifications$/, H('notif-prefs/put.js')],
  ['POST', /^\/api\/reminders\/run$/, H('reminders/run.js')],
  ['POST', /^\/api\/reminders\/test$/, H('reminders/test.js')],
  ['POST', /^\/api\/tasks\/([^/]+)\/resolve$/, H('overdue/resolve.js'), ['taskId']],
  ['GET', /^\/api\/export\/ics$/, H('export/ics.js')],
  ['POST', /^\/api\/export\/feed-token$/, H('export/feedToken.js')],
  ['GET', /^\/api\/feed\/([^/]+)$/, H('export/feed.js'), ['token']],
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

  let body = '';
  for await (const chunk of req) body += chunk;

  // ── other members' endpoints, faked just enough to render ──
  // UC-006 steps 1–2 without AWS: a fake presign pointing back at this server,
  // and a PUT sink that accepts the upload and discards it. The real handler
  // needs a real bucket and credentials, so it stays untouched.
  if (req.method === 'POST' && url.pathname === '/api/briefs/presign') {
    const parsed = JSON.parse(body || '{}');
    if (Number(parsed.sizeBytes) > 5 * 1024 * 1024) {
      res.writeHead(400, cors);
      return res.end(JSON.stringify({
        code: 'file_too_large',
        message: 'Please upload a PDF, Word document or image under 5 MB.',
      }));
    }
    const key = `briefs/${USER}/dev-${Date.now()}-${String(parsed.filename || 'brief')}`;
    res.writeHead(200, cors);
    return res.end(JSON.stringify({
      uploadUrl: `http://localhost:${PORT}/dev/upload/${encodeURIComponent(key)}`,
      s3Key: key,
      expiresIn: 300,
    }));
  }
  if (req.method === 'PUT' && url.pathname.startsWith('/dev/upload/')) {
    res.writeHead(200, cors);
    return res.end('');
  }

  if (url.pathname === '/api/auth/login' || url.pathname === '/api/auth/register') {
    res.writeHead(200, cors);
    return res.end(JSON.stringify({
      token: 'dev-token',
      // The SAME profile /api/users/me returns. A second hardcoded identity
      // here meant the display name changed depending on whether you had just
      // signed in or just reloaded — one student saw "Demo Student", the next
      // saw "Alex Tan", from the same fixture.
      user: ITEMS.find((i) => i.SK === 'PROFILE'),
    }));
  }
  if (url.pathname === '/api/users/me') {
    res.writeHead(200, cors);
    return res.end(JSON.stringify({
      user: ITEMS.find((i) => i.SK === 'PROFILE'),
      prefs: ITEMS.find((i) => i.SK === 'PREFS'),
    }));
  }
  // /api/prefs is no longer faked here — UC-004's real handlers are wired
  // into `routes` below.
  // Progress logging is now the real UC-008 handler, registered in `routes`
  // below (progress/logProgress.js) — no fake stand-in needed here any more.


  for (const [method, pattern, handler, names = []] of routes) {
    const match = url.pathname.match(pattern);
    if (req.method !== method || !match) continue;

    const pathParameters = {};
    names.forEach((name, i) => { pathParameters[name] = match[i + 1]; });

    try {
      const result = await handler({
        httpMethod: method,
        pathParameters,
        queryStringParameters: Object.fromEntries(url.searchParams),
        // Zoe's POST /api/reminders/run authenticates on a header rather than
        // the JWT, so headers have to survive the hop into the handler.
        headers: req.headers,
        body,
        requestContext: { authorizer: { userId: USER } },
      });
      // A handler that sets its own Content-Type means it (`text/calendar`,
      // `text/csv`) — do not overwrite it with the JSON default. The handler's
      // CORS origin (FRONTEND_URL, exact in production) IS overwritten: the
      // dev frontend may sit on any port, and this server is dev-only.
      res.writeHead(result.statusCode, {
        ...cors,
        ...(result.headers || {}),
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(result.body || '');
    } catch (error) {
      console.error('handler threw:', url.pathname, error);
      res.writeHead(500, cors);
      return res.end(JSON.stringify({ code: 'internal', message: error.message }));
    }
  }

  // The message is rendered verbatim to the student (HLD §6.1), so it must
  // read as English rather than as a URL. It still names the route, because
  // the usual cause is a dev server left running from before the handler was
  // written — restarting it is the fix.
  res.writeHead(404, cors);
  return res.end(JSON.stringify({
    code: 'not_found',
    message: `No route for ${req.method} ${url.pathname} on the dev API — restart it if you have just added this handler.`,
  }));
});

server.listen(PORT, () => {
  console.log(`dev api on http://localhost:${PORT}`);
  console.log('sign in with any email and password — e.g. demo@nyp.edu.sg / demo');
});
