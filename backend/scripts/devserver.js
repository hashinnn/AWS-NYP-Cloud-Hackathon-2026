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

const PORT = Number(process.env.DEV_API_PORT) || 3001;
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

// The HLD §13.3 demo shape: a tight 40% report, a test with prep days, a
// blocked group project, two clashing small tasks, and one overdue item.
let ITEMS = [
  {
    PK: `USER#${USER}`,
    SK: 'PROFILE',
    userId: USER,
    displayName: 'Demo Student',
    email: 'demo@nyp.edu.sg',
    tz: 'Asia/Singapore',
  },
  {
    PK: `USER#${USER}`,
    SK: 'PREFS',
    availability: {
      mon: 3, tue: 3, wed: 2, thu: 3, fri: 2, sat: 5, sun: 4,
    },
    blockedDates: [],
    weights: {
      urgency: 0.30, stakes: 0.25, effortPressure: 0.20, progressDeficit: 0.15, clashPenalty: 0.10,
    },
  },
  task({
    taskId: 't-report', title: 'Database Report', module: 'IT2214', gradeWeight: 40, effortHours: 12, progressPct: 15, dueAt: iso(now + days(3)),
  }),
  task({
    taskId: 't-test', title: 'Networking Test', module: 'IT2213', type: 'test', gradeWeight: 25, effortHours: 6, prepDays: 3, dueAt: iso(now + days(5)),
  }),
  task({
    taskId: 't-quiz', title: 'Ethics Quiz', module: 'IT2212', gradeWeight: 5, effortHours: 2, dueAt: iso(now + days(2)),
  }),
  task({
    taskId: 't-lab', title: 'Lab Worksheet 4', module: 'IT2216', gradeWeight: 10, effortHours: 3, dueAt: iso(now + days(4)),
  }),
  task({
    taskId: 't-group', title: 'Group Project Build', module: 'IT2215', type: 'project', gradeWeight: 30, effortHours: 30, isGroup: true, blockedOnTeammate: true, dueAt: iso(now + days(11)),
  }),
  task({
    taskId: 't-late', title: 'Tutorial Submission', module: 'IT2212', status: 'overdue', gradeWeight: 5, effortHours: 2, dueAt: iso(now - days(2)), overdueSince: iso(now - days(2)),
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
  ['GET', /^\/api\/modules$/, H('modules/list.js')],
  ['POST', /^\/api\/modules$/, H('modules/create.js')],
  ['PATCH', /^\/api\/modules\/([^/]+)$/, H('modules/patch.js'), ['code']],
  ['GET', /^\/api\/prefs$/, H('prefs/get.js')],
  ['PUT', /^\/api\/prefs$/, H('prefs/put.js')],
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
  if (url.pathname === '/api/auth/login' || url.pathname === '/api/auth/register') {
    res.writeHead(200, cors);
    return res.end(JSON.stringify({
      token: 'dev-token',
      user: { userId: USER, displayName: 'Demo Student', email: 'demo@nyp.edu.sg' },
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
        body,
        requestContext: { authorizer: { userId: USER } },
      });
      res.writeHead(result.statusCode, cors);
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
