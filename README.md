# DeadlineIQ

**Academic deadline tracking and prioritisation, where every ranking is arithmetic you can check.**

Built for the **AWS × NYP Cloud Hackathon 2026** — Problem Statement **PS-3: Assignment Deadline Tracker**.

**Live:** [d3c6ivdcez723d.cloudfront.net](https://d3c6ivdcez723d.cloudfront.net) · sign in as `demo@nyp.edu.sg` / `demo1234`

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

The engine lives in [`backend/lib/scoring/`](backend/lib/scoring) as pure functions — no AWS SDK, no network, no `Date.now()` inside the maths. `now` is an explicit parameter, so every test is deterministic.

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
React + Vite  ──►  Amazon S3  ──►  Amazon CloudFront
(static build)     (private,        (HTTPS, global edge,
                    OAC-gated)       SPA rewrites)
                                            │
                                            │  HTTPS + Bearer JWT
                                            ▼
                        Amazon API Gateway ──► Lambda Authoriser (JWT → userId)
                                    │
                                    ▼
                        AWS Lambda handlers ──► backend/lib/scoring
                                    │            (pure, deterministic, no AI)
                                    ▼                     ▲
                        Amazon DynamoDB           Amazon EventBridge
                        single table + GSI1       hourly recompute
                                    │             daily 08:00 SGT digest
                                    │                     │
                        Amazon S3                         ▼
                        (brief uploads)           Amazon SNS ──► student's inbox
                                    │                     │
                                    └──► Amazon CloudWatch ◄──┘
```

**AWS services and why each one:**

| Service | Job |
| --- | --- |
| **DynamoDB** | Single-table store for tasks, milestones, modules, preferences, notifications. GSI1 answers *"one student's tasks in a deadline window, in order"* with one Query and **zero Scans** |
| **Lambda** | Every handler, the scoring engine, the scheduled recompute, reminder dispatch. 50 functions on arm64 |
| **API Gateway** | REST front door with a JWT Lambda authoriser that injects `userId` — never read from the request body |
| **EventBridge** | Two rules, one Lambda: hourly rescore (so urgency advances overnight without the student opening the app) and the 08:00 SGT digest |
| **SNS** | Reminder delivery, with an SMTP fallback if SNS is outside the allowlist |
| **S3** | Two roles: assignment brief uploads via presigned PUT (files never pass through Lambda), and the static frontend bundle |
| **CloudFront** | HTTPS and global edge caching for the frontend, with Origin Access Control so the bucket stays entirely private |
| **CloudFormation** | The whole system is declared in two templates and reproducible from source |
| **CloudWatch** | Structured logs, 7-day retention, and a dashboard proving the chain executed on schedule |

**AI (bonus criteria):** OpenRouter free-tier model for natural-language parsing, brief extraction, explanation narration, and milestone breakdown — permitted explicitly by the relaxed bonus criteria. **Every AI feature has a deterministic fallback**, and the deployed environment currently runs with `AI_API_KEY` unset, so what you see live *is* the fallback path.

---

## Live deployment

| | |
| --- | --- |
| **Frontend** | `https://d3c6ivdcez723d.cloudfront.net` — CloudFront over a private S3 origin |
| **API** | `https://zwehtryy8k.execute-api.ap-southeast-1.amazonaws.com/prod` |
| **Region** | `ap-southeast-1` (Singapore) — matches the `Asia/Singapore` timezone deadlines are scored in |
| **Stacks** | `deadlineiq` (backend, 110 resources) · `deadlineiq-web` (frontend, 4 resources) |
| **Cost** | Inside the always-free tier for Lambda, DynamoDB, CloudFront, SNS, EventBridge and CloudWatch Logs |

Everything runs on AWS. There is no third-party hosting in the request path.

### Verifying it is genuinely live

```bash
aws dynamodb describe-table --table-name deadlineiq --query "Table.{Status:TableStatus,Index:GlobalSecondaryIndexes[0].IndexName}"
```

```bash
aws lambda list-functions --query "length(Functions[?starts_with(FunctionName,'deadlineiq')])"
```

```bash
aws events list-rules --query "Rules[?contains(Name,'deadlineiq')].{Name:Name,Schedule:ScheduleExpression,State:State}" --output table
```

A single login round-trip exercises API Gateway, the authoriser, Lambda and DynamoDB together:

```bash
curl -s -X POST "https://zwehtryy8k.execute-api.ap-southeast-1.amazonaws.com/prod/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"demo@nyp.edu.sg\",\"password\":\"demo1234\"}"
```

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
│   └── tests/            207 unit tests, including the scoring engine
│
├── deploy/
│   ├── lambda-role-trust.json     Lambda execution role trust policy
│   ├── lambda-role-policy.json    least-privilege permissions
│   ├── packaged-template.yaml     template.yaml with CodeUri resolved to S3
│   └── web.yaml                   S3 + CloudFront web tier
│
└── template.yaml         AWS SAM — one shared stack, four contributors
```

---

## Getting started

### Prerequisites

- Node.js 20.x or later
- AWS CLI v2, configured with credentials and a default region
- AWS SAM CLI (for building Lambda artifacts)
- An OpenRouter API key (free tier) — optional; everything works without it

### 1. Clone and install

```bash
git clone https://github.com/<org>/AWS-NYP-Cloud-Hackathon-2026.git
```

```bash
cd AWS-NYP-Cloud-Hackathon-2026 && npm install --prefix backend && npm install --prefix frontend
```

### 2. Run the tests

```bash
npm test --prefix backend
```

207 tests covering the scoring engine, crash-week detection, capacity modelling and the handler conventions — including an assertion that **no handler performs a DynamoDB Scan**.

### 3. Run locally

```bash
npm run dev:api --prefix backend
```

```bash
npm run dev --prefix frontend
```

The frontend defaults to `http://localhost:3001` for the API when `VITE_API_URL` is unset.

---

## Deployment

### One-time setup

Every Lambda assumes a shared execution role. In the AWS Academy Learner Lab this is the pre-provisioned `LabRole`; in a standard AWS account, create an equivalent:

```bash
aws iam create-role --role-name DeadlineIqLambdaRole --assume-role-policy-document file://deploy/lambda-role-trust.json
```

```bash
aws iam attach-role-policy --role-name DeadlineIqLambdaRole --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

```bash
aws iam put-role-policy --role-name DeadlineIqLambdaRole --policy-name DeadlineIqAccess --policy-document file://deploy/lambda-role-policy.json
```

The inline policy grants only what the handlers use: nine DynamoDB actions scoped to the `deadlineiq` table and its index, `GetObject`/`PutObject` on the briefs bucket, and `sns:Publish`. No wildcard actions.

### Backend

```bash
sam build
```

```bash
sam deploy --guided
```

<details>
<summary><strong>If <code>sam deploy</code> stalls</strong> — the packaging step can hang on some Windows environments</summary>

`template.yaml` carries `Transform: AWS::Serverless-2016-10-31`, which means **CloudFormation performs the SAM expansion server-side**. The CLI's only unique contribution is rewriting `CodeUri` to an S3 location, so that can be done by hand and the deploy driven directly.

Zip the build output, upload it, and point `deploy/packaged-template.yaml` at the object:

```bash
aws s3 cp backend-artifact.zip s3://<your-artifact-bucket>/deadlineiq-backend.zip
```

```bash
aws cloudformation deploy --template-file deploy/packaged-template.yaml --stack-name deadlineiq --region ap-southeast-1 --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND --parameter-overrides TableName=deadlineiq LambdaRoleName=DeadlineIqLambdaRole FrontendUrl=<cloudfront-url> JwtSecret=<secret> CronSecret=<secret> ReminderEmail=<address>
```

`CAPABILITY_AUTO_EXPAND` is what authorises CloudFormation to run the Serverless transform.

</details>

Note the `ApiUrl` output — it becomes `VITE_API_URL`.

### Frontend

Write the API URL into `frontend/.env.production`:

```
VITE_API_URL=https://<api-id>.execute-api.<region>.amazonaws.com/prod
VITE_ENV=production
```

```bash
npm run build --prefix frontend
```

```bash
aws cloudformation deploy --template-file deploy/web.yaml --stack-name deadlineiq-web --region ap-southeast-1 --parameter-overrides BucketName=deadlineiq-web-<account-id>
```

```bash
aws s3 sync frontend/dist s3://deadlineiq-web-<account-id> --delete
```

### Closing the CORS loop

The API's allowlist must name the exact frontend origin, which does not exist until CloudFront is created — so the backend is deployed twice, first with a placeholder and then with the real URL. Redeploy the backend with `FrontendUrl` set to the CloudFront URL, then publish the API Gateway stage:

```bash
aws apigateway create-deployment --rest-api-id <api-id> --stage-name prod
```

**This last step is not optional.** CloudFormation updates the API definition, but API Gateway only serves changes to a stage once a deployment is created. Skipping it leaves the `OPTIONS` preflight answering with the old origin while `POST` answers with the new one, and the browser blocks every request.

### Updating the frontend

```bash
npm run build --prefix frontend && aws s3 sync frontend/dist s3://deadlineiq-web-<account-id> --delete
```

```bash
aws cloudfront create-invalidation --distribution-id <distribution-id> --paths "/*"
```

Without the invalidation, CloudFront keeps serving the previous bundle from its edge caches.

### Seed the demo data

```bash
npm run seed --prefix backend
```

Wipes and reseeds the demo account with a deliberately brutal week: a 40%-weight report that mathematically does not fit in the available hours, a test needing three days of prep, two clashing assignments, one overdue task, and availability tuned so week 2 is unmistakably a crash week. **All dates are relative to `now`**, so the demo never goes stale.

---

## Environment variables

### Backend (Lambda / CloudFormation parameters)

| Variable | Purpose |
| --- | --- |
| `TABLE_NAME` | DynamoDB table name (`deadlineiq`) |
| `JWT_SECRET` | HS256 signing secret for auth tokens |
| `FRONTEND_URL` | Exact frontend origin — the CORS allowlist. Never `*`, no trailing slash |
| `AI_API_KEY` | OpenRouter key. **Leave unset to run on the deterministic fallbacks** |
| `AI_MODEL` | Free-tier chat model identifier |
| `S3_BUCKET` | Bucket for uploaded assignment briefs |
| `SNS_TOPIC_ARN` | Reminder topic (blank if using SMTP fallback) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Nodemailer fallback |
| `CRON_SECRET` | Gates the manual reminder trigger. Unset closes the route rather than opening it |
| `NODE_ENV` | `production` |

### Frontend (build-time)

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API Gateway invoke URL, no trailing slash |
| `VITE_ENV` | `production` |

Vite inlines these at build time, so changing either requires a rebuild and re-upload.

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

The live deployment currently runs with `AI_API_KEY` unset, so the fallback path is what is on display. Quality degrades — brief extraction guesses the title from the most prominent line of the PDF rather than reading the document — but nothing breaks.

A demo that dies on a rate limit loses to a duller demo that works.

---

## Security model

| Control | Implementation |
| --- | --- |
| **Authentication** | Self-managed JWT (HS256, 24 h) with `bcryptjs` password hashing at cost 10 |
| **Authorisation** | A Lambda authoriser validates every protected request and injects `userId` into the request context. **No handler reads `userId` from a request body** |
| **Tenant isolation** | Every function in `lib/dynamo/` takes `userId` as its first parameter and builds `PK = USER#<userId>` internally. No caller constructs a partition key by hand |
| **Existence disclosure** | Another student's task returns **404, not 403** — a 403 would confirm the item exists |
| **Account enumeration** | Login returns one generic message for both wrong-email and wrong-password |
| **Least privilege** | The Lambda execution role grants nine named DynamoDB actions, two S3 actions and one SNS action. No wildcards |
| **Origin control** | CORS is set to the exact frontend origin. The frontend S3 bucket blocks all public access; only CloudFront can read it, enforced by an Origin Access Control condition |
| **Secrets** | Never committed. Supplied as CloudFormation parameters with `NoEcho`, surfaced to Lambda as environment variables |

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
| **`bcryptjs` instead of `bcrypt`** | `bcrypt` is a native addon: a build on a Windows laptop does not produce a Linux/arm64 binary, and the deployed Lambda crashes. `bcryptjs` is pure JS with the same API and the same cost-10 hashes |
| **OpenRouter instead of Bedrock** | Bedrock is typically outside the Learner Lab allowlist; the bonus criteria were explicitly relaxed to permit other providers |
| **S3 + CloudFront instead of a hosting platform** | Keeps the entire request path on AWS, and Origin Access Control means the bucket is never publicly readable |
| **`.ics` export instead of Google Calendar OAuth** | Same user value in under an hour. OAuth consent screens are a notorious cause of live demo failure |
| **Every AI feature has a deterministic fallback** | Rate limits during judging are common. Degrade the quality of the answer, never the availability of the app |

Full reasoning, including what we deliberately did **not** build: [`HIGH_LEVEL_DESIGN.md` §14](HIGH_LEVEL_DESIGN.md).
