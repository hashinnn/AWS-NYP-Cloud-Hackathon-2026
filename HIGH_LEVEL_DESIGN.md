# DeadlineIQ — High-Level Design

**Project:** DeadlineIQ — Academic Deadline Tracking & Prioritisation System
**Competition:** AWS × NYP Cloud Hackathon 2026
**Problem Statement:** PS-3 — Assignment Deadline Tracker
**Team:** Philena (Platform & Data) · Mahdiya (Smart Capture) · Hasini (Intelligence) · Zoe (Experience & Notifications)
**Status:** Design frozen at kickoff. Changes to §5 (data model) or §6 (API contract) require agreement from all four members.

---

## Document map

| Document | Answers |
| --- | --- |
| `AGENTS.md` | **How** to work — rules for every human and AI contributor. Read first, every session. |
| `DeadlineIQ_Use_Cases.md` | **What** to build — 23 use cases with main flows, alternative flows, error cases, postconditions. The behavioural spec. |
| **`HIGH_LEVEL_DESIGN.md`** (this file) | **How it fits together** — architecture, data model, API contract, algorithms, failure handling, security, deployment. |
| `PROJECT_IMPLEMENTATION_PHASES.md` | **When and by whom** — build order, dependencies, acceptance criteria, risk register. |
| `README.md` | **How to run it** — setup, local dev, deploy, demo. |

**Precedence when documents conflict:** `DeadlineIQ_Use_Cases.md` (behaviour) > this document (structure) > `PROJECT_IMPLEMENTATION_PHASES.md` (sequencing). If you find a genuine contradiction, raise it in the team channel — do not silently pick one.

---

## Table of contents

1. [Problem restatement and design thesis](#1-problem-restatement-and-design-thesis)
2. [Requirements traceability](#2-requirements-traceability)
3. [Architecture overview](#3-architecture-overview)
4. [Component responsibilities](#4-component-responsibilities)
5. [Data model](#5-data-model)
6. [API contract](#6-api-contract)
7. [The prioritisation algorithm](#7-the-prioritisation-algorithm)
8. [The AI layer and its contracts](#8-the-ai-layer-and-its-contracts)
9. [Scheduling and notification pipeline](#9-scheduling-and-notification-pipeline)
10. [Cross-cutting concerns](#10-cross-cutting-concerns)
11. [Sequence flows](#11-sequence-flows)
12. [Non-functional requirements](#12-non-functional-requirements)
13. [Deployment topology](#13-deployment-topology)
14. [Explicit non-goals](#14-explicit-non-goals)
15. [Glossary](#15-glossary)

---

## 1. Problem restatement and design thesis

### 1.1 What the brief actually asks for

PS-3 asks for a platform that lets students record academic dates and then "stay organised through clear deadline tracking, useful reminders, and prioritisation support." The brief is unusually specific about the hard part:

> *"During busy academic periods, knowing a deadline is not always enough. Students must also decide which task should be completed first, how early they need to begin, whether multiple deadlines are concentrated in the same week…"*

and, decisively:

> *"Teams should explain how their solution determines which tasks require attention. A higher-priority recommendation should be understandable rather than appearing arbitrary."*

That last sentence is the scoring rubric hiding in plain sight. A CRUD app that sorts by nearest deadline satisfies the *recording* requirement and fails the *prioritisation* requirement entirely.

### 1.2 The thesis

> **Ranking is deterministic arithmetic. AI only narrates it.**

DeadlineIQ computes a priority score from five weighted, normalised factors (§7). The computation involves no language model, no embeddings, no learned weights. It is reproducible on paper. An LLM is then given *only the resulting numbers* and asked to write one sentence explaining them — and that sentence is validated to contain no figure that wasn't in the input.

### 1.3 Why every major decision follows from the thesis

| Decision | Consequence of the thesis |
| --- | --- |
| Sub-scores persisted on every task write, not computed at render | The narration prompt is a fixed-shape numeric payload. Task titles and descriptions are never sent, so the model *cannot* re-rank even if it wanted to. |
| Scoring engine is a **pure shared library**, not an HTTP service | The task-write path and the scheduled reminder Lambda import the same functions. Two code paths cannot drift into two different rankings. |
| Every AI feature ships with a deterministic fallback | A 429 during judging degrades prose quality, never functionality. §8.5. |
| Weight sliders recompute **client-side** from persisted sub-scores | Dragging a slider reorders the list in <16 ms with no network call. This is the fastest possible proof to a judge that the formula is real and transparent (UC-015). |
| Single-table DynamoDB with a deadline GSI | Every hot query is "one student's tasks in a time window, in deadline order." One `Query`, zero `Scan`s. §5.4. |
| Two EventBridge rules → one Lambda | The AWS story is one diagram and one sentence, both rehearsable. §9. |

### 1.4 The sentence every team member must be able to say

> *"A task is written to DynamoDB by a Lambda behind API Gateway; an EventBridge rule wakes a scoring Lambda hourly; that Lambda queries the deadline GSI, recomputes priority, and publishes a reminder through SNS — and CloudWatch shows the whole chain."*

Followed by:

> *"Every ranking in this system is arithmetic you can check. The AI writes the sentence. It never picks the order."*

---

## 2. Requirements traceability

Each row maps a requirement from the brief to the use case and the component that satisfies it. **Nothing in the brief is unaddressed; nothing we build is unmotivated.**

### 2.1 Core capabilities (the required task-management journey)

| # | Brief requirement | UC | Component |
| --- | --- | --- | --- |
| 1 | Student creates an academic task | UC-002, UC-005, UC-006, UC-007 | `tasks/create`, `parse/`, `briefs/` |
| 2 | Records module, type, deadline, details | UC-002, UC-004 | `tasks/create`, `modules-prefs/` |
| 3 | Task stored and displayed in an organised view | UC-016, UC-017 | DynamoDB + `views/dashboard`, `views/calendar` |
| 4 | Platform identifies upcoming or urgent deadlines | UC-009, UC-013 | `lib/scoring` (shared) |
| 5 | Student receives a reminder or notification | UC-019, UC-020 | EventBridge → `reminders/` → SNS |
| 6 | Student updates progress or marks complete | UC-008, UC-022 | `progress/`, `completed/` |

### 2.2 "A strong solution may include"

| Brief item | UC | Notes |
| --- | --- | --- |
| Create / edit / delete tasks | UC-002, UC-003 | Soft delete with 10 s undo; nothing hard-deleted during the hackathon. |
| Task categories | UC-002 | `assignment · test · project · presentation`, each with distinct smart defaults. |
| Deadline dates **and times** | UC-002 | Time defaults to 23:59 (polytechnic norm), always editable. |
| Module / subject labels | UC-004 | `MODULE#` items carry a colour reused across every chart and view. |
| Priority **and** progress indicators | UC-009, UC-008 | Priority badge + progress ring on every row. |
| Dashboard / list / timeline / calendar views | UC-016, UC-017, UC-018 | All four. Timeline shows work *spans*, not just deadline points. |
| Countdown messages | UC-016 | Rendered in the brief's own wording: "Test in 3 days", "Assignment due in 24 hours". |
| Reminder preferences | UC-020 | Channels, digest time, quiet hours, daily cap, per-type lead times. |
| Completed-task tracking | UC-022 | Plus estimation-accuracy statistic that feeds forward into future estimates. |
| Filtering and sorting | UC-016 | By module, deadline, type, urgency, completion status. Persisted across navigation. |

### 2.3 Prioritisation considerations (the differentiator)

The brief lists nine factors an advanced system "could also consider." DeadlineIQ addresses **eight of nine**:

| Brief factor | How DeadlineIQ handles it |
| --- | --- |
| Estimated effort | `effortHours` → EffortPressure sub-score (§7.2c) |
| Percentage of module grade | `gradeWeight` → Stakes sub-score (§7.2b) |
| Current completion progress | `progressPct` → ProgressDeficit sub-score (§7.2d) and reduces `remainingHours` |
| Task difficulty | Proxied by `effortHours`; not modelled separately (see §14) |
| Dependencies between tasks | Milestones (UC-012) create intra-task ordering; group-blocked tasks are skipped in Focus Mode (UC-011 Alt B) |
| Individual vs group work | `isGroup` flag; blocked-on-teammate state skips Focus Mode |
| Student's available study time | Per-weekday availability + blocked dates in `PREFS` → EffortPressure denominator |
| Clashes between deadlines | ClashPenalty sub-score (§7.2e) + crash-week detection (UC-013) |
| Tests needing multi-day preparation | `prepDays` shifts the effective deadline earlier in Urgency (§7.2a) — **this is the factor most teams will miss** |

### 2.4 Innovation opportunities addressed

| Brief item | UC | Status |
| --- | --- | --- |
| AI-generated study/work plans | UC-014 | Deterministic greedy allocator, AI-narrated |
| Automatic breakdown into milestones | UC-012 | LLM + template fallback, constraints enforced in code |
| Workload visualisation across week/semester | UC-018 | 12-week Chart.js matrix heatmap |
| Detection of unusually busy periods | UC-013 | `loadRatio > 1.0` → crash week |
| Suggested daily tasks based on available time | UC-014 | 45-min minimum block, 3-h maximum run |
| Natural-language task entry | UC-005 | LLM + `chrono-node` fallback |
| Extraction of deadlines from uploaded briefs | UC-006 | Client-side PDF text extraction + LLM field extraction with source snippets |
| Shared deadlines for project teams | — | **Not built** — see §14 |
| Progress check-ins | UC-008 | Slider + hour logging + progress history |
| Calendar integration | UC-023 | `.ics` export + tokenised subscription feed |
| Adaptive reminders | UC-019 | Escalation triggered by ProgressDeficit, not just time |
| Redistribution when deadlines clash | UC-013 | Quantified, applicable recommendation |
| Focus mode | UC-011 | One card, one action, one explanation |

### 2.5 "Important considerations" — the judging checklist

| Brief question | Answer | Where |
| --- | --- | --- |
| Are reminders delivered at useful times? | Per-student digest time, per-type lead times (tests 7 d, projects 5 d, assignments 3 d), quiet hours enforced. | UC-019, UC-020 |
| How are overdue tasks handled? | Status transition, pinned top with red styling, Urgency pinned to 100, three explicit resolutions, auto-archive after 30 days. | UC-021 |
| How can students correct wrong deadlines? | Correction is a *designed step*: confirmation card (UC-005), source-snippet review screen (UC-006), editable review table (UC-007), inline edit anywhere (UC-003). Nothing is ever written without confirmation. | UC-005/006/007/003 |
| Can prioritisation be explained? | Five persisted sub-scores, a stacked contribution bar, a validated one-sentence narration, and interactive weight sliders. | UC-009, UC-010, UC-015 |
| How is notification overload avoided? | **Hard cap of 3 per student per day**, overflow absorbed into the next digest, quiet hours 22:00–07:00, one grouped card when several tasks go overdue at once. | UC-019, UC-021 |
| How are task and account data secured? | JWT authoriser injects `userId`; every DynamoDB call is partition-scoped; cross-account reads are structurally impossible. | §10.1 |
| What if workload or availability changes? | Availability is a first-class input; changing it re-invokes scoring immediately and re-shades the heatmap live. | UC-004, UC-018 Alt B |
| Does it reduce effort rather than create admin work? | Smart defaults by task type, natural-language entry, brief extraction, bulk paste import. The full form is the *fallback*, not the primary path. | UC-002/005/006/007 |

### 2.6 AWS requirement

| Service | Used for | Owner | UC |
| --- | --- | --- | --- |
| **Amazon DynamoDB** | Single-table store for tasks, milestones, modules, preferences, progress, notifications | Philena | All |
| **AWS Lambda** | Every backend handler; scoring; scheduled recompute; reminder dispatch | All | All |
| **Amazon API Gateway** | REST front door + JWT Lambda authoriser | Philena | All |
| **Amazon EventBridge** | Hourly recompute + daily 08:00 SGT digest | Zoe | UC-019 |
| **Amazon SNS** | Reminder delivery (SMTP fallback if unavailable) | Zoe | UC-019 |
| **Amazon S3** | Assignment brief uploads via presigned PUT | Mahdiya | UC-006 |
| **Amazon CloudWatch** | Structured logs + demo metrics dashboard | All | §10.6 |

**AI bonus (5 marks, relaxed criteria):** OpenRouter free-tier chat model for UC-005 parsing, UC-006 extraction, UC-010 narration, UC-012 milestone generation. Permitted explicitly by the participant update: *"You are therefore not required to use Amazon Bedrock to qualify for these bonus marks."*

---

## 3. Architecture overview

### 3.1 System context

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          STUDENT'S BROWSER                                  │
│                     React + Vite SPA, hosted on Vercel                      │
│                                                                             │
│  Dashboard · Focus Mode · Calendar · Timeline · Heatmap · Settings          │
│  QuickAdd bar · Bulk import · Brief upload · Completed view                 │
│                                                                             │
│  Client-side work: pdfjs-dist text extraction, chrono-node date fallback,   │
│                    Chart.js rendering, .ics generation, optimistic UI       │
└───────────┬──────────────────────────────────────────┬─────────────────────┘
            │ HTTPS + Bearer JWT                       │ HTTPS PUT (presigned)
            ▼                                          ▼
┌───────────────────────────────────────────┐   ┌──────────────────┐
│         Amazon API Gateway (REST)          │   │    Amazon S3      │
│         CORS allowlist = FRONTEND_URL      │   │  brief uploads    │
│                    │                       │   │  5-min presign    │
│                    ▼                       │   └──────────────────┘
│         ┌──────────────────────┐           │
│         │  Lambda Authoriser   │           │
│         │  verify JWT (HS256)  │           │
│         │  → context.userId    │           │
│         └──────────┬───────────┘           │
└────────────────────┼───────────────────────┘
                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        AWS Lambda — feature handlers                        │
│                                                                             │
│  auth/  tasks/  modules-prefs/  parse/  briefs/  progress/  explain/        │
│  focus/  milestones/  workload/  weights/  views/  reminders/  notif-prefs/ │
│  overdue/  completed/  export/                                             │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  backend/lib/scoring  —  PURE SHARED LIBRARY                          │  │
│  │  (tasks[], prefs) → tasks[] with priorityScore + subScores            │  │
│  │  No AWS SDK. No network. No LLM. Imported by task-writes AND          │  │
│  │  the scheduled reminder Lambda so rankings cannot drift.              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└──────┬──────────────────────────────┬───────────────────────┬──────────────┘
       │                              │                       │
       ▼                              ▼                       ▼
┌──────────────────┐        ┌──────────────────┐   ┌──────────────────────┐
│ Amazon DynamoDB  │        │  OpenRouter LLM  │   │   Amazon SNS         │
│ single table     │        │  (free tier)     │   │   (or SMTP fallback) │
│ `deadlineiq`     │        │                  │   │                      │
│ + GSI1 deadline  │        │  parse · extract │   │   → student email    │
│                  │        │  narrate · split │   │                      │
└────────┬─────────┘        └──────────────────┘   └──────────┬───────────┘
         │                                                     │
         │           ┌──────────────────────────┐              │
         └──────────►│  Amazon EventBridge      │──────────────┘
                     │  rate(1 hour)   recompute│
                     │  cron(0 0 * * ? *) digest│
                     └──────────────────────────┘

                    All components → Amazon CloudWatch (logs + metrics)
```

### 3.2 Request classification

Every request in the system falls into one of four classes. Knowing which class you are writing determines latency budget, failure handling, and whether AI may be involved.

| Class | Examples | Latency budget | AI allowed? | Failure behaviour |
| --- | --- | --- | --- | --- |
| **A — Read path** | dashboard, calendar, ranking, heatmap | < 500 ms p95 | No | Serve stale from cache with a banner; never blank |
| **B — Write path** | create/update task, log progress | < 800 ms p95 | No | Roll back optimistic UI, retain form contents |
| **C — Assisted capture** | quick parse, brief extract, bulk import | < 6 s, then fall back | Yes, with fallback | Deterministic parser takes over, fields marked amber |
| **D — Background** | hourly recompute, daily digest | < 60 s per batch page | Yes (narration pre-warm only) | Resumable cursor; partial progress preserved |

**Rule:** Class A and B must *never* block on the LLM. If you find an LLM call on a read or write path, it is a bug.

---

## 4. Component responsibilities

### 4.1 Frontend — React + Vite on Vercel

**Owner of the shell:** Philena (auth, routing, layout). **Owner of the views:** Zoe (dashboard, calendar, completed) and Hasini (focus, heatmap, weights).

| Concern | Implementation | Notes |
| --- | --- | --- |
| Routing | React Router, file-per-page under `src/pages/` | Protected routes wrap in `<RequireAuth>` |
| Auth state | `context/AuthContext.tsx` | Token in `localStorage`; axios interceptor attaches `Authorization`; 401 → silent refresh → redirect preserving form state in `sessionStorage` (UC-001 E3) |
| Server state | `context/TasksContext.tsx` | Single source of task truth; every mutation returns the updated resource and the context reconciles. **No Redux, no React Query** — scope does not justify it |
| Charts | Chart.js via `src/lib/chartTheme.ts` | **Hasini owns this file.** UC-016, UC-017, UC-018 import from it. Module colours come from a fixed accessible palette so the same module is the same colour in every view |
| Optimistic UI | Every write | Apply locally → fire request → reconcile or roll back with a toast. Required by UC-003 step 3, UC-008 step 6 |
| PDF/DOCX extraction | `pdfjs-dist`, `mammoth` | **Client-side.** Files are not parsed in Lambda — avoids the 6 MB payload limit and keeps Lambda cheap |
| Date fallback | `chrono-node` | Runs in the browser *and* in Lambda; same library, same results |
| Calendar export | `ics` package | Client-side generation; server only needed for the tokenised subscription feed |
| Countdown rendering | `src/lib/countdown.ts` | Must emit the brief's exact phrasing: `Test in 3 days`, `Assignment due in 24 hours`. Live-ticks and transitions to overdue without reload (UC-016 E3) |

**Frontend performance budget:** first contentful paint < 1.5 s on venue wifi; dashboard fully interactive < 5 s (UC-016 postcondition states "within five seconds of the page appearing").

### 4.2 API Gateway

- REST API, regional endpoint, stage `prod`.
- CORS: `Access-Control-Allow-Origin: <FRONTEND_URL>` only. Not `*`.
- Lambda authoriser (`REQUEST` type) attached to every route except `/api/auth/*` and `/api/feed/{token}.ics`.
- Authoriser result cached 300 s keyed on the `Authorization` header.
- Throttling: 20 req/s burst, 10 req/s steady per stage. This is cost protection, not security — the authoriser is the real gate.

### 4.3 Lambda handlers

**Runtime:** Node.js 20.x · **Memory:** 256 MB · **Timeout:** 10 s (30 s for `reminders/run` and `briefs/extract`) · **Architecture:** arm64 (cheaper, faster cold start).

Full handler inventory with ownership:

| Path prefix | Owner | Handlers | UC | Class |
| --- | --- | --- | --- | --- |
| `auth/` | Philena | `register`, `login`, `refresh`, `me` | UC-001 | B |
| `tasks/` | Philena | `list`, `create`, `get`, `update`, `softDelete`, `restore` | UC-002, UC-003 | A/B |
| `modules-prefs/` | Philena | `listModules`, `createModule`, `updateModule`, `getPrefs`, `putPrefs` | UC-004 | A/B |
| `parse/` | Mahdiya | `quick`, `bulk` | UC-005, UC-007 | C |
| `briefs/` | Mahdiya | `presign`, `extract` | UC-006 | C |
| `progress/` | Mahdiya | `logProgress`, `logHours` | UC-008 | B |
| `explain/` | Hasini | `narrate` (batched) | UC-010 | C |
| `focus/` | Hasini | `next` | UC-011 | A |
| `milestones/` | Hasini | `generate`, `save`, `update`, `toggle` | UC-012 | B/C |
| `workload/` | Hasini | `heatmap`, `crashWeeks`, `applyRedistribution`, `dismiss`, `todayPlan` | UC-013, UC-014, UC-018 | A/B |
| `weights/` | Hasini | `putWeights` | UC-015 | B |
| `views/` | Zoe | `dashboard`, `calendar` | UC-016, UC-017 | A |
| `reminders/` | Zoe | `scheduled` (EventBridge entry), `run` (manual), `test` | UC-019 | D |
| `notif-prefs/` | Zoe | `putNotificationPrefs` | UC-020 | B |
| `overdue/` | Zoe | `resolve` | UC-021 | B |
| `completed/` | Zoe | `list`, `stats` | UC-022 | A |
| `export/` | Zoe | `ics`, `feedToken`, `feed` (public) | UC-023 | A |

**Every handler follows the same skeleton** — deviating from it is a review comment:

```js
// backend/handlers/<group>/<name>.js
const { ok, fail } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const schema = require('./schema');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;   // NEVER from body
  const body = JSON.parse(event.body || '{}');

  const errors = validate(body, schema.createTask);
  if (errors) return fail(400, 'validation_failed', errors[0].message);

  // ... do the one thing this handler does ...

  return ok(201, createdTask);
};
```

### 4.4 The scoring engine — `backend/lib/scoring/`

**Owner:** Hasini. **This is the most important 200 lines in the repository.**

Constraints, all enforced by review:

1. **Pure functions only.** No `require('@aws-sdk/*')`. No `fetch`. No `Date.now()` inside the maths — `now` is an explicit parameter so tests are deterministic.
2. **Signature is fixed:** `score(tasks, prefs, now) → tasks[]` where each returned task gains `priorityScore`, `subScores`, `tight`, `dataGap[]`.
3. **Imported, never called over HTTP.** Both Philena's task-write handlers and Zoe's reminder Lambda `require` it. There is exactly one implementation of the ranking.
4. **Unit-tested in isolation** — `backend/tests/scoring.test.js` runs with no AWS mock, no network, in under a second.

```
backend/lib/scoring/
  index.js          score(tasks, prefs, now) — orchestrator
  urgency.js        §7.2a
  stakes.js         §7.2b
  effortPressure.js §7.2c  + availability window calculation
  progressDeficit.js §7.2d
  clashPenalty.js   §7.2e
  availability.js   availableHoursBetween(from, to, prefs) — shared by
                    effortPressure, crash-week detection, and daily plan
  normalise.js      weight normalisation + tie-breaking
```

### 4.5 DynamoDB access layer — `backend/lib/dynamo/`

- One `DynamoDBDocumentClient` instance, module-scoped so it is reused across warm invocations.
- Helper functions named after intent, not after DynamoDB verbs: `getTasksInWindow(userId, from, to)`, `putTask(task)`, `patchTask(userId, taskId, changes, expectedUpdatedAt)`.
- **Every function takes `userId` as its first parameter and builds `PK = USER#${userId}` internally.** No caller ever constructs a partition key by hand. This is what makes cross-account access structurally impossible rather than merely unlikely.
- Retries: 3 attempts with exponential backoff (100 ms, 400 ms, 1600 ms) on `ProvisionedThroughputExceededException` and `ThrottlingException`.

### 4.6 AI client — `backend/lib/ai/`

```
backend/lib/ai/
  client.js       chat(messages, {maxTokens, timeoutMs}) → string | throws AiUnavailable
  prompts/
    parse.js      UC-005 — prompt builder + response schema
    extract.js    UC-006
    narrate.js    UC-010
    milestones.js UC-012
  validate.js     strict JSON extraction (strips ``` fences), schema check,
                  numeral-provenance check for narration
```

`client.chat()` enforces a **6-second timeout** and throws `AiUnavailable` on timeout, 429, 5xx, or malformed response after one re-parse attempt. **Every caller catches `AiUnavailable` and runs its deterministic fallback.** A caller that does not catch it is a bug.

### 4.7 Notification layer — `backend/lib/notify/`

A single function, `send({ userId, channel, subject, body })`, which switches on environment:

```
if (SNS_TOPIC_ARN)      → SNS Publish
else if (SMTP_HOST)     → Nodemailer
always                  → write NOTIF# item to DynamoDB (in-app)
```

**No use case ever imports the SNS SDK or Nodemailer directly.** Zoe decides the delivery path at hour zero; every other member calls `notify.send()` and is unaffected by the decision.

---

## 5. Data model

### 5.1 Why single-table DynamoDB

Every hot query in this system is a variation of *"give me one student's items, optionally filtered by deadline, in deadline order."* That is precisely the query shape DynamoDB partition + sort keys are designed for. A relational schema would need joins across `tasks`, `milestones`, `modules` and `prefs` for a single dashboard render; the single-table design answers it in **one or two `Query` calls**.

Concretely: rendering the dashboard requires one `Query` on the main table (`PK = USER#uid`) which returns the profile, prefs, all modules, all tasks and all milestones in a single round trip. There is no N+1 problem because there is no N+1.

### 5.2 Table definition

**Table name:** `deadlineiq` · **Billing:** on-demand (PAY_PER_REQUEST) · **PITR:** disabled (hackathon scope) · **TTL:** not used.

| Attribute | Type | Role |
| --- | --- | --- |
| `PK` | String | Partition key — always `USER#<userId>` |
| `SK` | String | Sort key — entity-type discriminator + identifier |
| `GSI1PK` | String | GSI1 partition key — `USER#<userId>` (tasks only) |
| `GSI1SK` | String | GSI1 sort key — `DUE#<ISO8601 dueAt>` (tasks only) |

**GSI1 (`deadline-index`):** projection `ALL`. Only `TASK#` items carry `GSI1PK`/`GSI1SK`, so the index is *sparse* — it contains exactly the tasks and nothing else. This is deliberate: it means a `Query` on GSI1 never has to filter out milestones, modules, or preferences.

### 5.3 Item catalogue

#### 5.3.1 `PROFILE`

```
PK   USER#<userId>
SK   PROFILE
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `userId` | uuid v4 | ✓ | Generated server-side at registration |
| `email` | string | ✓ | Lowercased, trimmed. Uniqueness enforced by a separate `EMAIL#<email>` item written with `attribute_not_exists(PK)` |
| `displayName` | string | ✓ | 1–60 chars |
| `passwordHash` | string | ✓ | bcrypt, cost 10. **Never returned by any endpoint** |
| `tz` | IANA string | ✓ | Default `Asia/Singapore` |
| `createdAt` | ISO8601 | ✓ | |
| `feedToken` | string \| null | | UC-023 subscription feed; revocable |

#### 5.3.2 `PREFS`

```
PK   USER#<userId>
SK   PREFS
```

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `availability` | `{mon..sun: number}` | `{mon:3,tue:3,wed:3,thu:3,fri:3,sat:5,sun:5}` | Study hours per weekday |
| `blockedDates` | `string[]` (ISO dates) | `[]` | Zero-availability days (work shifts, CCA) |
| `weights` | `{urgency,stakes,effortPressure,progressDeficit,clashPenalty}` | `{0.30,0.25,0.20,0.15,0.10}` | Normalised to sum 1.0 on write |
| `digestAt` | `HH:mm` | `08:00` | In the student's `tz` |
| `quietHours` | `{start,end}` | `{22:00, 07:00}` | Messages queued, released after |
| `dailyCap` | int 1–5 | `3` | Hard notification cap per day |
| `channels` | `{email:bool, inApp:bool}` | `{true, true}` | `inApp` cannot be disabled (UC-020 Alt A) |
| `leadTimes` | `{test,project,assignment,presentation}` days | `{7,5,3,3}` | Per-type reminder lead |
| `escalationEnabled` | bool | `true` | Behind-pace alerts |

#### 5.3.3 `MODULE#<code>`

```
PK   USER#<userId>
SK   MODULE#<moduleCode>          e.g. MODULE#IT2214
```

| Field | Type | Notes |
| --- | --- | --- |
| `code` | string | Uppercased, 4–10 chars. Duplicate → UC-004 E1 |
| `name` | string | e.g. "Database Systems" |
| `colour` | hex string | Auto-assigned from a fixed accessible palette; reused in every view |
| `totalWeight` | number | Default 100. Over-allocation → amber badge, never a block |

#### 5.3.4 `TASK#<taskId>` — the core entity

```
PK      USER#<userId>
SK      TASK#<taskId>
GSI1PK  USER#<userId>
GSI1SK  DUE#<ISO8601 dueAt>
```

| Field | Type | Req | Default | Validation | Notes |
| --- | --- | --- | --- | --- | --- |
| `taskId` | uuid v4 | ✓ | generated | — | |
| `userId` | uuid | ✓ | from authoriser | — | Denormalised for convenience |
| `title` | string | ✓ | — | 1–200 chars, non-empty | |
| `module` | string | | `null` | must match an existing `MODULE#` or create inline | UC-002 Alt C |
| `type` | enum | ✓ | — | `assignment\|test\|project\|presentation` | Drives smart defaults |
| `dueAt` | ISO8601 UTC | ✓ | — | valid date; past → UC-002 Alt A | Mirrored into `GSI1SK` |
| `gradeWeight` | number | | module average | 0–100 | → Stakes |
| `effortHours` | number | | by type (§5.5) | > 0, ≤ 200 | → EffortPressure |
| `hoursSpent` | number | | 0 | ≥ 0 | → estimation accuracy |
| `progressPct` | int | | 0 | 0–100, clamped | → ProgressDeficit |
| `isGroup` | bool | | false | — | Focus Mode skip when blocked |
| `blockedOnTeammate` | bool | | false | — | UC-011 Alt B |
| `prepDays` | int | | by type (§5.5) | 0–30 | **Shifts effective deadline earlier** |
| `status` | enum | ✓ | `active` | `active\|completed\|overdue\|archived\|deleted` | §5.6 |
| `notes` | string | | `""` | ≤ 2000 chars | |
| `priorityScore` | number \| null | | null | 0–100 | Persisted, not computed at render |
| `subScores` | object | | null | 5 numbers 0–100 | **Persisted — powers UC-010 and UC-015** |
| `tight` | bool | | false | — | EffortPressure ratio > 1.0 |
| `dataGap` | string[] | | `[]` | — | Missing fields degrading the score |
| `explanation` | string \| null | | null | ≤ 30 words | UC-010 output |
| `explanationHash` | string \| null | | null | — | Hash of `subScores` the explanation was generated from |
| `explanationStale` | bool | | true | — | Set when score moves > 5 points |
| `s3Key` | string \| null | | null | — | UC-006 source document |
| `source` | enum | ✓ | `form` | `form\|nl\|brief\|paste` | Provenance, shown in task detail |
| `createdAt` | ISO8601 | ✓ | now | — | **ProgressDeficit denominator** |
| `updatedAt` | ISO8601 | ✓ | now | — | Optimistic-concurrency token (UC-003 E2) |
| `completedAt` | ISO8601 \| null | | null | — | |
| `lateSubmission` | bool | | false | — | UC-021 (a) |
| `overdueSince` | ISO8601 \| null | | null | — | |
| `history` | array | | `[]` | — | `{at, field, from, to}` — capped at 50 entries |

#### 5.3.5 `MILESTONE#<taskId>#<milestoneId>`

```
PK   USER#<userId>
SK   MILESTONE#<taskId>#<milestoneId>
```

| Field | Type | Notes |
| --- | --- | --- |
| `milestoneId` | uuid | |
| `taskId` | uuid | Parent |
| `name` | string | e.g. "Draft literature review" |
| `hours` | number | Sum across siblings **must equal** parent `effortHours` (rescaled if not — UC-012 E2) |
| `dueAt` | ISO8601 | Constrained: ≥ 1 full day before parent deadline; never on a blocked day (UC-012 step 4) |
| `order` | int | Display order |
| `completedAt` | ISO8601 \| null | Ticking drives parent `progressPct` |

The `SK` prefix `MILESTONE#<taskId>#` means all milestones for one task are retrievable with a single `begins_with` query, and all milestones for a user are retrievable with `begins_with MILESTONE#`.

#### 5.3.6 `NOTIF#<date>#<taskId>#<rule>`

```
PK   USER#<userId>
SK   NOTIF#2026-08-24#<taskId>#same_day_nudge
```

| Field | Type | Notes |
| --- | --- | --- |
| `rule` | enum | `digest\|same_day_nudge\|escalation\|crash_week\|overdue_group\|lead_time` |
| `channel` | enum | `email\|in_app` |
| `subject`, `body` | string | Rendered content |
| `deliveredAt` | ISO8601 \| null | |
| `delivered` | bool | `false` when SNS failed but in-app succeeded (UC-019 E1) |
| `readAt` | ISO8601 \| null | |

**The composite SK is the idempotency key.** Writes use `ConditionExpression: attribute_not_exists(SK)`. EventBridge is at-least-once; duplicate reminders are therefore impossible by construction, not by luck (UC-019 E3).

#### 5.3.7 `CURSOR` (background job bookmark)

```
PK   SYSTEM#reminders
SK   CURSOR#<job>            job ∈ {recompute, digest}
```

Holds `lastUserId` and `startedAt` so a timed-out batch resumes rather than restarts (UC-019 E2).

#### 5.3.8 `EMAIL#<email>` (uniqueness guard)

```
PK   EMAIL#<lowercased email>
SK   EMAIL
```

Written with `attribute_not_exists(PK)` inside a `TransactWriteItems` alongside the `PROFILE` item, giving atomic email uniqueness without a GSI.

### 5.4 Access patterns → index resolution

**Every pattern resolves to a `Query`. There is no `Scan` in this system.**

| # | Access pattern | Index | Key condition | UC |
| --- | --- | --- | --- | --- |
| 1 | Load everything for one student (dashboard cold render) | Main | `PK = USER#uid` | UC-016 |
| 2 | Active tasks in a deadline window, in order | GSI1 | `GSI1PK = USER#uid AND GSI1SK BETWEEN DUE#<from> AND DUE#<to>` | UC-009, UC-019 |
| 3 | One task + its milestones | Main | `PK = USER#uid AND SK BETWEEN TASK#tid AND MILESTONE#tid#~` (two queries, or one with `begins_with` per prefix) | UC-003 |
| 4 | All milestones for a user (timeline, daily plan) | Main | `PK = USER#uid AND begins_with(SK, 'MILESTONE#')` | UC-014, UC-017 |
| 5 | Prefs + modules for scoring | Main | `PK = USER#uid AND SK IN (PREFS) / begins_with(SK,'MODULE#')` | UC-009 |
| 6 | Notifications sent today (cap enforcement) | Main | `PK = USER#uid AND begins_with(SK, 'NOTIF#<today>')` | UC-019 |
| 7 | Completed tasks | Main | `PK = USER#uid AND begins_with(SK,'TASK#')` + filter `status = completed` | UC-022 |
| 8 | Email uniqueness check | Main | `GetItem PK = EMAIL#<email>` | UC-001 |

> **Pattern 7 note:** this filters after the query rather than using an index, which is acceptable because a student's total task count is in the tens, not thousands. If it ever mattered, the fix is a `GSI2` on `STATUS#<status>#<completedAt>` — noted, not built.

### 5.5 Smart defaults by task type (UC-002 step 3)

| Type | `effortHours` | `prepDays` | Reminder lead time | Rationale |
| --- | --- | --- | --- | --- |
| `assignment` | 8 | 0 | 3 days | Continuous work, no prep phase |
| `test` | 6 | **3** | 7 days | Revision must start days before; `prepDays` shifts the effective deadline |
| `project` | 15 | 0 | 5 days | Large, benefits from milestone breakdown |
| `presentation` | 5 | **1** | 3 days | Needs a rehearsal day |

`gradeWeight` defaults to the module's average unassigned weight. `dueAt` time defaults to **23:59**. Every default is visibly labelled *"suggested"* and editable — the UI must never present a guess as a fact.

### 5.6 Task status lifecycle

```
                         ┌────────────────────────────────┐
                         │                                │
   create ──► active ────┼──► completed  (progressPct=100 │ or UC-021a)
                │        │        │                       │
                │        │        └──► (terminal, but editable) 
                │        │
                │        └──► overdue   (dueAt passed, progress < 100)
                │                 │
                │                 ├──► completed  (UC-021a, lateSubmission=true)
                │                 ├──► active     (UC-021b reschedule, new dueAt)
                │                 └──► archived   (UC-021c, or auto after 30 days)
                │
                ├──► archived  (UC-003 Alt B — no longer relevant)
                │                 └──► excluded from ranking AND capacity maths
                │
                └──► deleted   (UC-003 soft delete)
                                  └──► active  (undo within 10 s)
```

**Capacity semantics — get this right, it affects the heatmap:**

| Status | In ranking? | In capacity/heatmap? | Visible where |
| --- | --- | --- | --- |
| `active` | ✓ | ✓ | Everywhere |
| `overdue` | ✓ (Urgency pinned 100, top of list) | ✗ (excluded from daily plan hours) | Everywhere, red, pinned |
| `completed` | ✗ | ✗ | Completed view |
| `archived` | ✗ | ✗ | Completed/archived view only |
| `deleted` | ✗ | ✗ | Nowhere (recoverable from archive) |

Nothing is ever hard-deleted during the hackathon.

---

## 6. API contract

**Base URL:** `<API Gateway invoke URL>` · **Auth:** `Authorization: Bearer <jwt>` on everything except `/api/auth/register`, `/api/auth/login`, and `/api/feed/{token}.ics`.

### 6.1 Conventions — non-negotiable

1. **Success responses return the affected resource**, not `{ ok: true }`. A create returns the created task *with its computed score*. Callers should never need a follow-up GET.
2. **Error responses are always** `{ "code": "<snake_case>", "message": "<human-readable>" }`. The `code` is for the frontend to branch on; `message` is safe to display verbatim to a student.
3. **`userId` is never accepted from the client.** It comes from `event.requestContext.authorizer.userId`. Any handler reading `body.userId` fails review.
4. **Timestamps are ISO-8601 UTC with `Z`** on the wire, always. Timezone conversion happens at the display layer and inside timezone-sensitive scheduling logic (§10.2).
5. **`PATCH` sends only changed fields.** Handlers build a DynamoDB `UpdateExpression`; they never `PutItem` a whole task over an existing one.
6. **Ranked collections carry the ranking metadata** — `priorityScore`, `subScores`, `tight`, `explanation` — inline. The client never recomputes sub-scores.

### 6.2 Endpoint reference

#### Auth — Philena — UC-001

| Method | Path | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | `{email, password, displayName, tz?}` | `201 {token, user}` | `409 email_exists`, `400 validation_failed`, `503 storage_unavailable` |
| POST | `/api/auth/login` | `{email, password}` | `200 {token, user}` | `401 invalid_credentials` (generic — never reveals whether the email exists) |
| POST | `/api/auth/refresh` | — | `200 {token}` | `401 token_expired` |
| GET | `/api/users/me` | — | `200 {user, prefs}` | `401 unauthorised` |

#### Tasks — Philena — UC-002, UC-003

| Method | Path | Body / Query | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/tasks` | `?status=&module=&type=&from=&to=&sort=priority\|deadline` | `200 {tasks[], meta:{count, generatedAt}}` | `401` |
| POST | `/api/tasks` | Task fields (§5.3.4) | `201 {task}` — **includes `priorityScore` + `subScores`** | `400 validation_failed`, `409 duplicate_suspected` (soft, includes `existing`), `503` |
| GET | `/api/tasks/{taskId}` | — | `200 {task, milestones[]}` | `404 not_found` |
| PATCH | `/api/tasks/{taskId}` | Changed fields + `expectedUpdatedAt` | `200 {task, ranking[]}` — ranking returned because a deadline change alters *other* tasks' ClashPenalty | `409 stale_write`, `400`, `404` |
| DELETE | `/api/tasks/{taskId}` | — | `200 {task}` (status `deleted`) | `404` |
| POST | `/api/tasks/{taskId}/restore` | — | `200 {task}` | `404`, `410 undo_window_expired` |

> **Why `PATCH` returns a full `ranking[]`:** UC-003 step 5 requires a whole-set rescore because changing one deadline changes the ClashPenalty of every task within ±72 h. Returning only the edited task would leave the client's list wrong.

#### Modules & preferences — Philena — UC-004

| Method | Path | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/modules` | — | `200 {modules[]}` | `401` |
| POST | `/api/modules` | `{code, name, colour?, totalWeight?}` | `201 {module}` | `409 module_exists` |
| PATCH | `/api/modules/{code}` | changed fields | `200 {module}` | `404` |
| GET | `/api/prefs` | — | `200 {prefs}` | `401` |
| PUT | `/api/prefs` | Full prefs object | `200 {prefs, ranking[]}` — availability change rescores | `400` |

#### Smart capture — Mahdiya — UC-005, UC-006, UC-007

| Method | Path | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| POST | `/api/parse` | `{text}` | `200 {fields:{...}, confidence:{...}, sources:{...}, degraded:bool}` | `422 unparseable` (with worked example in `message`) |
| POST | `/api/parse/bulk` | `{text}` | `200 {rows[], unparsed[], truncated:bool}` | `422` |
| POST | `/api/briefs/presign` | `{filename, contentType, sizeBytes}` | `200 {uploadUrl, s3Key, expiresIn}` | `400 file_too_large`, `400 unsupported_type` |
| POST | `/api/briefs/extract` | `{s3Key, extractedText}` | `200 {fields, sources, deliverables[], degraded:bool}` | `422 no_text_found`, `504 extract_timeout` (returns partial + `degraded:true`) |

**`confidence` contract:** every extracted field carries a `0.0–1.0` confidence. The frontend renders anything `< 0.7` amber with its `sources[field]` snippet shown beneath. Anything `< 0.5` is **never auto-accepted** (UC-005 E2). **No task is created by these endpoints** — they return proposals; creation always goes through `POST /api/tasks` after explicit confirmation.

#### Progress — Mahdiya — UC-008

| Method | Path | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| POST | `/api/tasks/{taskId}/progress` | `{progressPct?, hoursLogged?, milestoneIds?[]}` | `200 {task, ranking[], estimateHint?}` | `400 progress_out_of_range`, `404` |

`estimateHint` appears when `hoursSpent > effortHours` and `progressPct < 100` — prompting the UC-008 Alt A "this is taking longer than estimated" flow.

#### Intelligence — Hasini — UC-009 to UC-015, UC-018

| Method | Path | Body / Query | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/ranking` | `?limit=` | `200 {ranking[], computedAt, weights}` | `503 scoring_unavailable` (client falls back to deadline sort with a banner) |
| POST | `/api/explain` | `{taskIds[]}` | `200 {explanations:{taskId: {text, source:'ai'\|'template'}}}` | never fails — falls back to template |
| GET | `/api/focus` | — | `200 {card:{task, milestone?, explanation, subScores}, alternatives[]}` | `200` with `emptyState` when nothing is due |
| POST | `/api/tasks/{taskId}/milestones/generate` | — | `200 {proposed[], source:'ai'\|'template'}` — **proposal only, nothing written** | `422 task_too_small` (< 3 h, UC-012 Alt B) |
| PUT | `/api/tasks/{taskId}/milestones` | `{milestones[]}` | `201 {milestones[]}` — all-or-nothing `TransactWriteItems` | `400 hours_mismatch`, `503` |
| PATCH | `/api/tasks/{taskId}/milestones/{id}` | `{completedAt?}` etc. | `200 {milestone, task, ranking[]}` | `404` |
| GET | `/api/workload/heatmap` | `?weeks=12` | `200 {weeks[{weekStart, requiredHours, availableHours, loadRatio, crash:bool, overloadHours, tasks[]}]}` | `401` |
| GET | `/api/workload/crash-weeks` | — | `200 {crashWeeks[{weekStart, overloadHours, recommendation}]}` | `401` |
| POST | `/api/workload/crash-weeks/{weekStart}/apply` | — | `200 {milestonesUpdated[], heatmap}` | `422 no_valid_move` |
| POST | `/api/workload/crash-weeks/{weekStart}/dismiss` | — | `204` | — |
| GET | `/api/plan/today` | — | `200 {blocks[{taskId, milestoneId?, hours, rationale}], spareHours, overdueStrip[]}` | `401` |
| PUT | `/api/prefs/weights` | `{weights}` | `200 {weights, ranking[]}` — auto-normalised to sum 1.0 | `400` |

> **`POST /api/explain` never returns an error.** If the model is unavailable it returns template sentences with `source: 'template'`. The UI is byte-identical either way. This is the single clearest expression of the thesis in the API surface.

#### Views — Zoe — UC-016, UC-017, UC-022

| Method | Path | Query | Success |
| --- | --- | --- | --- |
| GET | `/api/dashboard` | — | `200 {nextUp, thisWeek:{required, available, ratio}, counts:{dueIn7, overdue, completedThisWeek}, alerts[], ranking[]}` |
| GET | `/api/calendar` | `?from=&to=&view=week\|month\|timeline` | `200 {entries[], spans[]}` |
| GET | `/api/completed` | `?from=&to=` | `200 {weeks[], stats:{onTimeRate, estimationAccuracy, sampleSize, perModule[]}}` |

`estimationAccuracy` is `null` with `sampleSize < 3` (UC-022 Alt A) — the API must not return a misleading figure derived from one data point.

#### Notifications — Zoe — UC-019, UC-020, UC-021, UC-023

| Method | Path | Auth | Body | Success |
| --- | --- | --- | --- | --- |
| POST | `/api/reminders/run` | `Bearer <CRON_SECRET>` | `{job:'recompute'\|'digest', userId?}` | `200 {processed, sent, skipped, cursor}` |
| POST | `/api/reminders/test` | JWT | — | `200 {delivered, channel}` / `502 delivery_failed` with the specific reason |
| GET | `/api/notifications` | JWT | — | `200 {notifications[]}` |
| POST | `/api/notifications/{id}/read` | JWT | — | `204` |
| PUT | `/api/prefs/notifications` | JWT | prefs subset | `200 {prefs, warnings[]}` — e.g. digest inside quiet hours (UC-020 Alt B) |
| POST | `/api/tasks/{taskId}/resolve` | JWT | `{action:'complete'\|'reschedule'\|'archive', newDueAt?}` | `200 {task, ranking[]}` |
| GET | `/api/export/ics` | JWT | `?scope=all\|module\|range&includeMilestones=` | `200` `text/calendar` |
| POST | `/api/export/feed-token` | JWT | `{revoke?:bool}` | `200 {feedUrl}` |
| GET | `/api/feed/{token}.ics` | **public, tokenised** | — | `200` `text/calendar` |

### 6.3 Error code catalogue

The frontend branches on `code`; keep this list closed. Adding a code is a doc change too.

| Code | HTTP | Meaning | Frontend behaviour |
| --- | --- | --- | --- |
| `validation_failed` | 400 | Field failed schema | Highlight field, focus first offender, no write |
| `progress_out_of_range` | 400 | progressPct outside 0–100 | Clamp slider |
| `hours_mismatch` | 400 | Milestone hours ≠ effortHours | Rescale and retry |
| `file_too_large` | 400 | > 5 MB | Reject client-side before reaching this |
| `unsupported_type` | 400 | Not PDF/DOCX/image | Reject client-side |
| `invalid_credentials` | 401 | Login failed | Generic message — no enumeration |
| `unauthorised` | 401 | Missing/invalid token | Redirect to login, preserve form in sessionStorage |
| `token_expired` | 401 | JWT past expiry | Attempt silent refresh first |
| `not_found` | 404 | Item absent **or** belongs to another user | Identical response either way — existence is not leaked |
| `email_exists` | 409 | Registration collision | Offer sign-in link |
| `module_exists` | 409 | Duplicate module code | Offer to open the existing one |
| `stale_write` | 409 | `expectedUpdatedAt` mismatch | "Changed in another tab — reload" |
| `duplicate_suspected` | 409 | Soft warning only | Show "Create anyway" / "Open existing" — **never blocks** |
| `undo_window_expired` | 410 | Restore after 10 s | Link to archive view |
| `unparseable` | 422 | No task found in text | Show worked example |
| `no_text_found` | 422 | Document yielded no text | Open prefilled form with filename as title |
| `task_too_small` | 422 | < 3 h, breakdown declined | "Small enough for one session" |
| `no_valid_move` | 422 | No capacity anywhere to redistribute | Honest message; suggest scope reduction |
| `scoring_unavailable` | 503 | Scoring engine failed | Deadline-order fallback + banner + retry |
| `storage_unavailable` | 503 | DynamoDB exhausted retries | Retain form, offer retry |
| `delivery_failed` | 502 | SNS/SMTP failed | Show the specific reason — this button exists to diagnose |
| `extract_timeout` | 504 | Model exceeded Lambda timeout | Partial result, `degraded: true`, amber fields |

---

## 7. The prioritisation algorithm

> **This section is the product.** UC-009 in `DeadlineIQ_Use_Cases.md` is the authoritative spec; this section adds the reasoning and a worked example. Every team member must be able to explain it in 45 seconds without notes.

### 7.1 Design principles

1. **Deterministic.** Same inputs → same output, byte for byte. No randomness, no model, no learned weights. A judge can verify the arithmetic by hand.
2. **Normalised.** Every sub-score is `0–100` regardless of its input units, so the weighted sum is meaningful and the contribution bar is honestly proportional.
3. **Decomposable.** The five sub-scores are persisted alongside the total. The explanation (UC-010) and the interactive weight sliders (UC-015) both read them; neither recomputes.
4. **Degrades in quality, never in availability.** Missing `gradeWeight` or `effortHours` substitutes a neutral `50` and records a `dataGap` flag. A task with incomplete data still ranks — it just ranks less precisely, and the UI says so.

### 7.2 The five sub-scores

#### (a) Urgency — *how close is the point at which I must start?*

```
effectiveDays = daysUntil(dueAt) − prepDays
Urgency       = 100 × e^(−0.25 × max(effectiveDays, 0))
overdue       → Urgency = 100 (pinned)
```

**Why exponential decay rather than linear?** Because student stress isn't linear. The difference between 14 days and 13 days away is negligible; the difference between 2 days and 1 day is enormous. The `e^(−0.25d)` curve captures that: it stays flat and low for weeks out, then rises steeply inside the final few days.

| Effective days | Urgency |
| --- | --- |
| 0 (today) | 100.0 |
| 1 | 77.9 |
| 2 | 60.7 |
| 3 | 47.2 |
| 5 | 28.7 |
| 7 | 17.4 |
| 14 | 3.0 |
| 21 | 0.5 |

**Why `prepDays` matters more than any other single line in this system:** a test 5 days away that needs 3 days of revision scores as though it were **2 days away** — because it is. Work must begin now. Every competing team sorting by nearest deadline will place that test fifth. This one subtraction is the clearest demonstration that DeadlineIQ models *academic* work rather than generic tasks.

#### (b) Stakes — *how much of my grade is at risk?*

```
Stakes = min(100, gradeWeight × 2.5)
```

Saturates at 40% weighting. Rationale: anything worth 40% or more of a module is already maximally consequential; the difference between 40% and 60% doesn't change the *behaviour* it should drive. A 5% quiz scores 12.5 — present in the ranking, but never able to outrank real work on stakes alone.

#### (c) Effort Pressure — *does the remaining work actually fit in the time left?*

```
remainingHours = effortHours × (1 − progressPct / 100)
availableHours = Σ daily availability from PREFS over every day
                 between now and dueAt, minus blocked days
ratio          = remainingHours / max(availableHours, 0.5)
EffortPressure = min(100, ratio × 70)
tight          = (ratio > 1.0)
```

**This is the sub-score judges will remember.** A `ratio > 1.0` means the task is **mathematically impossible** in the time remaining at the student's own stated availability. Not "urgent" — *impossible*. No competing team will have this metric, because it requires modelling the student's capacity, which requires UC-004 to exist.

The `× 70` multiplier means `ratio = 1.0` scores 70, not 100 — leaving headroom so that a task at 1.4× ratio still outscores one at exactly 1.0×. The `max(availableHours, 0.5)` floor prevents division by zero and correctly drives EffortPressure to 100 when a student has blocked out the entire window (UC-009 Alt B).

#### (d) Progress Deficit — *am I behind the pace I should be at?*

```
expected        = 100 × (now − createdAt) / (dueAt − createdAt)
ProgressDeficit = max(0, expected − progressPct)
```

Linear expectation across the task's own lifetime. Being 60% through the available window with 10% done scores 50. Being *ahead* of pace scores 0 — the formula never penalises good behaviour, and never awards negative pressure.

This is the sub-score that makes reminders *adaptive* (UC-019 rule c): escalation fires on `ProgressDeficit > 40 AND deadline within 48 h`, which is a statement about the student's actual state rather than merely about the clock.

#### (e) Clash Penalty — *is this part of a pile-up?*

```
n            = count of OTHER active tasks with dueAt within ±72 hours
ClashPenalty = min(100, n × 30)
```

Saturates at 4 clashing tasks. Directly addresses the brief's "whether multiple deadlines are concentrated in the same week." Weighted lowest (0.10) because a clash is a property of the *situation*, not of the task — it should nudge the ordering within a cluster, not dominate it.

### 7.3 Combination

```
Priority = w_u·Urgency
         + w_s·Stakes
         + w_e·EffortPressure
         + w_p·ProgressDeficit
         + w_c·ClashPenalty

Defaults: w_u=0.30, w_s=0.25, w_e=0.20, w_p=0.15, w_c=0.10
```

Weights are **per student**, stored in `PREFS`, and normalised to sum exactly 1.0 on every write (UC-009 E3 handles corrupted values by re-normalising and logging a CloudWatch warning).

**Tie-breaking, in order:** higher `priorityScore` → earlier `dueAt` → higher `gradeWeight` → `taskId` ascending (so the order is stable across renders, which matters for the reorder animation).

**Why these defaults?** Urgency highest because deadlines genuinely dominate student decision-making; Stakes close behind because grade impact is the reason deadlines matter at all; EffortPressure third because it is the most *informative* signal but depends on a self-reported estimate; ProgressDeficit fourth as a behavioural correction; ClashPenalty lowest as a situational tiebreaker. UC-015 lets any student disagree with all of that in ten seconds.

### 7.4 Worked example — reproduce this on a whiteboard

**Task:** IT2214 Database Report
`gradeWeight = 40` · `effortHours = 12` · `progressPct = 15` · `prepDays = 0`
`createdAt = 7 days ago` · `dueAt = 3 days from now`
Student availability over those 3 days: **6 hours total**
Other active tasks due within ±72 h: **2**

| Sub-score | Calculation | Value | × weight | Contribution |
| --- | --- | --- | --- | --- |
| Urgency | `100 × e^(−0.25 × 3)` | **47.2** | 0.30 | **14.2** |
| Stakes | `min(100, 40 × 2.5)` | **100.0** | 0.25 | **25.0** |
| Effort Pressure | `remaining = 12 × 0.85 = 10.2 h`; `ratio = 10.2 / 6 = 1.70`; `min(100, 1.70 × 70) = 119 → 100` | **100.0** ⚠ `tight` | 0.20 | **20.0** |
| Progress Deficit | `expected = 100 × 7/10 = 70`; `70 − 15` | **55.0** | 0.15 | **8.3** |
| Clash Penalty | `min(100, 2 × 30)` | **60.0** | 0.10 | **6.0** |
| | | | **Priority** | **73.5** |

**Top three contributors:** Stakes (25.0), Effort Pressure (20.0), Urgency (14.2).

UC-010 receives *only these numbers* plus the supporting figures (40%, 10.2 h remaining, 6 h available, 3 days, 2 clashes) and returns:

> *"Top priority: worth 40% of IT2214, 10 hours of work left but only 6 free hours before Friday, and two other deadlines the same week."*

Every figure in that sentence appears in the payload. The validator (§8.4) rejects any sentence containing a numeral that doesn't. **The model wrote the prose; the arithmetic wrote the ranking.**

### 7.5 Invocation triggers

Scoring runs on:

| Trigger | Scope | Path |
| --- | --- | --- |
| Task create | Full active set (new task changes others' ClashPenalty) | Synchronous, in the write handler |
| Task edit (`dueAt`, `effortHours`, `gradeWeight`, `prepDays`, `progressPct`) | Full active set | Synchronous |
| Progress update | Full active set | Synchronous |
| Availability change (UC-004) | Full active set | Synchronous |
| Weight change (UC-015) | **Client-side only** from persisted sub-scores; server rescore on save | Local, then async |
| Hourly EventBridge | All users, paginated | Background (Class D) |

**Scoring failure never blocks a write.** The task is saved with `priorityScore = null` and a "score pending" badge; the next scheduled recompute fills it in (UC-002 E4, UC-003 E4).

---

## 8. The AI layer and its contracts

### 8.1 Where AI is used — and where it is forbidden

| Feature | UC | AI role | Deterministic fallback |
| --- | --- | --- | --- |
| Natural-language task entry | UC-005 | Extract structured fields from free text | `chrono-node` (date) + regex (module, %, hours) |
| Brief extraction | UC-006 | Extract fields + source snippets from document text | Regex extraction → prefilled form with filename as title |
| Priority explanation | UC-010 | **Narrate numbers already computed** | Template sentence from the same numbers |
| Milestone breakdown | UC-012 | Propose 3–6 named steps with hours | Template by task type |

**Forbidden, permanently:**
- AI must not compute, adjust, or reorder `priorityScore`.
- AI must not write to DynamoDB. Every AI output is a *proposal* rendered for confirmation.
- AI must not receive task titles or notes on the UC-010 narration path — only numbers. This is what makes "it cannot re-rank" a structural guarantee rather than a promise.

### 8.2 Provider and model

**OpenRouter**, free-tier chat model, configured via `AI_MODEL`. Justified explicitly by the participant update relaxing the bonus criteria: *"You are therefore not required to use Amazon Bedrock… You may use other AI models, APIs, or platforms where appropriate."*

Bedrock is not used because it is typically unavailable in the AWS Academy Learner Lab. The AI client is a thin wrapper (`lib/ai/client.js`) — swapping to Bedrock, if a Learner Lab happens to allow it, is a one-file change.

### 8.3 Prompt contracts

Every prompt shares four rules: **strict JSON only**, no prose, no markdown fences, no fields outside the schema.

#### UC-005 — quick parse

*Input:* raw text · current date and timezone (`Asia/Singapore`) · the student's existing module codes.
*Output:*
```json
{
  "title":        {"value": "Database report", "confidence": 0.92},
  "module":       {"value": "IT2214",          "confidence": 0.88},
  "type":         {"value": "assignment",      "confidence": 0.75},
  "dueAt":        {"value": "2026-08-22T23:59:00+08:00", "confidence": 0.95,
                   "source": "next friday 11:59pm"},
  "gradeWeight":  {"value": 30,                "confidence": 0.90},
  "effortHours":  {"value": 9,                 "confidence": 0.85},
  "isGroup":      {"value": false,             "confidence": 0.50}
}
```
Supplying the current date is essential — without it, "next Friday" is unresolvable and the model will hallucinate a plausible-looking wrong date, which is worse than failing.

#### UC-006 — brief extraction

*Input:* extracted document text (first ~2 pages, where deadlines almost always appear), truncated to the token budget.
*Output:* same field shape, plus `deliverables[]` and a mandatory **verbatim `source` snippet per field**. The review screen renders extracted value on the left, source snippet on the right (UC-006 step 6) — so verification is a two-second visual comparison, not an act of faith.

#### UC-010 — narration (the constrained one)

*Input — numbers only:*
```json
{
  "rank": 1,
  "topContributors": [
    {"label": "Stakes",          "value": 100, "weighted": 25.0},
    {"label": "Effort Pressure", "value": 100, "weighted": 20.0},
    {"label": "Urgency",         "value": 47,  "weighted": 14.2}
  ],
  "figures": {
    "gradeWeight": 40, "module": "IT2214", "remainingHours": 10,
    "availableHours": 6, "daysUntilDue": 3, "clashCount": 2
  }
}
```
*Constraints, enforced in the prompt **and** re-checked in code:* exactly one sentence · maximum 30 words · plain English · must cite the supplied figures · **must not introduce any number not present in the payload** · no hedging, no preamble.

#### UC-012 — milestone generation

*Input:* task title, type, `effortHours`, `dueAt`, today's date, per-day availability, and any `deliverables[]` carried over from UC-006.
*Output:* 3–6 milestones with `name`, `hours`, `dueAt`.

**Two constraints are enforced in code, never in the prompt** (UC-012 step 4) — prompt-only constraints are unreliable:
1. The final milestone completes **at least one full day** before the real deadline.
2. No milestone falls on a zero-availability blocked day; such dates shift to the previous available day.

Hours are rescaled proportionally if the model's allocation doesn't sum to `effortHours` (UC-012 E2). The system never displays an inconsistent total.

### 8.4 Response validation pipeline

```
raw response
   │
   ├─► strip ``` fences, leading prose, trailing commentary
   │
   ├─► JSON.parse  ──── fail ──► one re-parse attempt ── fail ──► AiUnavailable
   │
   ├─► schema check (types, enums, ranges)  ── fail ──► AiUnavailable
   │
   ├─► [UC-010 only] NUMERAL PROVENANCE CHECK:
   │      every numeral in the output string must appear in the input payload
   │                                          ── fail ──► DISCARD, use template
   │
   ├─► [UC-010 only] word count ≤ 30         ── fail ──► DISCARD, use template
   │
   └─► accepted
```

The numeral-provenance check is the mechanism that makes the thesis enforceable. A hallucinated figure inside a priority explanation would destroy the credibility of the entire system — so validation is strict rather than lenient, and a discarded response costs nothing because the template is always ready.

### 8.5 The kill-switch test — mandatory before demo

```bash
# Remove the key from the deployed Lambda environment, then walk the whole demo.
aws lambda update-function-configuration --function-name <fn> --environment "Variables={AI_API_KEY=}"
```

**Every screen must still work:**

| Feature | Without AI |
| --- | --- |
| Quick add | `chrono-node` parses the date, regex finds module/%/hours, more fields amber |
| Brief upload | Regex extraction; if nothing found, prefilled form with the filename |
| Explanations | Template sentences — visually identical UI |
| Milestones | Template breakdown by task type |
| **Everything else** | Unaffected — no other feature touches AI |

A demo that dies on a 429 loses to a duller demo that works. This test is in the Phase 5 checklist and is not optional.

---

## 9. Scheduling and notification pipeline

### 9.1 EventBridge rules

Two rules, **one Lambda**, distinguished by the input payload — so there is one handler to maintain, one log group to watch, and one code path to debug at 3 a.m.

| Rule | Schedule | Payload | Does |
| --- | --- | --- | --- |
| `deadlineiq-hourly-recompute` | `rate(1 hour)` | `{"job":"recompute"}` | Rescore all active tasks (UC-009) · refresh crash-week detection (UC-013) · pre-warm explanations for each user's top 5 (UC-010 Alt B) · dispatch same-day nudges and escalations |
| `deadlineiq-daily-digest` | `cron(0 0 * * ? *)` — 00:00 UTC = **08:00 SGT** | `{"job":"digest"}` | Build each student's daily plan (UC-014) · dispatch the morning digest subject to cap and quiet hours |

**Why the hourly recompute matters conceptually:** Urgency and ProgressDeficit are both functions of *elapsed time*. A task genuinely becomes more urgent overnight while the student sleeps. A purely on-write scoring model would show a stale ranking every morning — exactly when the student most needs an accurate one. This is why scoring lives in a shared library callable from a scheduled Lambda, not inside an HTTP request handler.

### 9.2 Reminder rules, evaluated in order

| # | Rule | Condition | Message shape |
| --- | --- | --- | --- |
| a | **Daily digest** | At the student's `digestAt` | Today's plan (UC-014) + top 3 priorities + anything overdue |
| b | **Same-day nudge** | `dueAt` within 24 h AND `progressPct < 90` | "Assignment due in 24 hours — you're at 60%" |
| c | **Escalation** | `ProgressDeficit > 40` AND `dueAt` within 48 h | "You're 45% behind on a task due in 2 days" |
| d | **Crash-week alert** | UC-013 flags a *newly* overloaded week; max once per week | "Week of 24 Aug is 7 hours over capacity" |
| e | **Lead-time reminder** | `dueAt` crosses the student's per-type lead window (UC-020 step 3: tests 7 d, projects 5 d, assignments and presentations 3 d) AND `progressPct < 90`; fires once, on the crossing | "Time to start IT2213 Networking Test — due in 7 days, 6 hours of work remain" |

Rule (c) is what makes the reminders *adaptive* rather than merely scheduled — it fires on the student's actual state, not on the calendar. Rule (e) is what makes the per-type lead times in UC-020 a *reminder* control rather than only a calendar-alarm one: it is the reason a test starts nudging a week out and a quiz does not. It is evaluated last, so under the daily cap it always yields to a deadline that has already arrived.

### 9.3 Notification budget — the brief asks about this explicitly

> *"How notification overload can be avoided."*

Three mechanisms, all quantified:

1. **Hard cap: 3 notifications per student per day** (configurable 1–5, default 3). Enforced by counting `NOTIF#<today>#*` items before each send.
2. **Overflow absorption:** anything beyond the cap is not dropped — it is folded into the next daily digest. Nothing is silently lost.
3. **Quiet hours (default 22:00–07:00 in the student's timezone):** messages due in that window are queued and released at the next permitted time. If the student's configured digest time falls inside their own quiet hours, the conflict is surfaced and resolved visibly (UC-020 Alt B), never silently dropped.

Plus a fourth, situational: when several tasks go overdue simultaneously, they are grouped into a single "3 tasks are overdue" card rather than three separate alerts — which would also breach the cap (UC-021 Alt A).

**Say the number out loud during judging: three per day, digest absorbs the overflow, quiet hours enforced.**

### 9.4 Reliability mechanics

| Concern | Mechanism |
| --- | --- |
| **At-least-once invocation** | Every notification write is a `PutItem` with `ConditionExpression: attribute_not_exists(SK)` on `NOTIF#<date>#<taskId>#<rule>`. A duplicate invocation writes nothing and sends nothing. |
| **Lambda timeout mid-batch** | Users processed in pages; a `CURSOR#<job>` item records `lastUserId`. The next invocation resumes from the cursor. Partial delivery is logged, never repeated. |
| **SNS publish failure** | One retry after 3 s → then write in-app only with `delivered: false` → surfaced on next login. The student never silently misses a reminder (UC-019 E1). |
| **Scoring failure inside the scheduled run** | Reminders still send using the last persisted scores, flagged internally as stale. Delivery and scoring are decoupled (UC-019 E4). |
| **Notifications disabled** | Scores are still recomputed (so the dashboard is fresh on next open); nothing is sent. Deliberately decoupled (UC-019 Alt A). |
| **Demo on stage** | `POST /api/reminders/run` with `Bearer <CRON_SECRET>` runs either job on demand, so the pipeline is demonstrable live without waiting for the schedule (UC-019 Alt B). |

---

## 10. Cross-cutting concerns

### 10.1 Authentication and authorisation

**Decision: self-managed JWT, not Amazon Cognito.** Cognito is frequently unavailable in the AWS Academy Learner Lab; discovering that at hour 20 would be fatal. `jsonwebtoken` + `bcrypt` with users as `PROFILE` items costs about 80 lines and has zero external dependency.

> If Zoe's hour-zero audit finds Cognito *is* available, revisit this in the team channel before Phase 1 code lands — not after.

**The chain:**

```
Client            → Authorization: Bearer <jwt>
API Gateway       → invokes Lambda authoriser (cached 300 s per token)
Lambda authoriser → jwt.verify(token, JWT_SECRET)
                  → returns IAM Allow policy + context { userId, email }
Handler           → const userId = event.requestContext.authorizer.userId
Dynamo layer      → every call builds PK = USER#${userId} internally
```

**Why cross-account access is structurally impossible, not merely prevented:** no handler ever constructs a partition key. `lib/dynamo` takes `userId` as its first parameter and builds `USER#${userId}` itself. A student guessing another student's `taskId` produces a `Query` scoped to *their own* partition, which returns nothing → `404 not_found`. We return 404 rather than 403 deliberately: a 403 would confirm the item exists (UC-001 E4).

**Token handling:** HS256, 24 h expiry, `sub = userId`. On 401 the frontend attempts one silent refresh; on failure it redirects to sign-in **and preserves any in-progress form data in `sessionStorage`** so nothing typed is lost (UC-001 E3).

### 10.2 Time and timezone — a common source of subtle bugs

| Layer | Representation |
| --- | --- |
| DynamoDB storage | ISO-8601 **UTC** with `Z` |
| API wire format | ISO-8601 **UTC** with `Z` |
| `GSI1SK` | `DUE#<ISO8601 UTC>` — lexicographic sort equals chronological sort |
| Display | Student's `tz` from `PROFILE` (default `Asia/Singapore`) |
| Scheduling logic | Student's `tz` — quiet hours, digest time, "today", "due in 3 days" |

**The rule:** anything a *student perceives* is evaluated in their timezone; anything *stored or sorted* is UTC. A deadline of 23:59 SGT evaluated naively in the Lambda's default UTC would appear to have passed at 16:00 SGT — six hours of false "overdue" states, on stage (UC-021 E3).

The daily EventBridge rule fires once at 00:00 UTC for everyone; per-student `digestAt` is honoured **inside** the handler. One rule covers all timezones.

### 10.3 Failure-mode matrix

The single most useful table in this document when something breaks during the build.

| Failure | Detection | System behaviour | Student sees | UC |
| --- | --- | --- | --- | --- |
| LLM 429 / 5xx / timeout | 6 s timeout in `lib/ai/client` | `AiUnavailable` thrown; caller runs deterministic fallback | Amber fields + "Smart parsing unavailable — please check these details" | UC-005 Alt B |
| LLM returns malformed JSON | Parse fails twice | Fallback | Same as above | UC-005 E1 |
| LLM hallucinates a figure in an explanation | Numeral-provenance check | Response **discarded**, template used | Nothing — UI identical | UC-010 E2 |
| DynamoDB throttling | SDK exception | 3 retries, exponential backoff | On final failure: "Could not save — please try again", form retained | UC-001 E5, UC-002 E3 |
| Concurrent edit (two tabs) | `expectedUpdatedAt` mismatch | Conditional write rejected | "This task changed in another tab — reload" | UC-003 E2 |
| Scoring engine error | Exception in shared lib | Task still saved, `priorityScore = null` | "Score pending" badge; next hourly run fixes it | UC-002 E4 |
| Ranking endpoint slow (> 8 s) | Client timeout | Client renders cached list in deadline order | Banner: "Live prioritisation unavailable — showing deadline order" + retry | UC-016 E1 |
| SNS publish fails | SDK exception | 1 retry after 3 s → in-app only, `delivered: false` | Notification appears on next login | UC-019 E1 |
| Reminder Lambda times out | Duration limit | Cursor persisted; next run resumes | Nothing — invisible | UC-019 E2 |
| Duplicate EventBridge invocation | Conditional write fails | No-op | Nothing — no duplicate email | UC-019 E3 |
| S3 presigned upload fails | HTTP error | 1 retry → offer quick-add bar instead | Toast explaining the upload failed, with an alternative route | UC-006 E4 |
| PDF unreadable (scanned/handwritten) | < 50 chars extracted | Vision path → if that fails, prefilled form | "I couldn't read this document" + form with filename as title | UC-006 E2 |
| Document has no date | Extraction returns no `dueAt` | Title and weight kept | Deadline field empty **and focused** | UC-006 E3 |
| Malformed `dueAt` on a stored item | Scoring validation | Excluded from ranking, flagged `unscoreable` | Pinned to a "needs attention" strip — never silently disappears | UC-009 E1 |
| Chart render failure | Render exception | Fall back to a plain list / bar chart | Information preserved, never a blank panel | UC-017 E2, UC-018 E2 |
| Zero availability for a whole week | `availableHours = 0` | Hatched "unavailable" cell, not a zero or an error | Honest label | UC-018 E1 |
| No capacity anywhere to redistribute | Search exhausts preceding weeks | Card suppressed; honest message | "No spare capacity before this week. Consider reducing scope on your 5% quiz." | UC-013 Alt A |

**The pattern across every row:** degrade the *quality* of the answer, never the *availability* of the app. There is no state in which a student sees a blank screen or a dead end.

### 10.4 Security

| Control | Implementation |
| --- | --- |
| Password storage | `bcrypt`, cost factor 10 |
| Account enumeration | Login returns one generic message for both wrong-email and wrong-password |
| Item-level isolation | Partition-scoped queries only; `404` not `403` on foreign items |
| Transport | HTTPS everywhere; API Gateway and Vercel both TLS-only |
| CORS | Allowlist `FRONTEND_URL` exactly. Never `*` |
| Secrets | SAM parameters / Lambda env vars. `.env.example` documents names with **no values**. Nothing sensitive in git — verified before every commit |
| S3 uploads | Presigned PUT, 5-minute expiry, PUT-only, content-length capped at 5 MB, key namespaced by `userId` |
| Cron endpoint | `POST /api/reminders/run` requires `Bearer <CRON_SECRET>` |
| Calendar feed | Tokenised, unguessable, read-only, revocable from settings (UC-023 Alt A) |
| Input validation | Every handler validates against a schema before any write |
| IAM | Learner Lab forces `LabRole`; least-privilege per-function policies are documented in `template.yaml` even though the Lab role is broad — so the design is defensible under questioning |
| Logging | Structured logs contain `userId` but **never** email, password hashes, tokens, or task content |

### 10.5 Cost control — $50 Learner Lab credit

| Service | Configuration | Est. hackathon cost |
| --- | --- | --- |
| DynamoDB | On-demand, no PITR, no global tables | < $1 |
| Lambda | 256 MB, arm64, 10 s timeout | < $1 |
| API Gateway | REST, ~10k requests | < $1 |
| S3 | Standard, 7-day lifecycle expiry | < $0.50 |
| SNS | Email delivery, low volume | < $0.50 |
| EventBridge | 2 rules, ~24 + 1 invocations/day | negligible |
| CloudWatch | Default retention, one dashboard | < $1 |
| **Total** | | **under $5** |

**Forbidden without team agreement:** EC2, RDS, NAT Gateways, provisioned DynamoDB capacity, Fargate, OpenSearch. Any of these can consume the entire credit in a day.

### 10.6 Observability

**Structured log line — every handler, every invocation:**

```json
{ "requestId": "...", "userId": "...", "uc": "UC-009", "action": "score",
  "taskCount": 12, "latencyMs": 47, "outcome": "ok" }
```

`userId` is included for correlation; task content, email addresses and tokens are not.

**CloudWatch dashboard for judging** — four widgets, built in Phase 5:
1. Lambda invocations and errors by function
2. Reminder delivery success rate
3. Hourly-recompute duration (proves the scheduled path actually runs)
4. DynamoDB consumed capacity (proves cost discipline)

Widget 3 is the important one — it is visible proof, in AWS's own console, that the EventBridge → Lambda → DynamoDB → SNS chain executed on a schedule rather than being triggered by hand for the demo.

---

## 11. Sequence flows

### 11.1 Natural-language quick add (UC-005) — the capture story

```
Student types: "db report due next friday 11:59pm, 30% of IT2214, ~9 hours"
   │
   ▼ POST /api/parse { text }
Lambda parse/quick
   │
   ├─ build prompt: raw text + current date/tz (Asia/Singapore) + module codes
   │
   ▼
OpenRouter LLM  ──6 s timeout──►  strict JSON, per-field confidence
   │                                       │
   │                                       └── on 429/timeout/malformed ──┐
   ▼                                                                      │
schema validation, range checks, UC-002 smart defaults fill gaps          │
   │                                                                      ▼
   │                                                    chrono-node (date) +
   │                                                    regex (module, %, hours)
   │                                                            │
   ▼◄───────────────────────────────────────────────────────────┘
CONFIRMATION CARD
   every field editable · confidence < 0.7 amber
   source phrase shown: "'next friday' → 22 Aug 2026, 23:59"
   │
   ▼ Student corrects and clicks "Add task"
POST /api/tasks  (source: 'nl')
   │
   ├─► DynamoDB PutItem  TASK#<uuid>, GSI1SK = DUE#<iso>
   │
   ├─► lib/scoring.score(activeTasks, prefs, now)   ← deterministic, no AI
   │
   ├─► persist priorityScore + subScores on every affected task
   │
   ▼
201 { task, ranking[] }
   │
   ▼
UI inserts the row with a highlight, animates the reorder
```

**The critical property:** the fallback path produces the *same confirmation card*, just with more amber fields. The student's workflow is identical whether the LLM answered or not.

### 11.2 The AWS end-to-end story (UC-019) — rehearse this one

```
  t=0     Student creates a task
             │
             ▼
          Lambda (tasks/create) behind API Gateway
             │
             ▼
          DynamoDB PutItem  →  TASK#… with GSI1SK = DUE#2026-08-22T15:59:00Z
             │
  ─────────────────────────────────────────────────────────────────
  t=+1h   Amazon EventBridge  rate(1 hour)  →  { "job": "recompute" }
             │
             ▼
          reminderLambda
             │
             ├─► Query GSI1: GSI1PK = USER#uid
             │              GSI1SK BETWEEN DUE#now AND DUE#now+14d
             │
             ├─► lib/scoring.score(tasks, prefs, now)
             │      Urgency ↑ because time has passed
             │      ProgressDeficit ↑ because expected pace has advanced
             │
             ├─► persist refreshed subScores
             │
             ├─► pre-warm explanations for top 5  (UC-010 Alt B)
             │
             ├─► apply reminder rules a–d
             │      check NOTIF# count today  <  dailyCap (3)
             │      check not inside quiet hours (student's tz)
             │
             ├─► PutItem NOTIF#<date>#<taskId>#<rule>
             │      ConditionExpression: attribute_not_exists(SK)   ← idempotent
             │
             ├─► Amazon SNS Publish   (or Nodemailer SMTP fallback)
             │
             └─► CloudWatch structured log
                    { uc: "UC-019", sent: 2, skipped: 1, capReached: false }
```

### 11.3 Crash-week detection and redistribution (UC-013 + UC-018)

```
Hourly recompute
   │
   ▼
bucket the next 12 calendar weeks
   │
   ▼ for each week:
      requiredHours  = Σ remainingHours of tasks due that week
                     + Σ hours of milestones dated that week
      availableHours = Σ daily availability that week − blocked days
      loadRatio      = requiredHours / availableHours
   │
   ▼
loadRatio > 1.0  →  CRASH WEEK, overload = required − available
   │
   ▼ deterministic recommendation search:
      1. find the task in that week with the largest remainingHours
         and the earliest possible start date
      2. compute the hours that must move earlier to reach loadRatio ≤ 1.0
      3. check the preceding week has spare capacity
         └─ if not, cascade to the week before that
         └─ if no week has capacity → UC-013 Alt A: say so honestly
   │
   ▼
persist: "Start your IT2214 report 4 days earlier and move 5 hours
          into the week of 17 Aug, which has 6 spare hours."
   │
   ▼ rendered as an amber card on the dashboard AND on the heatmap cell
   │
   ▼ Student clicks Apply
      │
      ├─► shift/create milestone dates (UC-012 write path, constraints re-enforced)
      ├─► rescore (UC-009)
      └─► heatmap re-shades: the red cell visibly lightens
```

**Demo requirement:** the seeded dataset **must** contain one unmistakable crash week. This is the moment the heatmap goes red on stage.

### 11.4 Focus Mode (UC-011) — the emotional core

```
GET /api/focus
   │
   ├─► load ranked active tasks (already scored)
   │
   ├─► take rank #1
   │      └─ if it has milestones → surface the next INCOMPLETE MILESTONE
   │         ("write the literature review section" beats "do the report")
   │      └─ if isGroup && blockedOnTeammate → skip with a visible note,
   │         present the next actionable item
   │
   ├─► explanation: cached if subScores unchanged (no model call),
   │                otherwise generate (UC-010) or template
   │
   ▼
ONE CARD, FULL SCREEN, NO SCROLLING
   title · module colour · live countdown ("due in 2 days, 14 hours")
   one-sentence explanation
   stacked bar: weighted contribution of each of the five sub-scores
   │
   ▼ four actions
   Start    → session timer; on stop prefills UC-008 with elapsed hours
   Progress → inline UC-008 slider
   Not now  → reveals task #2 WITH the reason it ranked lower
              ("lower stakes: 10% of IT2212 versus 40% of IT2214")
   Done     → mark complete, advance
   │
   ▼ any action → rescore → card reflects the new top item
```

"Not now" showing *why* the next task ranked lower is a small feature with disproportionate impact: it keeps the ordering transparent even when the student overrides it.

---

## 12. Non-functional requirements

| # | Requirement | Target | Verified by |
| --- | --- | --- | --- |
| NFR-1 | Dashboard fully interactive | < 5 s (UC-016 postcondition) | Manual timing on venue wifi, Phase 5 |
| NFR-2 | Read-path API latency | < 500 ms p95 | CloudWatch duration metric |
| NFR-3 | Write-path API latency | < 800 ms p95 | CloudWatch |
| NFR-4 | Weight-slider reorder (UC-015) | < 16 ms, **no network call** | Client-side recompute from persisted sub-scores |
| NFR-5 | Ranking reorder animation after a write | < 1 s (UC-008 step 6) | Manual |
| NFR-6 | AI call timeout before fallback | 6 s hard | `lib/ai/client` |
| NFR-7 | Scheduled batch page | < 60 s, resumable | Cursor mechanism |
| NFR-8 | Seed script | < 10 s, idempotent | `npm run seed` |
| NFR-9 | Availability with AI unavailable | **100% of features** | Kill-switch test, Phase 5 |
| NFR-10 | Total AWS spend | < $5 of the $50 credit | Billing dashboard |
| NFR-11 | Zero `Scan` operations in any code path | 0 | Code review + grep |
| NFR-12 | No secrets in git history | 0 | Pre-commit check |
| NFR-13 | Demo runtime | < 3 minutes | Rehearsed twice, timed |
| NFR-14 | Any member can explain UC-009 | 45 s, unaided | Drilled in Phase 5, rotated |

---

## 13. Deployment topology

```
GitHub  (main protected; feature branches per member)
   │
   ├──────────────► Vercel
   │                  builds  frontend/
   │                  env:    VITE_API_URL, VITE_ENV
   │                  output: https://<app>.vercel.app
   │
   └──────────────► AWS SAM  (sam build && sam deploy)
                      CloudFormation stack: deadlineiq-prod
                        ├── AWS::Serverless::Api           (REST + CORS + authoriser)
                        ├── AWS::Serverless::Function ×~18 (handlers)
                        ├── AWS::Serverless::Function      (reminderLambda, 30 s)
                        ├── AWS::DynamoDB::Table           (deadlineiq + GSI1)
                        ├── AWS::S3::Bucket                (briefs, CORS, lifecycle)
                        ├── AWS::SNS::Topic                (reminders)
                        ├── AWS::Events::Rule ×2           (hourly, daily)
                        └── AWS::Logs::LogGroup ×N
```

### 13.1 The shared-stack model

Philena publishes `template.yaml` with the shared scaffolding at **H+4**. From that moment:

- Each member **adds their own functions and routes** to `template.yaml` and runs `sam deploy` themselves.
- **Nobody queues on Philena.** She owns the template's *shared* sections (table, GSI, API, authoriser); everyone else owns a disjoint block of function definitions.
- Merge conflicts in `template.yaml` are the main coordination cost — hence the disjoint-block convention and PR review before merge.

### 13.2 Environment variables

**Lambda (SAM parameters):**

| Variable | Example | Owner | Notes |
| --- | --- | --- | --- |
| `TABLE_NAME` | `deadlineiq` | Philena | |
| `JWT_SECRET` | *(random 32+ bytes)* | Philena | Never in git |
| `FRONTEND_URL` | `https://deadlineiq.vercel.app` | Philena | CORS allowlist |
| `AI_API_KEY` | *(OpenRouter key)* | Mahdiya | **Removed during the kill-switch test** |
| `AI_MODEL` | *(free-tier chat model id)* | Mahdiya | |
| `S3_BUCKET` | `deadlineiq-briefs-prod` | Mahdiya | |
| `SNS_TOPIC_ARN` | `arn:aws:sns:...` | Zoe | Blank if SMTP fallback in use |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | — | Zoe | Nodemailer fallback |
| `CRON_SECRET` | *(random)* | Zoe | Gates the manual demo trigger |
| `NODE_ENV` | `production` | — | |

**Vercel:**

| Variable | Example |
| --- | --- |
| `VITE_API_URL` | `https://xxxx.execute-api.<region>.amazonaws.com/prod` |
| `VITE_ENV` | `production` |

### 13.3 Seed script — Philena owns, run before **every** rehearsal

`npm run seed` wipes and reseeds the demo account. **All deadlines are computed relative to `now`** (`now + 2 days`, `now + 4 days`…) so the demo can never go stale between rehearsal and judging. Idempotent, completes in under 10 seconds.

The seeded dataset **must** contain:

| Item | Purpose |
| --- | --- |
| 40%-weight IT2214 report, 15% progress, due in 3 days, 12 effort hours | Guarantees `EffortPressure` ratio > 1.0 → `tight` badge |
| A test due in 5 days with `prepDays = 3` | Proves the prep-day logic — the test outranks nearer deadlines |
| A group project with a teammate dependency | Exercises Focus Mode's skip behaviour |
| Two small assignments inside the same 72 hours | Drives `ClashPenalty` |
| One overdue task | Drives UC-021 |
| Availability configured so **week 2 is unmistakably a crash week** | The heatmap goes red on stage |

---

## 14. Explicit non-goals

Listed so that scope creep is a conscious decision rather than a drift. Each has a reason and, where relevant, what we built instead.

| Not building | Why | Built instead |
| --- | --- | --- |
| **Amazon Cognito** | Frequently blocked in Learner Lab; discovering that late would be fatal | Self-managed JWT + bcrypt (§10.1) |
| **Amazon Bedrock** | Usually unavailable in Learner Lab; bonus criteria explicitly relaxed | OpenRouter free tier (§8.2) |
| **Amazon Textract** | Usually unavailable in Learner Lab | `pdfjs-dist` client-side extraction + LLM field extraction (UC-006) |
| **Google Calendar OAuth** | Consent screens consume half a day and are a notorious live-demo failure | `.ics` export + tokenised subscription feed (UC-023) — same user value, under an hour |
| **Shared team deadlines** | Multi-tenant permissions model is a day of work and adds no judging weight beyond the `isGroup` flag | `isGroup` + `blockedOnTeammate` on a single-student model |
| **Native mobile app** | The demo is on a laptop; responsive web covers it | Responsive React |
| **Relational database** | Every hot query resolves in one `Query`; Postgres adds cost and ops for zero product value | Single-table DynamoDB (§5.1) |
| **Real-time collaboration / websockets** | No shared-editing use case exists in the brief | — |
| **Learned or ML-based ranking** | Would destroy the thesis — the whole point is that a judge can verify the arithmetic | Deterministic formula (§7) |
| **Task difficulty as a separate factor** | Overlaps almost entirely with `effortHours`; a second self-reported subjective field adds friction without adding signal | `effortHours` as the difficulty proxy |
| **Recurring tasks** | Not mentioned in the brief; adds a whole recurrence-rule model | — |
| **Offline mode / PWA** | Venue wifi is a demo risk, but a screen recording is the mitigation, not a service worker | Recorded demo fallback |
| **Automated E2E test suite** | At hackathon timescales, rehearsal is a better use of the hours | Unit tests on the scoring engine only (the one place correctness is non-obvious) |

---

## 15. Glossary

| Term | Meaning |
| --- | --- |
| **Sub-score** | One of the five normalised `0–100` components of the priority score (§7.2) |
| **Contribution** | A sub-score multiplied by its weight — what the stacked bar actually shows, and what UC-010 narrates. **Not the same as the raw sub-score** |
| **`tight`** | Flag set when `remainingHours / availableHours > 1.0` — the work is mathematically impossible in the time left at the student's stated availability |
| **`dataGap`** | List of missing fields that forced a neutral substitution in scoring; drives the "add an effort estimate for a better ranking" hint |
| **Crash week** | A calendar week with `loadRatio > 1.0` (required hours exceed available hours) |
| **`loadRatio`** | `requiredHours / availableHours` for a given week |
| **`effectiveDays`** | `daysUntil(dueAt) − prepDays` — the real start-by horizon, which is what Urgency measures |
| **`explanationStale`** | Set when a task's score moves more than 5 points, invalidating the cached narration |
| **Kill-switch test** | Removing `AI_API_KEY` and walking the entire demo to prove every deterministic fallback works (§8.5) |
| **Class A/B/C/D** | Request classification determining latency budget and whether AI may be involved (§3.2) |
| **Learner Lab** | AWS Academy Learner Lab — the restricted, credit-limited AWS environment provided for the hackathon |
| **`LabRole`** | The pre-provisioned IAM role the Learner Lab forces on all resources |
| **Numeral-provenance check** | Validation rejecting any AI explanation containing a number absent from its input payload (§8.4) |
