# DeadlineIQ

**Academic deadline tracking and prioritisation, where every ranking is arithmetic you can check.**

Built for the **AWS × NYP Cloud Hackathon 2026** — Problem Statement **PS-3: Assignment Deadline Tracker**.

---

## The problem

Polytechnic students juggle assignments, group projects, practical submissions, tests, presentations and CCA commitments — announced across lecture slides, group chats, and verbal reminders, then recorded (or not) across calendars, notes and spreadsheets.

But the brief identifies the harder problem:

> *"During busy academic periods, knowing a deadline is not always enough. Students must also decide which task should be completed first, how early they need to begin, whether multiple deadlines are concentrated in the same week…"*

and sets the bar for solving it:

> *"A higher-priority recommendation should be understandable rather than appearing arbitrary."*

## Our answer

Most deadline trackers sort by nearest deadline. DeadlineIQ computes priority from a **five-factor deterministic formula**, persists every component, and uses AI **only to narrate the result in plain English**.

> **The AI writes the sentence. It never picks the order.**

Every ranking can be reconstructed on a whiteboard. A judge can check the arithmetic by hand — and the interactive weight sliders let them watch the formula rearrange the list in real time, with no network call.

---

## The priority formula

Five sub-scores, each normalised to 0–100, combined with per-student weights:

| Sub-score | Measures | Formula |
| --- | --- | --- |
| **Urgency** | How close the *start-by* point is | `100 × e^(−0.25 × (daysUntilDue − prepDays))` |
| **Stakes** | How much of the module grade is at risk | `min(100, gradeWeight × 2.5)` |
| **Effort Pressure** | Whether the work still *fits* in the time left | `min(100, (remainingHours / availableHours) × 70)` |
| **Progress Deficit** | How far behind a steady pace the student is | `max(0, expectedProgress − actualProgress)` |
| **Clash Penalty** | Deadline pile-up in the same window | `min(100, clashCount × 30)` |

```
Priority = 0.30·Urgency + 0.25·Stakes + 0.20·EffortPressure
         + 0.15·ProgressDeficit + 0.10·ClashPenalty
```

**Two details that make this academic rather than generic:**

- **`prepDays` shifts the effective deadline earlier.** A test 5 days away needing 3 days of revision scores as though it were 2 days away — because it is. Every tracker sorting by nearest deadline ranks that test fifth.
- **Effort Pressure can prove a task is impossible.** When `remainingHours / availableHours > 1.0`, the work does not fit in the time left at the student's own stated availability. The task is flagged `tight`. That is a stronger statement than "urgent", and it requires actually modelling the student's capacity.

Worked example with real numbers: [`HIGH_LEVEL_DESIGN.md` §7.4](HIGH_LEVEL_DESIGN.md).

---

## What it does

| Capability | How |
| --- | --- |
| **Record deadlines fast** | Structured form with smart defaults by task type · natural-language entry (*"db report due next friday 11:59pm, 30% of IT2214"*) · upload an assignment brief and extract the deadline · bulk-paste an assessment schedule |
| **Understand the ranking** | One-sentence plain-English explanation above a stacked bar showing each factor's weighted contribution |
| **Tune the ranking** | Five sliders with a live top-5 preview that reorders instantly, client-side, from persisted sub-scores |
| **See the whole semester** | 12-week workload heatmap shaded by `requiredHours / availableHours`, with crash weeks in red |
| **Fix a bad week** | Quantified redistribution: *"Start your IT2214 report 4 days earlier and move 5 hours into the week of 17 Aug, which has 6 spare hours."* One click to apply |
| **Decide what to do now** | Focus Mode: one card, one task (or its next milestone), one explanation, four actions |
| **Get reminded usefully** | Daily digest at your chosen time, same-day nudges, escalation when you fall behind pace — capped at **3 per day**, quiet hours enforced |
| **Handle the misses** | Overdue tasks pinned red with three honest resolutions: mark complete late, reschedule, or archive |
| **Learn from yourself** | Estimation accuracy across completed tasks feeds forward: *"You usually need about 1.3× your estimate."* |

---

## Architecture

```
React + Vite (Vercel)
        │  HTTPS + Bearer JWT
        ▼
Amazon API Gateway ──► Lambda Authoriser (JWT → userId)
        │
        ▼
AWS Lambda handlers ──► backend/lib/scoring  (pure, deterministic, no AI)
        │                        ▲
        ▼                        │
Amazon DynamoDB          Amazon EventBridge
single table + GSI1      hourly recompute
        │                daily 08:00 digest
        │                        │
        │                        ▼
Amazon S3                Amazon SNS ──► student's inbox
(brief uploads)                  │
        │                        │
        └──────► Amazon CloudWatch ◄─────┘
```

**AWS services and why each one:**

| Service | Job |
| --- | --- |
| **DynamoDB** | Single-table store for tasks, milestones, modules, preferences, notifications. GSI1 answers *"one student's tasks in a deadline window, in order"* with one Query and **zero Scans** |
| **Lambda** | Every handler, the scoring engine, the scheduled recompute, reminder dispatch |
| **API Gateway** | REST front door with a JWT Lambda authoriser that injects `userId` — never read from the request body |
| **EventBridge** | Two rules, one Lambda: hourly rescore (so urgency advances overnight without the student opening the app) and the 08:00 SGT digest |
| **SNS** | Reminder delivery, with an SMTP fallback if SNS is outside the Learner Lab allowlist |
| **S3** | Assignment brief uploads via presigned PUT — files never pass through Lambda |
| **CloudWatch** | Structured logs and a dashboard proving the whole chain executed on schedule |

**AI (bonus criteria):** OpenRouter free-tier model for natural-language parsing, brief extraction, explanation narration, and milestone breakdown — permitted explicitly by the relaxed bonus criteria. **Every AI feature has a deterministic fallback**, and the full demo is rehearsed with the API key removed.

---

## Repository layout

```
├── AGENTS.md                        ← read this first, every session
├── CLAUDE.md                        ← points AI tools at AGENTS.md
├── .kiro/steering/                  ← same, for Kiro
├── DeadlineIQ_Use_Cases.md          ← the behavioural spec (23 use cases)
├── HIGH_LEVEL_DESIGN.md             ← architecture, data model, API contract
├── PROJECT_IMPLEMENTATION_PHASES.md ← build order, tickets, risk register
│
├── frontend/
│   └── src/
│       ├── lib/          api, auth, chartTheme, countdown, parsers
│       ├── pages/        Dashboard · Focus · Calendar · Workload · Settings · Completed
│       ├── components/   TaskCard · SubScoreBar · PriorityExplanation · QuickAddBar
│       └── context/      AuthContext · TasksContext
│
├── backend/
│   ├── handlers/         one folder per feature group
│   ├── lib/
│   │   ├── scoring/      ⭐ the priority engine — pure functions, no AWS SDK
│   │   ├── dynamo/       access layer; every call partition-scoped by userId
│   │   ├── ai/           client + prompts + strict validation
│   │   ├── notify/       single send() — SNS or SMTP, decided once
│   │   └── auth/         JWT sign/verify
│   ├── authorizer/       Lambda authoriser
│   ├── scripts/seed.js   demo data, all dates relative to now
│   └── tests/            unit tests for the scoring engine
│
└── template.yaml         AWS SAM — one shared stack, four contributors
```

---

## Getting started

### Prerequisites

- Node.js 20.x
- AWS CLI, configured with AWS Academy Learner Lab credentials
- AWS SAM CLI
- An OpenRouter API key (free tier) — optional; everything works without it

### 1. Clone and install

```bash
git clone https://github.com/<org>/AWS-NYP-Cloud-Hackathon-2026.git
```

```bash
cd AWS-NYP-Cloud-Hackathon-2026 && npm install --prefix backend && npm install --prefix frontend
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the values. **Never commit `.env`.**

```bash
cp .env.example .env
```

### 3. Deploy the backend

```bash
sam build && sam deploy --guided
```

Note the API invoke URL from the output — it becomes `VITE_API_URL`.

### 4. Run the frontend locally

```bash
npm run dev --prefix frontend
```

### 5. Seed the demo data

```bash
npm run seed --prefix backend
```

This wipes and reseeds the demo account with a deliberately brutal week: a 40%-weight report that mathematically does not fit in the available hours, a test needing three days of prep, two clashing assignments, one overdue task, and availability tuned so week 2 is unmistakably a crash week. **All dates are relative to `now`**, so the demo never goes stale.

---

## Environment variables

### Backend (Lambda / SAM parameters)

| Variable | Purpose |
| --- | --- |
| `TABLE_NAME` | DynamoDB table name (`deadlineiq`) |
| `JWT_SECRET` | Signing secret for auth tokens |
| `FRONTEND_URL` | Vercel app URL — the CORS allowlist |
| `AI_API_KEY` | OpenRouter key. **Leave unset to test the fallbacks** |
| `AI_MODEL` | Free-tier chat model identifier |
| `S3_BUCKET` | Bucket for uploaded assignment briefs |
| `SNS_TOPIC_ARN` | Reminder topic (blank if using SMTP fallback) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Nodemailer fallback |
| `CRON_SECRET` | Gates the manual reminder trigger used in the demo |
| `NODE_ENV` | `production` |

### Frontend (Vercel)

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API Gateway invoke URL |
| `VITE_ENV` | `production` |

---

## Testing the fallbacks

The most important test in this repository. Remove the AI key and walk the entire product:

```bash
aws lambda update-function-configuration --function-name <fn> --environment "Variables={AI_API_KEY=}"
```

Everything must still work:

| Feature | Without AI |
| --- | --- |
| Natural-language entry | `chrono-node` parses the date, regex finds module / weight / hours |
| Brief extraction | Regex extraction, or a form prefilled with the filename |
| Priority explanations | Template sentences built from the same sub-scores — **visually identical UI** |
| Milestone breakdown | Template steps by task type |
| Everything else | Unaffected — nothing else touches AI |

A demo that dies on a rate limit loses to a duller demo that works.

---

## For contributors — human and AI

**Read [`AGENTS.md`](AGENTS.md) before touching anything.** It is the working agreement for every contributor, including Claude Code, Kiro, Cursor and Copilot. It covers the thesis, the stack, the data model, ownership boundaries, and the rules that keep the AI out of the ranking path.

Reading order:

1. [`AGENTS.md`](AGENTS.md) — how to work
2. [`DeadlineIQ_Use_Cases.md`](DeadlineIQ_Use_Cases.md) — what to build (23 use cases; the behavioural spec)
3. [`HIGH_LEVEL_DESIGN.md`](HIGH_LEVEL_DESIGN.md) — how it fits together
4. [`PROJECT_IMPLEMENTATION_PHASES.md`](PROJECT_IMPLEMENTATION_PHASES.md) — when, and by whom

---

## Team

| Member | Track | Owns |
| --- | --- | --- |
| **Philena** | Platform & Data | SAM template, DynamoDB + GSI1, API Gateway, authoriser, auth, task CRUD, modules and availability, seed script |
| **Mahdiya** | Smart Capture | S3 + presigned uploads, natural-language parser, brief extraction, bulk import, progress logging |
| **Hasini** | Intelligence | The scoring engine, explanations, Focus Mode, milestones, crash-week detection, daily plan, weight tuning, workload heatmap |
| **Zoe** | Experience & Notifications | Dashboard, calendar and timeline, EventBridge + reminder pipeline, notification preferences, overdue handling, completed view, calendar export |

---

## Design decisions worth defending

| Decision | Reason |
| --- | --- |
| **Deterministic ranking, AI only narrates** | The brief requires recommendations to be understandable. A model that ranks cannot be audited; a formula can |
| **Sub-scores persisted, not computed at render** | Lets the weight sliders reorder client-side in under 16 ms, and means the narration prompt receives only numbers — never task text — so the model *structurally cannot* re-rank |
| **Scoring is a shared library, not a service** | The write path and the scheduled reminder Lambda import the same functions. Two code paths cannot drift into two rankings |
| **Single-table DynamoDB** | Every hot query is one student's items in a deadline window. One Query, zero Scans, no N+1 |
| **Self-managed JWT instead of Cognito** | Cognito is frequently unavailable in the AWS Academy Learner Lab. Discovering that at hour 20 would be fatal |
| **OpenRouter instead of Bedrock** | Bedrock is typically outside the Learner Lab allowlist; the bonus criteria were explicitly relaxed to permit other providers |
| **`.ics` export instead of Google Calendar OAuth** | Same user value in under an hour. OAuth consent screens are a notorious cause of live demo failure |
| **Every AI feature has a deterministic fallback** | Rate limits during judging are common. Degrade the quality of the answer, never the availability of the app |

Full reasoning, including what we deliberately did **not** build: [`HIGH_LEVEL_DESIGN.md` §14](HIGH_LEVEL_DESIGN.md).
