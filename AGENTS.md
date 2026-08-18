# AGENTS.md

> ## 🔴 READ THIS FILE FIRST. EVERY SESSION. BEFORE ANY OTHER FILE.
>
> This applies to **Claude Code, Kiro, Cursor, Windsurf, GitHub Copilot**, and every human contributor.
>
> If you skip it, you will build the wrong thing. This product's entire value is a **deterministic priority formula** narrated by AI — and neither that formula nor the strict boundary around the AI is discoverable from the code. The repository starts nearly empty; the design lives in these documents.

---

## Purpose

You are a senior software engineer helping four polytechnic students build **DeadlineIQ**, an academic deadline tracker, for the **AWS × NYP Cloud Hackathon 2026** (Problem Statement **PS-3**).

Follow the engineering priorities below. **Only do what is tasked — do not do more.**

---

## 1. The thesis — memorise this

The brief says:

> *"A higher-priority recommendation should be understandable rather than appearing arbitrary."*

Most competing teams will ship a CRUD app that sorts by nearest deadline. DeadlineIQ computes priority from a **five-factor deterministic formula** (UC-009) and uses AI **only to narrate that formula in plain English** (UC-010). Every ranking is reconstructable on a whiteboard.

### 🔴 The line you must never cross

> **The AI writes the sentence. It never picks the order.**

Concretely, this means:

| Forbidden | Why |
| --- | --- |
| An LLM computing, adjusting, or reordering `priorityScore` | Destroys the thesis. The whole product is that a judge can verify the arithmetic |
| An LLM call anywhere on a read or write path (Class A/B, §7) | Makes the app's core unavailable when the model is rate-limited |
| Sending task titles or notes to the UC-010 narration prompt | The narration prompt receives **only numbers**. That is what makes "it cannot re-rank" structural rather than aspirational |
| An AI feature merged without its deterministic fallback | A demo that dies on a 429 loses to a duller demo that works |
| An LLM writing directly to DynamoDB | Every AI output is a **proposal** rendered for the student to confirm |

**If a change you are about to make would let a model influence ranking, stop and ask.**

---

## 2. Engineering priorities

1. **Simplicity.** Do not over-engineer. Three similar lines beat a premature abstraction. No speculative interfaces, no plugin systems, no config for things that will never change. Never leave a half-finished implementation.
2. **Correctness over robustness.** Make the happy path correct. Do not add error handling or edge cases the use case does not name — but **do** implement every error case it *does* name.
3. **Deterministic fallbacks are mandatory.** Every AI-dependent use case (UC-005, UC-006, UC-010, UC-012) must work end to end with `AI_API_KEY` removed from the environment. Ship the fallback in the same commit as the AI path.
4. **Documentation.** Brief comments, only where the *why* is non-obvious. Do not write planning documents, summaries, or per-file changelogs. Do not create README files unless asked.

---

## 3. Stack — do not substitute without asking

### Frontend
- **React + Vite**, deployed to **Vercel**
- **React Router** for routing, **Tailwind CSS** for styling
- **Chart.js** — theme config at `frontend/src/lib/chartTheme.ts`. **Hasini owns this file.** UC-016, UC-017 and UC-018 import from it. **Never hard-code a chart colour anywhere**
- **axios** with a bearer interceptor (`lib/api.ts`)
- **`pdfjs-dist`** — client-side PDF text extraction (UC-006). Files are parsed in the browser, never in Lambda
- **`chrono-node`** — deterministic date-parse fallback (UC-005)
- **`ics`** — calendar export (UC-023)
- **No Redux, no React Query, no state library.** Two React contexts (`AuthContext`, `TasksContext`) cover the whole app at this scale

### Backend
- **Node.js 20.x on AWS Lambda**, behind **Amazon API Gateway** (REST)
- **arm64, 256 MB, 10 s timeout** (30 s for `reminders/run` and `briefs/extract`)
- **Plain handler functions. No Express, no Nest, no framework layer.** A Lambda behind API Gateway does not need a web server inside it
- Validation with a small schema helper — **Zod. Decided; do not add Joi.** Use `lib/validate.js`

### Database
- **Amazon DynamoDB, single table** named `deadlineiq`
- Composite key with an entity-type discriminator on the sort key (§5)
- **No ORM. No relational thinking. No `Scan` in any code path.** Every hot query resolves to a `Query` on the main table or GSI1

### Auth
- **Self-managed JWT** — `jsonwebtoken` (HS256, 24 h) + **`bcryptjs`** (cost 10), users stored as `PROFILE` items
  - `bcryptjs`, not `bcrypt`: `bcrypt` is a native addon, so a build on a Windows laptop does not produce a Linux/arm64 binary and the deployed Lambda crashes unless every member builds through Docker. `bcryptjs` is pure JS, same API, same cost-10 bcrypt hashes. Slower to hash, which is irrelevant at our login volume
- **Amazon Cognito is NOT used.** It is frequently unavailable in the AWS Academy Learner Lab. Do not add it, do not suggest adding it
- A **Lambda authoriser** validates the token on every protected route and injects `userId` into the request context
- 🔴 **`userId` is NEVER read from the request body.** It comes from `event.requestContext.authorizer.userId`, always

### AWS services
| Service | Used for |
| --- | --- |
| **DynamoDB** | Single-table store, GSI1 on deadline |
| **Lambda** | Every handler + the scheduled reminder job |
| **API Gateway** | REST front door + JWT authoriser |
| **EventBridge** | Two rules → one Lambda: `rate(1 hour)` recompute, `cron(0 0 * * ? *)` = 08:00 SGT digest |
| **SNS** | Reminder delivery (Nodemailer/SMTP fallback if blocked) |
| **S3** | Assignment brief uploads via presigned PUT, 5-minute expiry, 5 MB cap |
| **CloudWatch** | Structured logs + demo metrics dashboard |

### AI
- **OpenRouter free-tier chat model.** Explicitly permitted by the participant update relaxing the bonus criteria: *"You are therefore not required to use Amazon Bedrock… You may use other AI models, APIs, or platforms where appropriate."*
- **Bedrock is NOT required and is usually blocked in the Learner Lab.** Do not add it
- All AI access goes through `backend/lib/ai/client.js` with a **6-second timeout**. Every caller catches `AiUnavailable` and runs its fallback

### Deployment
- **AWS SAM.** Philena owns the shared sections of `template.yaml`; each member adds their own functions to their own comment block and runs `sam deploy` themselves. **Nobody queues on Philena after hour 4**

---

## 4. AWS Academy Learner Lab — the constraint that shapes everything

The Learner Lab restricts the service allowlist and forces the pre-provisioned `LabRole`. **Zoe audits this at hour zero and reports to the team before anyone writes code.**

| Expected available | Expected blocked |
| --- | --- |
| Lambda, DynamoDB, API Gateway, EventBridge, S3, SNS, CloudWatch | **Cognito, SES, Textract, Bedrock** |

**Fallbacks are already chosen. Do not "improve" them by reintroducing a blocked service:**

| Blocked | We use instead |
| --- | --- |
| Cognito | Self-managed JWT + bcrypt, users in DynamoDB |
| SES | SNS email subscription, or Nodemailer via SMTP |
| Textract | `pdfjs-dist` client-side extraction + LLM field extraction |
| Bedrock | OpenRouter free-tier model |

**Cost discipline ($50 credit):** DynamoDB on-demand, Lambda 256 MB, S3 Standard, SNS email. Estimated total spend under $5. **Never provision EC2, RDS, NAT Gateways, Fargate, OpenSearch, or provisioned DynamoDB capacity** — any one of them can consume the whole credit in a day.

---

## 5. Data model — single-table DynamoDB

**Table `deadlineiq`.** Full field-by-field dictionary in `HIGH_LEVEL_DESIGN.md` §5. The shape:

```
PK = USER#<userId>
SK = PROFILE                             — credentials, display name, timezone
     PREFS                               — availability, weights, reminder settings
     MODULE#<moduleCode>                 — module name, colour, total weight
     TASK#<taskId>                       — an academic task
     MILESTONE#<taskId>#<milestoneId>    — a milestone under a task
     NOTIF#<date>#<taskId>#<rule>        — a sent notification (idempotency key)

GSI1 (deadline-index), sparse — TASK# items only:
     GSI1PK = USER#<userId>
     GSI1SK = DUE#<ISO8601 dueAt>
```

**Why:** every hot query in this system is *"one student's tasks in a deadline window, in deadline order."* GSI1 answers that with a single `Query` and zero `Scan`s. Rendering the whole dashboard is one `Query` on `PK = USER#uid` — profile, prefs, modules, tasks and milestones in a single round trip. There is no N+1 problem because there is no N+1.

**If you find yourself writing a `Scan`, stop and revisit the key design.**

### Canonical task fields — do not rename

```
taskId, userId, title, module, type, dueAt, gradeWeight, effortHours,
hoursSpent, progressPct, isGroup, blockedOnTeammate, prepDays, status, notes,
priorityScore, subScores{urgency,stakes,effortPressure,progressDeficit,clashPenalty},
tight, dataGap[], explanation, explanationHash, explanationStale,
s3Key, source, createdAt, updatedAt, completedAt, lateSubmission,
overdueSince, history[]
```

| Enum | Values |
| --- | --- |
| `type` | `assignment` · `test` · `project` · `presentation` |
| `status` | `active` · `completed` · `overdue` · `archived` · `deleted` |
| `source` | `form` · `nl` · `brief` · `paste` |

**Nothing is ever hard-deleted during the hackathon.** Delete is a soft status change with a 10-second undo.

### Smart defaults by task type (UC-002)

| Type | `effortHours` | `prepDays` | Reminder lead |
| --- | --- | --- | --- |
| `assignment` | 8 | 0 | 3 days |
| `test` | 6 | **3** | 7 days |
| `project` | 15 | 0 | 5 days |
| `presentation` | 5 | **1** | 3 days |

Deadline time defaults to **23:59**. Every default is labelled *"suggested"* and editable — **never present a guess as a fact.**

---

## 6. The priority formula (UC-009) — this is the product

Deterministic. Pure functions. No LLM in this path. Ever.

```
(a) URGENCY          effectiveDays = daysUntil(dueAt) − prepDays
                     Urgency = 100 × e^(−0.25 × max(effectiveDays, 0))
                     overdue → pinned to 100

(b) STAKES           Stakes = min(100, gradeWeight × 2.5)

(c) EFFORT PRESSURE  remainingHours = effortHours × (1 − progressPct/100)
                     availableHours = Σ daily availability from PREFS
                                      between now and dueAt, minus blocked days
                     ratio          = remainingHours / max(availableHours, 0.5)
                     EffortPressure = min(100, ratio × 70)
                     ratio > 1.0    → tight = true  (work does NOT fit)

(d) PROGRESS DEFICIT expected = 100 × (now − createdAt) / (dueAt − createdAt)
                     ProgressDeficit = max(0, expected − progressPct)

(e) CLASH PENALTY    n = other active tasks with dueAt within ±72 hours
                     ClashPenalty = min(100, n × 30)

Priority = 0.30·Urgency + 0.25·Stakes + 0.20·EffortPressure
         + 0.15·ProgressDeficit + 0.10·ClashPenalty
```

**Weights are per student** (`PREFS`), tunable in UC-015, always normalised to sum 1.0 on write.
**Tie-breaking, in order:** higher `priorityScore` → earlier `dueAt` → higher `gradeWeight` → `taskId` ascending (stable ordering matters for the reorder animation).

### The two lines that make this academic rather than generic

- **`prepDays` shifts the effective deadline earlier.** A test 5 days away needing 3 days of revision scores as though it were 2 days away — because it is. Every team sorting by nearest deadline ranks that test fifth.
- **`ratio > 1.0` means the task is mathematically impossible** in the time left at the student's own stated availability. Not "urgent" — *impossible*. This requires modelling capacity, which is why UC-004 exists.

### Implementation rules

- Lives in `backend/lib/scoring/` as **pure functions**. No `@aws-sdk` imports, no `fetch`, no `Date.now()` inside the maths — `now` is an explicit parameter so tests are deterministic
- Fixed signature: `score(tasks, prefs, now) → tasks[]` gaining `priorityScore`, `subScores`, `tight`, `dataGap`
- **Imported, never called over HTTP.** Both the task-write handlers and the scheduled reminder Lambda `require` it. There is exactly one implementation of the ranking
- **Persist `priorityScore` AND the full `subScores` object** on every write. UC-010 narrates from `subScores`; UC-015 recomputes from `subScores` client-side; UC-016 renders bars from `subScores`. **Never recompute sub-scores at render time**
- Missing `gradeWeight` or `effortHours` → substitute a neutral `50`, record a `dataGap` flag. **Degrade in quality, never in availability**
- **Scoring failure must never block a write.** Save the task with `priorityScore = null` and a "score pending" badge; the next hourly recompute fills it in

Worked example with real numbers reaching a priority of **73.5**: `HIGH_LEVEL_DESIGN.md` §7.4. **Reproduce it in a unit test.**

---

## 7. Request classes — know which one you are writing

| Class | Examples | Budget | AI allowed? |
| --- | --- | --- | --- |
| **A — Read** | dashboard, ranking, calendar, heatmap | < 500 ms p95 | ❌ No |
| **B — Write** | create/update task, log progress | < 800 ms p95 | ❌ No |
| **C — Assisted capture** | quick parse, brief extract, bulk import | < 6 s, then fall back | ✅ With fallback |
| **D — Background** | hourly recompute, daily digest | < 60 s per page, resumable | ✅ Narration pre-warm only |

🔴 **An LLM call on a Class A or Class B path is a bug**, not a design choice.

---

## 8. API conventions

- Every protected route requires `Authorization: Bearer <jwt>`
- **Error responses:** `{ "code": "<snake_case>", "message": "<human-readable>" }`. The `code` is what the frontend branches on; the `message` is safe to show a student verbatim. The closed catalogue is in `HIGH_LEVEL_DESIGN.md` §6.3 — **adding a code is a doc change too**
- **Success responses return the affected resource**, never `{ ok: true }`. A create returns the created task *with its computed score*. Callers should never need a follow-up GET
- **`PATCH` sends only changed fields.** Build a DynamoDB `UpdateExpression`; never `PutItem` a whole task over an existing one
- **Writes that change a deadline return the full `ranking[]`**, because changing one deadline alters every other task's ClashPenalty
- **Timestamps are ISO-8601 UTC with `Z`** on the wire and in storage. Timezone conversion happens at the display layer and inside scheduling logic
- **404, not 403, for another user's item.** A 403 would confirm the item exists
- Login returns **one generic message** for both wrong-email and wrong-password — no account enumeration

---

## 9. Handler skeleton — match this, do not invent a new shape

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

**DynamoDB access layer rule:** every function in `lib/dynamo/` takes `userId` as its first parameter and builds `PK = USER#${userId}` internally. **No caller ever constructs a partition key by hand.** This is what makes cross-account access structurally impossible rather than merely unlikely.

**Notification rule:** every send goes through `lib/notify/send()`. **No use case ever imports the SNS SDK or Nodemailer directly.** Zoe decides the delivery path once; nobody else is affected by the decision.

---

## 10. Repository structure

```
frontend/src/
  lib/           api.ts · auth.ts · chartTheme.ts · countdown.ts · parsers/
  pages/         Dashboard · Focus · Calendar · Workload · Settings · Completed
  components/    TaskCard · SubScoreBar · PriorityExplanation · QuickAddBar · ...
  context/       AuthContext.tsx · TasksContext.tsx
  App.jsx · main.jsx

backend/
  handlers/      auth/ tasks/ modules-prefs/ parse/ briefs/ progress/
                 explain/ focus/ milestones/ workload/ weights/
                 views/ reminders/ notif-prefs/ overdue/ completed/ export/
  lib/
    scoring/     ⭐ pure functions — the priority engine
    dynamo/      access layer, partition-scoped by userId
    ai/          client.js + prompts/ + validate.js
    notify/      send.js — SNS or SMTP, decided once
    auth/        jwt.js
    http.js · validate.js
  authorizer/    Lambda authoriser
  scripts/       seed.js
  tests/         scoring.test.js and friends

template.yaml    shared SAM template — Philena owns the shared sections
```

---

## 11. Ownership — do not cross a boundary without asking

| Member | Track | Owns |
| --- | --- | --- |
| **Philena** | Platform & Data | SAM template (shared sections), DynamoDB + GSI1, API Gateway, Lambda authoriser, UC-001/002/003/004, seed script |
| **Mahdiya** | Smart Capture | S3 + presign, UC-005 parser, UC-006 brief extraction, UC-007 bulk import, UC-008 progress logging |
| **Hasini** | Intelligence | **UC-009 scoring engine** (shared library), UC-010 explanations, UC-011 Focus Mode, UC-012 milestones, UC-013 crash weeks, UC-014 daily plan, UC-015 weight tuning, UC-018 heatmap, shared `chartTheme.ts` |
| **Zoe** | Experience & Notifications | Hour-zero Learner Lab audit, UC-016 dashboard, UC-017 calendar/timeline, UC-019 EventBridge + reminder Lambda, UC-020 notification prefs, UC-021 overdue, UC-022 completed view, UC-023 `.ics` export |

**`template.yaml` convention** — add functions inside your own block only:

```yaml
Resources:
  # ===== SHARED — Philena only =====
  # ===== PHILENA =====
  # ===== MAHDIYA =====
  # ===== HASINI =====
  # ===== ZOE =====
```

If you need a change to a shared section, **ask Philena** — do not edit it directly.

---

## 12. Working agreement

### Before writing any code

1. **Read the use case first.** For any task numbered `UC-###`, open `DeadlineIQ_Use_Cases.md` and read that section **end to end** — main flow, alternative flows, error cases, postcondition. The main flow alone is not the spec. **Do not invent behaviour the use case does not describe.**
2. **Read the existing file before changing it.** The table has no migration files; the schema lives in §5 of this document and in the code that writes it.
3. **Check the API contract** in `HIGH_LEVEL_DESIGN.md` §6 if your work touches an endpoint.
4. **For non-trivial tasks, show a short plan and wait for approval.** "Non-trivial" means: touches more than one handler, changes the data model, or adds an AWS resource.

### While writing

- **Match existing patterns.** Do not introduce a new framework, state library, folder layout, or error shape.
- **No `Scan` operations.** Ever.
- **No LLM call on a Class A or B path.**
- **AI code ships with its fallback in the same commit.** Not afterwards. This is not negotiable.
- **Never commit secrets.** Credentials go in `.env` (local) or SAM parameters (deployed). Document names in `.env.example` with **no values**. Tell the user which variables to set.
- **Do not add tests unless asked.** When asked, put them under `backend/tests/` mirroring the handler layout. The one exception: the scoring engine is unit-tested from the start, because it is the only place where correctness is non-obvious.
- **Do not touch another member's UC** without a note in the PR description explaining why the handoff was necessary.

### PR checklist — paste this in

```
- [ ] UC section read end to end before coding
- [ ] Main flow works on deployed URLs
- [ ] Primary alternative flow works
- [ ] Error cases: implemented / consciously cut (list them)
- [ ] userId read from authoriser context, never from the body
- [ ] No Scan operations
- [ ] No LLM call on a read or write path
- [ ] AI feature? Fallback verified with AI_API_KEY unset
- [ ] No secrets; .env.example updated if needed
- [ ] Deployed and verified
```

---

## 13. Common mistakes — check yourself against this list

| ❌ Wrong | ✅ Right |
| --- | --- |
| `const userId = body.userId` | `const userId = event.requestContext.authorizer.userId` |
| `Scan` with a filter on `userId` | `Query` on `PK = USER#${userId}` |
| Recomputing sub-scores when rendering | Read the persisted `subScores` |
| Sending the task title to the narration prompt | Send only numbers — labels, values, contributions, figures |
| Rescoring only the edited task after a deadline change | Rescore the **full active set** — ClashPenalty is cross-task |
| `PutItem` the whole task on an edit | `UpdateExpression` with only the changed fields |
| Adding an AI feature, planning the fallback "later" | Ship both in the same commit |
| `catch (e) { console.log(e) }` and continuing | Catch `AiUnavailable` specifically and run the fallback |
| Blocking task creation because scoring failed | Save with `priorityScore = null` and a "score pending" badge |
| Comparing a 23:59 SGT deadline in Lambda's UTC | Compare in the student's timezone from `PROFILE.tz` |
| `Access-Control-Allow-Origin: *` | Exactly `FRONTEND_URL` |
| Returning 403 for another user's task | Return 404 — do not leak existence |
| Hard-coding a chart colour | Import from `chartTheme.ts` |
| Importing the SNS SDK in a feature handler | Call `lib/notify/send()` |
| Writing a reminder without a conditional put | `ConditionExpression: attribute_not_exists(SK)` on `NOTIF#...` |
| Adding Cognito / Bedrock / Textract / SES "because it's more AWS-native" | They are blocked in the Learner Lab. Use the chosen fallback |

---

## 14. Environment variables

**Lambda:**

```
TABLE_NAME              deadlineiq
JWT_SECRET              signing secret for auth tokens
FRONTEND_URL            https://<vercel-app>.vercel.app   (exact, CORS allowlist)
AI_API_KEY              OpenRouter key — REMOVED during the kill-switch test
AI_MODEL                free-tier chat model id
S3_BUCKET               brief-uploads bucket name
SNS_TOPIC_ARN           reminder topic (blank if SMTP fallback in use)
SMTP_HOST / SMTP_USER / SMTP_PASS    Nodemailer fallback
CRON_SECRET             gates POST /api/reminders/run
NODE_ENV                production
```

**Vercel:**

```
VITE_API_URL            API Gateway invoke URL
VITE_ENV                production
```

---

## 15. Non-negotiables before presenting

1. 🔴 **The kill-switch test.** Remove `AI_API_KEY` from the deployed Lambda environment and walk the entire demo. Every screen must still work — `chrono-node` parsing (UC-005), regex brief extraction (UC-006), template sentences (UC-010), template milestone breakdowns (UC-012). **If something breaks, fix the fallback — not the LLM.**
2. **`npm run seed` runs clean immediately before every rehearsal and before the demo.** All dates are relative to `now`, so the demo can never go stale.
3. **All four members can explain UC-009 in 45 seconds, unaided.** Rotate and quiz each other — judges routinely ask the person who did *not* build the feature.
4. **Freeze the code at H−60 minutes.** After that: documentation, slides and rehearsal only. Rehearse the three-minute demo script twice, end to end, on the actual venue wifi.

---

## 16. Source-of-truth documents — read in this order

| # | Document | Contains |
| --- | --- | --- |
| 1 | **`AGENTS.md`** (this file) | How to work. Read every session |
| 2 | **`DeadlineIQ_Use_Cases.md`** | What to build — 23 use cases, the behavioural spec |
| 3 | **`HIGH_LEVEL_DESIGN.md`** | How it fits together — architecture, data dictionary, API contract, algorithms, failure matrix, security |
| 4 | **`PROJECT_IMPLEMENTATION_PHASES.md`** | When and by whom — tickets, dependencies, acceptance criteria, risk register, demo script |
| 5 | **`README.md`** | How to run it — setup, deploy, demo |

**Precedence when documents conflict:** `DeadlineIQ_Use_Cases.md` (behaviour) > `HIGH_LEVEL_DESIGN.md` (structure) > `PROJECT_IMPLEMENTATION_PHASES.md` (sequencing). If you find a genuine contradiction, raise it — do not silently pick one.

@AGENTS.md
