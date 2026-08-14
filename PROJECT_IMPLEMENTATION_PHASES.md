# DeadlineIQ — Project Implementation Phases

**Project:** DeadlineIQ — Academic Deadline Tracking & Prioritisation System
**Competition:** AWS × NYP Cloud Hackathon 2026 · Problem Statement PS-3
**Team:** Philena · Mahdiya · Hasini · Zoe

This document is the **build plan**: what gets built, in what order, by whom, and how we know it is finished. It is the operational counterpart to `HIGH_LEVEL_DESIGN.md` (structure) and `DeadlineIQ_Use_Cases.md` (behaviour).

Time is expressed as **hackathon hours from kickoff (H+0)**, assuming roughly a 24-hour build window. If your window differs, scale the hours — but **do not reorder the phases**. The dependency graph is the load-bearing part of this document, not the clock.

---

## Table of contents

1. [How to use this document](#1-how-to-use-this-document)
2. [Team, tracks, and ownership](#2-team-tracks-and-ownership)
3. [Working conventions](#3-working-conventions)
4. [Phase 0 — Hour zero blockers](#phase-0--hour-zero-blockers-h0--h1)
5. [Phase 1 — Foundations](#phase-1--foundations-h1--h4)
6. [Phase 2 — Core CRUD and scoring](#phase-2--core-crud-and-scoring-h4--h10)
7. [Phase 3 — AI narration and smart capture](#phase-3--ai-narration-and-smart-capture-h10--h16)
8. [Phase 4 — Differentiators](#phase-4--differentiators-h16--h22)
9. [Phase 5 — Polish, rehearsal, freeze](#phase-5--polish-rehearsal-freeze-h22--end)
10. [Dependency graph](#10-dependency-graph)
11. [Definition of done](#11-definition-of-done)
12. [Risk register](#12-risk-register)
13. [Cut list — what to sacrifice, in order](#13-cut-list--what-to-sacrifice-in-order)
14. [Demo script and rehearsal protocol](#14-demo-script-and-rehearsal-protocol)
15. [Judging preparation](#15-judging-preparation)

---

## 1. How to use this document

**Every ticket in Phases 1–4 has the same shape:**

> **[ID] Title** — *Owner* — *Depends on: X* — *Est: Nh*
> What to build, in enough detail that there is no ambiguity.
> **Done when:** the verifiable condition. Not "it works" — a specific, checkable statement.

**Before you start any ticket:**
1. Read `AGENTS.md` (every session — it is short).
2. Read the referenced UC section in `DeadlineIQ_Use_Cases.md` **end to end**, including alternative flows and error cases. The main flow alone is not the spec.
3. Check §6 of `HIGH_LEVEL_DESIGN.md` for the API contract if your ticket touches an endpoint.
4. If the ticket touches more than one handler, changes the data model, or adds an AWS resource — **post a short plan in the team channel first**.

**Ticket ID prefixes:** `P` = Philena, `M` = Mahdiya, `H` = Hasini, `Z` = Zoe, `T` = whole team.

---

## 2. Team, tracks, and ownership

| Member | Track | Owns | Primary UCs |
| --- | --- | --- | --- |
| **Philena** | Platform & Data | SAM template (shared sections), DynamoDB + GSI1, API Gateway, Lambda authoriser, auth, task CRUD, modules/prefs, seed script | UC-001, UC-002, UC-003, UC-004 |
| **Mahdiya** | Smart Capture | S3 bucket + presign, NL parser, brief extraction, bulk import, progress logging | UC-005, UC-006, UC-007, UC-008 |
| **Hasini** | Intelligence | **Scoring engine (shared library)**, explanations, Focus Mode, milestones, crash weeks, daily plan, weight tuning, heatmap, shared `chartTheme.ts` | UC-009 – UC-015, UC-018 |
| **Zoe** | Experience & Notifications | Hour-zero Learner Lab audit, dashboard, calendar/timeline, EventBridge + reminder Lambda, SNS/SMTP, notification prefs, overdue handling, completed view, `.ics` export | UC-016, UC-017, UC-019 – UC-023 |

### 2.1 Why the split is drawn here

- **Hasini owns UC-018 (heatmap) even though it is a view**, because she already computes the crash-week data in UC-013. Routing the visualisation through a different person would create a handoff boundary for no benefit.
- **Hasini owns `frontend/src/lib/chartTheme.ts`** — the shared Chart.js theme that Zoe's UC-016 and UC-017 import. One person owns the visual language of every chart so module colours stay consistent across all views.
- **Zoe owns the hour-zero audit** because her entire track (notifications) is the one most likely to be blocked by the Learner Lab allowlist. She needs the answer first and everyone else needs her answer.
- **Philena owns the SAM template's shared sections but does not gate anyone.** After H+4, each member adds their own function definitions and deploys independently.

### 2.2 Deploy ownership

| Resource | Owner |
| --- | --- |
| `template.yaml` shared sections (table, GSI1, API, authoriser, globals) | Philena |
| Auth / tasks / modules / prefs Lambdas | Philena |
| S3 bucket, presign, parse, extract, bulk-import Lambdas | Mahdiya |
| Scoring library (imported, not deployed alone), explain / focus / milestones / workload / weights Lambdas | Hasini |
| EventBridge rules, reminder Lambda, SNS topic, notification / overdue / completed / export Lambdas | Zoe |

**Everyone runs `sam deploy` themselves against the same stack.** Nobody waits.

---

## 3. Working conventions

### 3.1 Git

- `main` is protected. Work on `feat/<member>-<uc>` branches, e.g. `feat/hasini-uc009-scoring`.
- Commit early and often. Small commits survive a bad merge; a six-hour commit does not.
- PR description must name the UC and state which error cases are implemented and which are consciously cut.
- **Merge `main` into your branch at least every 2 hours.** `template.yaml` conflicts get worse the longer you wait.

### 3.2 `template.yaml` conflict protocol

The single highest-friction file. Convention:

```yaml
Resources:
  # ===== SHARED — Philena only =====
  ...table, GSI, API, authoriser...

  # ===== PHILENA =====
  # ===== MAHDIYA =====
  # ===== HASINI =====
  # ===== ZOE =====
```

Add your functions **inside your own block only**. If you need a change to a shared section, ask Philena — do not edit it directly.

### 3.3 Definition of "blocked"

If you are blocked for more than **15 minutes**, say so in the team channel. At hackathon timescales, a silent blocked hour is 4% of the entire build.

### 3.4 Checkpoints

Whole-team sync at **H+4, H+10, H+16, H+22**. Five minutes, standing. Three questions each:
1. What is deployed and working?
2. What are you blocked on?
3. What are you cutting?

---

## Phase 0 — Hour zero blockers (H+0 → H+1)

**Nothing else starts until these are done.** These are the decisions that, discovered late, are fatal.

> **[T-01] Learner Lab service audit** — *Zoe* — *Est: 30 min* — 🔴 **BLOCKS EVERYTHING**
> Log into the AWS Academy Learner Lab. Attempt to create or at minimum list each service. Record the result for: **Lambda, DynamoDB, API Gateway, EventBridge, S3, SNS, CloudWatch** (expected available) and **Cognito, SES, Textract, Bedrock** (expected unavailable).
> **Done when:** a written allowlist is posted in the team channel, and every member has acknowledged it.

> **[T-02] Notification path decision** — *Zoe* — *Depends on: T-01* — *Est: 30 min* — 🔴 **BLOCKS UC-019/020**
> Based on T-01, decide the delivery path: **SNS** (create a topic, subscribe an email, confirm the subscription actually arrives) or **Nodemailer SMTP** via Gmail app password / Resend. Test that a message actually reaches an inbox.
> **Done when:** one real email has arrived in a real inbox, and the decision is posted. **No reminder code is written before this.**

> **[T-03] Repository and docs** — *Philena* — *Est: 20 min*
> Create the GitHub repo, invite all four members, protect `main`. Ensure `AGENTS.md`, `CLAUDE.md`, `.kiro/steering/00-read-agents-first.md`, `HIGH_LEVEL_DESIGN.md`, `PROJECT_IMPLEMENTATION_PHASES.md`, `DeadlineIQ_Use_Cases.md` and `README.md` are all on `main`.
> **Done when:** every member has cloned the repo and can see all seven documents.

> **[T-04] Toolchain** — *All four* — *Est: 30 min, parallel*
> Node 20.x · AWS CLI · SAM CLI · `aws configure` with Learner Lab credentials.
> **Done when:** every member has run `aws sts get-caller-identity` successfully and pasted the (redacted) output in the channel.

> **[T-05] Read the spec** — *All four* — *Est: 30 min, parallel*
> Read `AGENTS.md` in full. Read **UC-009 in `DeadlineIQ_Use_Cases.md`** and **§7 of `HIGH_LEVEL_DESIGN.md`**. Read your own track's UCs.
> **Done when:** each member can state the five sub-scores and the default weights from memory. Test each other. This is not ceremony — judges ask the person who did not build the feature.

> **[T-06] Accounts and keys** — *Mahdiya (AI), Philena (Vercel)* — *Est: 20 min*
> OpenRouter account + API key for a free-tier model; Vercel account linked to the repo.
> **Done when:** a `curl` to OpenRouter returns a completion, and a placeholder Vercel deploy is live at a URL.

**Phase 0 exit criteria (H+1):**
- [ ] Allowlist known and posted
- [ ] Notification path decided and a test email received
- [ ] All four authenticated to AWS
- [ ] All four have read `AGENTS.md` and UC-009
- [ ] OpenRouter key works; Vercel project exists

---

## Phase 1 — Foundations (H+1 → H+4)

**Goal:** a deployed, authenticated skeleton that every other member can plug into. Philena is on the critical path; the others build things that need no backend.

### Philena — critical path

> **[P-01] SAM template — shared scaffolding** — *Est: 60 min* — 🔴 **BLOCKS ALL BACKEND WORK**
> `template.yaml` with: DynamoDB table `deadlineiq` (PK/SK strings, on-demand billing) and **GSI1 `deadline-index`** (`GSI1PK`/`GSI1SK`, projection ALL); API Gateway REST API with CORS restricted to `FRONTEND_URL`; a Lambda authoriser function; Globals block (Node 20.x, arm64, 256 MB, 10 s); the four member comment blocks from §3.2.
> **Done when:** `sam deploy` succeeds and the table is visible in the DynamoDB console with GSI1 in `ACTIVE` state.

> **[P-02] Shared backend libraries** — *Est: 45 min* — 🔴 **BLOCKS ALL HANDLERS**
> - `lib/dynamo/client.js` — module-scoped `DynamoDBDocumentClient`, retry wrapper (3 attempts, exponential backoff on throttling).
> - `lib/dynamo/tasks.js` — `getTasksInWindow(userId, from, to)`, `getAllForUser(userId)`, `putTask`, `patchTask(userId, taskId, changes, expectedUpdatedAt)`. **Every function takes `userId` first and builds `USER#${userId}` internally.**
> - `lib/http.js` — `ok(status, body)`, `fail(status, code, message)` emitting the `{code, message}` shape from HLD §6.1.
> - `lib/validate.js` — thin schema validator (Joi or Zod; pick one and tell the team).
> **Done when:** a scratch handler can write and read a task, and a validation failure returns `{"code":"validation_failed","message":"..."}`.

> **[P-03] Auth — UC-001** — *Depends on: P-02* — *Est: 60 min*
> `lib/auth/jwt.js` (sign/verify HS256, 24 h, `sub = userId`); `authorizer/index.js` returning an Allow policy plus `context.userId`; handlers `auth/register`, `auth/login`, `auth/refresh`, `users/me`.
> Register writes `PROFILE` + `PREFS` (defaults per HLD §5.3.2) + `EMAIL#<email>` uniqueness guard in a single `TransactWriteItems`. bcrypt cost 10. Login returns one generic message for both failure modes (**no account enumeration**).
> **Done when:** register → login → `GET /api/users/me` round-trips against the deployed API, and a second register with the same email returns `409 email_exists` with no orphan items written.

> **[P-04] Frontend shell** — *Est: 60 min*
> Vite + React + Tailwind + React Router. `lib/api.ts` (axios, bearer interceptor, 401 → silent refresh → redirect preserving form state in `sessionStorage`), `lib/auth.ts`, `context/AuthContext.tsx`, pages `Login`, `Register`, `Dashboard` (empty state with the three onboarding routes from UC-016 Alt A), app shell with nav.
> **Done when:** deployed on Vercel; a real user can register, log in, land on an empty dashboard, refresh the page and stay logged in.

> **[P-05] Wire the two URLs** — *Depends on: P-01, P-04* — *Est: 15 min*
> API invoke URL → Vercel `VITE_API_URL`. Vercel URL → Lambda `FRONTEND_URL`. Post both in the team channel.
> **Done when:** the deployed frontend successfully calls the deployed backend with no CORS error.

### Parallel work — no backend dependency

> **[H-01] Scoring engine — UC-009** — *Hasini* — *Est: 120 min* — ⭐ **THE PRODUCT**
> `backend/lib/scoring/` per HLD §4.4. **Pure functions.** Signature `score(tasks, prefs, now) → tasks[]` with `priorityScore`, `subScores`, `tight`, `dataGap`. Implement all five sub-scores exactly as specified in HLD §7.2, plus weight normalisation, tie-breaking (score → `dueAt` → `gradeWeight` → `taskId`), the neutral-50 substitution for missing data (UC-009 Alt A), the `max(availableHours, 0.5)` floor (Alt B), and `unscoreable` handling for malformed `dueAt` (E1).
> Also `availability.js` — `availableHoursBetween(from, to, prefs)` accounting for per-weekday hours and blocked dates. **UC-013 and UC-014 will both import this**, so get it right once.
> **Done when:** `backend/tests/scoring.test.js` passes with no AWS mock and no network, **including a test that reproduces the worked example in HLD §7.4 to a priority score of 73.5 ± 0.1.**

> **[H-02] Chart theme** — *Hasini* — *Est: 30 min*
> `frontend/src/lib/chartTheme.ts` — fixed accessible module colour palette, shared Chart.js defaults (fonts, grid, tooltip), a `moduleColour(code)` helper that is stable across renders.
> **Done when:** committed to `main` and announced. Zoe imports it in Phase 2; nobody hard-codes a chart colour anywhere.

> **[M-01] Parser groundwork** — *Mahdiya* — *Est: 60 min*
> Draft the strict JSON response schema for UC-005 (HLD §8.3). Prove `chrono-node` resolves "next friday 11:59pm" correctly against a fixed reference date **in the Asia/Singapore timezone**. Prove `pdfjs-dist` extracts text from a real assignment brief in the browser.
> **Done when:** a local scratch script prints correctly parsed dates for six representative phrasings, and PDF text extraction works on the actual brief you intend to demo.

> **[Z-01] Notification plumbing** — *Zoe* — *Depends on: T-02* — *Est: 45 min*
> `backend/lib/notify/send.js` — the single `send({userId, channel, subject, body})` function that switches on `SNS_TOPIC_ARN` vs `SMTP_HOST` and always writes the in-app `NOTIF#` item.
> **Done when:** calling `send()` from a scratch Lambda delivers a real email **and** writes a `NOTIF#` item. **No other member ever imports the SNS SDK or Nodemailer.**

> **[Z-02] Dashboard layout design** — *Zoe* — *Est: 45 min*
> Sketch UC-016 against its numbered main-flow elements: NEXT UP, THIS WEEK capacity bar, COUNTS, ALERTS, then the ranked list. Decide the row anatomy (priority badge, title, module chip, type icon, countdown text, progress ring, `tight` warning icon).
> **Done when:** a sketch or wireframe is posted and agreed. UC-016's postcondition says the student sees their whole situation in five seconds — that is a layout problem, solved now, not at H+20.

**Phase 1 exit criteria (H+4):**
- [ ] SAM stack deployed; GSI1 `ACTIVE`
- [ ] Register → login → empty dashboard round-trips on **deployed** URLs
- [ ] Scoring engine unit tests pass, including the §7.4 worked example
- [ ] `chartTheme.ts` on `main`
- [ ] `notify.send()` delivers a real email
- [ ] Every member can now `sam deploy` their own functions

---

## Phase 2 — Core CRUD and scoring (H+4 → H+10)

**Goal: a demonstrable product with no AI whatsoever.** By the end of this phase, a student can add tasks, see them ranked by the real five-factor formula, and reorder that ranking with the weight sliders. If everything after this phase failed, we would still have something to show.

### Philena

> **[P-06] Create task — UC-002** — *Depends on: P-03, H-01* — *Est: 75 min*
> `POST /api/tasks`. Smart defaults by type (HLD §5.5), full validation, `GSI1SK = DUE#<iso>`, `source = 'form'`. Synchronously invokes the scoring engine across the active set and returns the created task **with `priorityScore` and `subScores`**, plus the updated `ranking[]`.
> Alt A (past deadline → offer `overdue`), Alt B (near-duplicate soft warning, `409 duplicate_suspected`, never blocks), Alt C (inline module creation). E2 (module over 100% weight → non-blocking amber warning). **E4: scoring failure must not block creation** — save with `priorityScore = null` and a "score pending" badge.
> **Done when:** creating a task returns a real score, and creating one with `AI_API_KEY` unset and the scoring library deliberately throwing still saves the task.

> **[P-07] Edit / delete / restore — UC-003** — *Est: 60 min*
> `PATCH` with `expectedUpdatedAt` conditional write (`409 stale_write` on mismatch — UC-003 E2). Partial `UpdateExpression`, **never a whole-item overwrite**. Re-score the **full active set** when `dueAt`, `effortHours`, `gradeWeight`, `prepDays` or `progressPct` change, and return `ranking[]` — because a deadline change alters other tasks' ClashPenalty. Soft delete (`status = 'deleted'`) + 10 s undo. Archive (Alt B). Alt A: milestone-shift offer when a deadline moves.
> **Done when:** editing a deadline visibly reorders **other** tasks in the list, and two browser tabs editing the same task produce a `stale_write` rather than a silent overwrite.

> **[P-08] Modules and availability — UC-004** — *Est: 60 min*
> Module CRUD with colours from `chartTheme.ts`. `PUT /api/prefs` with per-weekday availability sliders and blocked dates. **Availability change re-invokes scoring immediately** and returns `ranking[]`.
> Frontend must show the live consequence (UC-004 step 8): *"Reducing Thursday to 1 hour moved your IT2214 report from #3 to #1."*
> **Done when:** dragging an availability slider down measurably changes the ranking, and the UI names the change.

> **[P-09] Seed script** — *Est: 45 min* — ⭐ **DEMO CRITICAL**
> `backend/scripts/seed.js`, wired to `npm run seed`. Wipes and reseeds the demo account. **All dates relative to `now`.** Contents exactly per HLD §13.3 — the 40% tight report, the test with `prepDays = 3`, the group project, the two clashing assignments, the overdue task, and availability tuned so **week 2 is unmistakably a crash week**.
> **Done when:** `npm run seed` completes in under 10 seconds, is idempotent (run it three times, identical result), and the resulting dashboard shows a `tight` badge on the IT2214 report.

### Hasini

> **[H-03] Wire scoring into the write path** — *Depends on: P-06, H-01* — *Est: 30 min*
> Import `lib/scoring` into Philena's create/update/progress handlers. Persist `priorityScore` and the **full `subScores` object** on every affected task. Set `explanationStale = true` where the score moved more than 5 points.
> **Done when:** every task row in DynamoDB carries a populated `subScores` object after any write.

> **[H-04] Ranking endpoint** — *Est: 30 min*
> `GET /api/ranking` returning `{ranking[], computedAt, weights}`.
> **Done when:** it returns tasks sorted by `priorityScore` descending with correct tie-breaking.

> **[H-05] Weight tuning — UC-015** — *Est: 75 min* — ⭐ **DEMO CRITICAL**
> `PUT /api/prefs/weights` (auto-normalises to sum 1.0). Frontend: five sliders, **live preview of the top 5 recomputed entirely client-side from persisted `subScores`** — no network call, no model call, reorder in under 16 ms with animated transitions. Four presets: Balanced, Grade-focused, Deadline-focused, Anti-procrastination. "Reset to default" always available. Alt A: a zero weight removes that bar from every explanation breakdown. Alt B: "no change to your top 5" note when a drag reorders nothing.
> **Done when:** dragging Stakes down reorders the preview instantly with the network tab open and **no request fired**. This is the fastest proof to a judge that the formula is real.

### Zoe

> **[Z-03] Dashboard — UC-016** — *Depends on: H-04, Z-02* — *Est: 120 min* — ⭐ **DEMO CRITICAL**
> All four above-the-fold elements: NEXT UP (task #1, live countdown, explanation slot, links to Focus Mode), THIS WEEK (required vs available capacity bar — amber above 80%, red above 100%), COUNTS (due in 7 days / overdue / completed this week), ALERTS (crash-week card slot, filled in Phase 4).
> Ranked list **sorted by `priorityScore` descending by default — not by deadline**. Row anatomy per Z-02. Countdown text in the brief's exact wording: `"Test in 3 days"`, `"Assignment due in 24 hours"`. Expanding a row reveals the sub-score contribution bar in place. Filters and sorts persist across navigation.
> E1: ranking timeout → render cached list in deadline order with a banner and retry. E3: countdown crossing zero transitions the row to overdue **live, without reload**.
> **Done when:** the dashboard renders correctly with 0 tasks, 1 task, and the full seeded dataset, and is fully interactive within 5 seconds on venue wifi.

> **[Z-04] Calendar and timeline — UC-017** — *Est: 90 min*
> Week/month calendar positioned by deadline, coloured by module (via `chartTheme.ts`), priority badge on each entry. Timeline view rendering each task as a **horizontal span from recommended start date to deadline** — the work period, not just the endpoint. Today marked with a vertical line; begun spans shaded to show elapsed time versus recorded progress. Alt A: no milestones → back-calculated span with a dashed border labelled "estimated work period".
> **Done when:** the timeline visibly distinguishes a task that is behind pace from one that is on track, and clicking any entry opens the task detail.

### Mahdiya

> **[M-02] Quick-add bar, deterministic path — UC-005 (part 1)** — *Est: 90 min*
> Always-visible quick-add bar. `POST /api/parse` implemented with **`chrono-node` + regex only** (no LLM yet). Returns the field/confidence/source shape from HLD §6.2 so the contract is fixed before the AI lands. Confirmation card UI: every field editable, `< 0.7` amber with the source phrase shown beneath.
> **Done when:** typing *"IT2214 report due next friday 11:59pm, 30%, 9 hours"* produces a correct confirmation card **with no AI involved at all**.

> **[M-03] Progress logging — UC-008** — *Depends on: P-06* — *Est: 75 min*
> `POST /api/tasks/{taskId}/progress`. Percentage slider, hour logging, progress history entries. Recomputes `remainingHours` and re-invokes scoring across the active set. Completion at 100% → `status = 'completed'`, `completedAt`, on-time/late computed. Alt A: `hoursSpent > effortHours` while below 100% → "taking longer than estimated, update your estimate?" Alt B: progress may decrease.
> **Done when:** logging progress reorders the ranking within one second, and the reorder is animated so the consequence is visible.

**Phase 2 exit criteria (H+10) — the "we have a demo" gate:**
- [ ] A fresh account can add tasks via the form **and** via quick-add
- [ ] Tasks are ranked by real five-factor priority scores
- [ ] Weight sliders reorder the top 5 live with no network call
- [ ] Dashboard, calendar and timeline all render the seeded dataset
- [ ] Progress logging visibly reorders the ranking
- [ ] `npm run seed` produces the crash-week dataset
- [ ] **The entire product works with zero AI.**

---

## Phase 3 — AI narration and smart capture (H+10 → H+16)

**Goal:** add the LLM. Every feature in this phase enhances something that already works. Nothing here can break Phase 2.

> **Rule for this entire phase:** no ticket is done until its fallback is done. Ship the fallback in the same commit as the AI path, not afterwards.

### Hasini

> **[H-06] Explanation generation — UC-010** — *Est: 90 min* — ⭐ **THE THESIS**
> `POST /api/explain` (batched over `taskIds[]`). Identify the two or three highest **weighted contributions** (sub-score × weight — *not* raw sub-score). Send **only numbers** — labels, values, weighted contributions, and supporting figures. **The task title and notes are never sent.**
> Prompt constraints: exactly one sentence, max 30 words, must cite supplied figures, must introduce no number absent from the payload.
> **Validation (HLD §8.4): word count ≤ 30, and every numeral in the output must exist in the input.** Fail either check → discard and use the template.
> Cache on a hash of `subScores`; serve cached with no model call when unchanged (Alt A). **`POST /api/explain` never returns an error** — it returns template sentences with `source: 'template'`.
> Frontend: sentence rendered directly above the stacked contribution bar, so words and arithmetic are visible together.
> **Done when:** with `AI_API_KEY` unset, explanations still render and the UI is visually identical, and a deliberately hallucinated response containing a figure not in the payload is rejected by the validator.

> **[H-07] Focus Mode — UC-011** — *Depends on: H-06* — *Est: 90 min* — ⭐ **THE EMOTIONAL CORE**
> One card, full screen, no scrolling. Task #1 — or, if it has milestones, **its next incomplete milestone**. Title, module colour, live countdown, the UC-010 sentence, and the stacked sub-score bar with hoverable underlying figures.
> Four actions: **Start** (session timer, prefills UC-008 on stop), **Progress** (inline slider), **Not now** (reveals task #2 **with a one-line reason it ranked lower**), **Done**.
> Alt A: all complete → "Nothing due — you're ahead" with the next start-by date. Alt B: group task blocked on a teammate → skipped with a visible note. E3: overnight timer → "Was that a 9-hour session?" rather than silently logging it.
> **Done when:** Focus Mode opens in under a second (explanations pre-warmed), and "Not now" always states why the next task ranked below the previous one.

### Mahdiya

> **[M-04] Quick add, AI path — UC-005 (part 2)** — *Depends on: M-02* — *Est: 75 min*
> LLM primary via `lib/ai/client` (6 s timeout), **`chrono-node` + regex fallback on `AiUnavailable`**. Prompt must include the current date and `Asia/Singapore` timezone so relative dates resolve — without it the model invents plausible wrong dates.
> E1: strip ``` fences, one re-parse, then fall back. E2: confidence < 0.5 never auto-accepted. E3: nonsensical input → worked example. E4: resolved past date → amber, ask whether they meant next year or are recording something overdue. Alt A: genuinely ambiguous "Friday" → present both dates as selectable chips rather than guessing. Alt C: multiple deadlines detected → route to UC-007.
> **Done when:** the demo phrase parses correctly with AI, **and** produces the same confirmation card (more amber) with `AI_API_KEY` unset.

### Zoe

> **[Z-05] Reminder Lambda and EventBridge — UC-019** — *Depends on: Z-01, H-01* — *Est: 120 min* — ⭐ **THE AWS STORY**
> Two EventBridge rules → one Lambda, distinguished by payload (`recompute` / `digest`). The recompute job queries GSI1 for tasks due in the next 14 days per user, **re-invokes Hasini's shared scoring library** (so Urgency and ProgressDeficit advance with time even when the student never opens the app), pre-warms explanations for the top 5, and applies reminder rules a–d.
> **Notification budget:** hard cap of 3/day (count `NOTIF#<today>#*` before sending), overflow absorbed into the next digest, quiet hours enforced **in the student's timezone**.
> **Idempotency:** `PutItem` with `ConditionExpression: attribute_not_exists(SK)` on `NOTIF#<date>#<taskId>#<rule>`.
> **Resumability:** paginate users, persist `CURSOR#<job>`, resume on the next invocation.
> E1: SNS failure → one retry after 3 s → in-app only with `delivered: false`. E4: scoring failure inside the run → still send using last persisted scores.
> Plus `POST /api/reminders/run` gated by `Bearer <CRON_SECRET>` for the live demo.
> **Done when:** the hourly rule has fired at least twice unattended, CloudWatch shows the invocations, a real reminder email has arrived, and invoking the manual trigger twice in a row sends exactly one email.

> **[Z-06] Notification preferences — UC-020** — *Est: 60 min*
> Channels, digest time, quiet hours, daily cap (1–5), per-type lead times (test 7 d, project 5 d, assignment 3 d, presentation 3 d), escalation toggle. **"Send test notification"** button dispatching through the real delivery path.
> Alt A: disabling all channels keeps in-app on regardless. Alt B: digest time inside quiet hours → warn and resolve visibly to 07:00. E1: failure reports the **specific** reason — this button exists to diagnose.
> **Done when:** the test button delivers a real email on stage in under 5 seconds. This is far more convincing to a judge than a screenshot.

**Phase 3 exit criteria (H+16):**
- [ ] Quick add works with real AI and degrades cleanly without it
- [ ] Explanations render on the top task, validated, cached
- [ ] Focus Mode opens instantly with a pre-warmed explanation
- [ ] Hourly recompute visible in CloudWatch, unattended
- [ ] A real reminder email has arrived
- [ ] 🔴 **KILL-SWITCH TEST:** `AI_API_KEY` removed → every screen still works

---

## Phase 4 — Differentiators (H+16 → H+22)

**Goal:** the features judges remember. Everything here is optional in the sense that the demo survives without any single one — but the crash-week heatmap (H-09/H-11) is the most screenshot-able thing in the product, so it is the last thing to cut.

### Hasini

> **[H-08] Milestone generation — UC-012** — *Est: 90 min*
> `POST /api/tasks/{id}/milestones/generate` returns a **proposal, writing nothing**. LLM proposes 3–6 milestones with names, hour allocations summing to `effortHours`, and internal deadlines. Accepts `deliverables[]` carried from UC-006.
> **Two constraints enforced in code, not in the prompt:** (i) the final milestone finishes at least one full day before the real deadline; (ii) no milestone lands on a zero-availability blocked day — shift to the previous available day.
> E1 fallback templates by type: `assignment → research·outline·draft·revise·submit`, `test → topics 1–3·topics 4–6·past papers·review`, `presentation → script·slides·rehearse·final run`, `project → plan·build·integrate·test·document`. E2: rescale hours proportionally if they do not sum. Alt B: under 3 h → decline gracefully.
> `PUT` saves all-or-nothing via `TransactWriteItems`. Milestones then drive `progressPct` in UC-008 and become spans on the UC-017 timeline and the next item in Focus Mode.
> **Done when:** a generated breakdown never lands on a blocked day, never finishes on the deadline itself, always sums to `effortHours`, and produces a sensible template breakdown with `AI_API_KEY` unset.

> **[H-09] Crash-week detection — UC-013** — *Depends on: H-01 availability lib* — *Est: 90 min* — ⭐ **DEMO CRITICAL**
> Bucket the next 12 weeks. Per week compute `requiredHours` (remaining hours of tasks due that week + milestone hours dated that week), `availableHours`, `loadRatio`. Flag `loadRatio > 1.0` as a crash week with the overload in hours.
> **Deterministic recommendation search:** find the largest-remaining-hours task in that week with the earliest possible start; compute hours that must move earlier to reach ratio ≤ 1.0; verify the receiving week has spare capacity, cascading further back if not. Express it concretely: *"Start your IT2214 report 4 days earlier and move 5 hours into the week of 17 Aug, which has 6 spare hours."*
> Apply → shifts/creates milestone dates and rescores. Dismiss → suppress for 48 h. Alt A: **no capacity anywhere → say so honestly** and suggest reducing scope on the lowest-stakes item. **Never invent a plan that cannot work.**
> **Done when:** the seeded dataset produces exactly one crash week, and Apply measurably lowers its `loadRatio`.

> **[H-10] Daily study plan — UC-014** — *Est: 75 min*
> `GET /api/plan/today`. Greedy allocation of today's available hours to the highest-priority incomplete **milestones** (falling back to whole tasks), subject to: minimum useful block of 45 minutes, maximum 3 hours on one item before switching, and `tight` tasks allocated first. One-line rationale per block. Overdue tasks excluded from hour allocation but shown above as a "resolve these first" strip.
> Alt A: zero hours today → show what shifts to tomorrow **and what that costs**. Alt B: spare capacity → "here's what you could start early".
> **Done when:** the plan never produces a block under 45 minutes and never allocates the whole day to one task.

> **[H-11] Workload heatmap — UC-018** — *Depends on: H-09* — *Est: 90 min* — ⭐ **MOST SCREENSHOT-ABLE VIEW**
> 12-week Chart.js matrix shaded by `loadRatio`: ≤0.5 green · 0.5–0.8 light · 0.8–1.0 amber · >1.0 red. Each cell labelled with week-commencing date and ratio. Crash weeks get a distinct border and their overload in hours ("+7 h over capacity"). Hover → tooltip listing contributing tasks with individual hour requirements. Click a crash week → the UC-013 card with Apply/Dismiss. Capacity line chart beneath overlaying required vs available across the same 12 weeks.
> Alt B: inline availability control so the grid re-shades live as the student drags — a wordless demonstration of the capacity model. E1: fully blocked week → hatched "unavailable", not a zero. E2: matrix failure → bar chart fallback.
> **Done when:** the seeded dataset makes week 2 unmistakably red, and adjusting availability re-shades the grid live. **Invest in making this beautiful.**

### Mahdiya

> **[M-05] Brief extraction — UC-006** — *Est: 120 min*
> S3 bucket with CORS for presigned PUT from `FRONTEND_URL`, 5-minute expiry, 5 MB cap, key namespaced by `userId`. Client-side text extraction (`pdfjs-dist` / `mammoth`) — **the file never passes through Lambda**. `POST /api/briefs/extract` returns fields **plus a verbatim source snippet per field**, plus `deliverables[]`.
> **Two-column review screen:** extracted value left, source snippet right. Alt A: image/scanned → vision path. Alt B: multiple dates → list every candidate with its surrounding sentence and ask which is the submission deadline — **never silently pick the first**. E2: unreadable → prefilled form with the filename as title, never a dead end. E3: no date → title and weight kept, deadline field empty and focused. E5: timeout → partial result with `degraded: true` and amber fields.
> Extracted `deliverables[]` are handed to UC-012 as pre-seeded milestone suggestions rather than discarded.
> **Done when:** it works on the **actual brief you will use on stage** — and that extraction result is cached as a demo fallback. PDF extraction is the single most common cause of a hackathon demo failing live.

> **[M-06] Bulk paste import — UC-007** — *Depends on: M-04* — *Est: 90 min*
> Split pasted text into candidate lines (newline/semicolon/bullet aware), discard lines with no date token, parse all lines in **one batched model call** (not one per line — free-tier rate limits). Review table, one row per task, every cell editable, tick box per row (all ticked by default), low-confidence cells amber. Write via `BatchWriteItem` chunked at 25. Single scoring pass afterwards, plus a summary linking to the crash week if one was created.
> Alt A: unparseable lines preserved verbatim in a "Couldn't read these" section — parseable rows still import. Alt B: duplicates pre-unticked with a tag so the default action is the safe one. E1: cap at 20 lines. E2: partial batch failure reports exactly how many of how many succeeded.
> **Done when:** pasting a realistic assessment schedule imports 5 tasks after review, and a partial failure leaves the successful rows saved and the failed rows flagged.

### Zoe

> **[Z-07] Overdue handling — UC-021** — *Est: 75 min*
> Status transition on the hourly run **and** on a live countdown crossing zero. Pinned to the top of every list with distinct red styling, Urgency pinned to 100. Three explicit resolutions: **Mark complete** (`lateSubmission = true`, feeds UC-022 stats), **Reschedule** (new deadline, back to `active`, rescored), **Archive** (removed from ranking **and from capacity calculations** so it stops distorting the heatmap). Resolution appended to history.
> Alt A: several overdue at once → one grouped "3 tasks are overdue" card with bulk resolution (three separate alerts would also breach the notification cap). Alt B: overdue > 30 days → prompt once, then auto-archive. E3: **all comparisons in the student's timezone** — a 23:59 SGT deadline evaluated in UTC would falsely show overdue at 16:00 SGT.
> **Done when:** the seeded overdue task is pinned red at the top, and archiving it measurably changes the heatmap.

> **[Z-08] Completed view and estimation accuracy — UC-022** — *Est: 75 min*
> Completed tasks grouped by week: title, module, completion date, on-time/late badge, estimated vs actual hours, grade weight. Three statistics: completed this week/month, on-time rate, and **estimation accuracy** (mean `hoursSpent / effortHours`). Requires at least 3 completed tasks — otherwise "not enough data yet (3 needed)", never a figure from one data point. E1: `hoursSpent = 0` excluded. E2: ratio > 5× excluded as a mis-log and flagged.
> **Feed-forward:** where accuracy deviates meaningfully from 1.0, UC-002 shows a hint at creation time — *"You usually need about 1.3× your estimate — consider 10 hours instead of 8."* Accepting pre-adjusts `effortHours`, which flows into a more realistic EffortPressure.
> **Done when:** the self-correcting loop is demonstrable: complete three tasks with over-run hours, then create a new one and see the hint.

> **[Z-09] Calendar export — UC-023** — *Est: 45 min*
> `.ics` generation with scope selection (all / module / range, optionally including milestones). Per task: module-prefixed title, deadline as event time, description carrying grade weight and effort estimate, `VALARM` at the student's configured lead time for that type. Alt A: tokenised read-only subscription URL, revocable from settings. E2: CSV fallback if `.ics` generation fails.
> **Done when:** the exported file imports cleanly into Google Calendar with the alarm intact.

**Phase 4 exit criteria (H+22):**
- [ ] Every UC in the spec has a working happy path
- [ ] The heatmap goes red on the seeded crash week
- [ ] The redistribution recommendation applies in one click and lightens the week
- [ ] Brief extraction works on the actual demo document (and is cached)
- [ ] The overdue task is pinned and resolvable three ways

---

## Phase 5 — Polish, rehearsal, freeze (H+22 → end)

> 🔴 **NO NEW FEATURES.** Anything not working at H+22 gets **disabled**, not fixed. A hidden broken feature costs nothing; a visible broken feature costs the demo.

> **[T-07] Seed and full walkthrough** — *All four* — *Est: 30 min*
> Run `npm run seed`. Walk the demo script (§14) end to end. Time it.
> **Done when:** the full script runs in under 3 minutes with no dead ends.

> **[T-08] 🔴 Kill-switch test** — *All four* — *Est: 30 min* — **MANDATORY**
> Remove `AI_API_KEY` from the deployed Lambda environment. Walk the **entire** demo again.
> Every screen must still work: template sentences (UC-010), `chrono-node` parse (UC-005), template milestones (UC-012), regex brief extract (UC-006).
> **If something breaks, fix the fallback — not the LLM.**
> **Done when:** the complete demo runs end to end with no AI key present, then the key is restored and the demo is walked once more.

> **[T-09] UC-009 drill** — *All four* — *Est: 20 min*
> Each member explains the five sub-scores, the weights, and why `prepDays` matters — aloud, in 45 seconds, unaided. **Rotate: quiz each other on the parts you did not build.** Judges routinely ask the person who did not build a feature.
> **Done when:** all four have done it cleanly, twice.

> **[T-10] CloudWatch evidence** — *Zoe* — *Est: 30 min*
> Build the four-widget dashboard (HLD §10.6). Confirm it shows a **real** hourly recompute that fired unattended, not a manual invocation.
> **Done when:** the dashboard is a bookmarkable URL you can open on stage in one click.

> **[T-11] Demo fallback assets** — *All four* — *Est: 45 min*
> - Cached UC-006 extraction result for the exact stage brief, swappable if the live call fails
> - Full screen recording of the working demo, in case venue wifi collapses
> - One-slide AWS pipeline diagram for the architecture beat
> - The demo account logged in on a second browser profile, seeded and ready
> **Done when:** all four assets exist on the presenting laptop, offline.

> **[T-12] Code freeze** — *All four* — at **H − 60 minutes**
> After this point: documentation, slides and rehearsal only. No merges to `main`.

> **[T-13] Final rehearsal ×2** — *All four* — *Est: 30 min*
> Twice, end to end, **on the actual venue wifi**, with the demo account's email inbox open for the "reminder that fired this morning" beat.
> **Done when:** both run-throughs come in under 3 minutes with no surprises.

---

## 10. Dependency graph

```
H+0 ═══ PHASE 0 ══════════════════════════════════════════════════════════
        [T-01] Learner Lab audit ──────┐  🔴 blocks everything
        [T-02] Notification path ──────┤  🔴 blocks Zoe's whole track
        [T-03] Repo  [T-04] Toolchain  │
        [T-05] Read spec  [T-06] Keys  │
                                       │
H+1 ═══ PHASE 1 ═══════════════════════▼══════════════════════════════════
                                                    
        [P-01] SAM template ─┐ 🔴 blocks all backend
        [P-02] Shared libs ──┤ 🔴 blocks all handlers
                             ├──► [P-03] Auth ──► [P-04] Shell ──► [P-05] Wire URLs
                             │
        PARALLEL (no backend dependency):
        [H-01] ⭐ Scoring engine + tests      [M-01] Parser groundwork
        [H-02] Chart theme                    [Z-01] notify.send()
                                              [Z-02] Dashboard layout
                             │
H+4 ═══ PHASE 2 ═════════════▼════════════════════════════════════════════
        SAM stack live — everyone deploys independently from here

        Philena          Hasini            Zoe               Mahdiya
        [P-06] Create ──►[H-03] Wire score
        [P-07] Edit      [H-04] Ranking ──►[Z-03] ⭐Dashboard
        [P-08] Modules   [H-05] ⭐Weights  [Z-04] Calendar    [M-02] Quick-add
        [P-09] ⭐Seed                                          (regex only)
                                                              [M-03] Progress
                             │
H+10 ══ PHASE 3 ═════════════▼════════════════════════════════════════════
        ✅ GATE: full product works with ZERO AI

        [H-06] ⭐Explanations ──► [H-07] ⭐Focus Mode
        [M-04] Quick-add AI path (+ chrono fallback)
        [Z-05] ⭐Reminder Lambda + EventBridge ──► [Z-06] Notif prefs
                             │
H+16 ══ PHASE 4 ═════════════▼════════════════════════════════════════════
        ✅ GATE: kill-switch test passes

        [H-08] Milestones     [M-05] Brief extract    [Z-07] Overdue
        [H-09] ⭐Crash weeks ─►[H-11] ⭐Heatmap        [Z-08] Completed
        [H-10] Daily plan     [M-06] Bulk import      [Z-09] .ics export
                             │
H+22 ══ PHASE 5 ═════════════▼════════════════════════════════════════════
        [T-07] Seed + walkthrough
        [T-08] 🔴 KILL-SWITCH TEST
        [T-09] UC-009 drill ×4
        [T-10] CloudWatch dashboard
        [T-11] Fallback assets
        [T-12] FREEZE at H−60min
        [T-13] Rehearse ×2 on venue wifi
                             │
                             ▼
                          JUDGING
```

### 10.1 The three hard blockers

If any of these slips, the phase after it cannot start:

| Blocker | Blocks | Mitigation if late |
| --- | --- | --- |
| **[T-01/T-02]** Learner Lab audit and notification decision | Everything / Zoe's whole track | Zoe starts on UC-016 dashboard instead and defers UC-019 by one phase |
| **[P-01/P-02]** SAM template and shared libraries | All backend handlers | Others work on pure-frontend and pure-library tickets (H-01, H-02, M-01, Z-02) — which is exactly why Phase 1 is structured that way |
| **[H-01]** Scoring engine | The product's entire thesis | Nothing else can substitute. If Hasini is blocked, a second member pairs on it immediately — this is the one ticket where doubling up is correct |

---

## 11. Definition of done

A use case is **not** done until all seven are true. "It works on my machine" satisfies none of them.

1. **Every step of the Main Flow** in `DeadlineIQ_Use_Cases.md` works end to end from the **deployed** frontend against the **deployed** backend.
2. **At least the primary Alternative Flow** works.
3. **Every named Error Case** either behaves as specified, or is a documented "cut for hackathon scope" with the reason stated in the PR description. Silent omission is not a cut — it is a bug.
4. **The Postcondition** is verifiable — in the DynamoDB console, in the UI, or in CloudWatch.
5. **If the UC is AI-dependent, the deterministic fallback works with `AI_API_KEY` unset.** Tested, not assumed.
6. **Deployed** to the shared SAM stack and to Vercel — not just running locally.
7. **No secrets in the diff.** `.env.example` updated if new variables were introduced, with names only and no values.

### 11.1 Review checklist (paste into every PR)

```
- [ ] UC section read end to end before coding
- [ ] Main flow works on deployed URLs
- [ ] Primary alternative flow works
- [ ] Error cases: implemented / consciously cut (list them)
- [ ] userId read from authoriser context, never from the body
- [ ] No Scan operations
- [ ] No LLM call on a read or write path (Class A/B)
- [ ] AI feature? Fallback works with AI_API_KEY unset
- [ ] No secrets; .env.example updated if needed
- [ ] Deployed and verified
```

---

## 12. Risk register

Ordered by expected cost (probability × impact).

| # | Risk | Likelihood | Impact | Owner | Mitigation |
| --- | --- | --- | --- | --- | --- |
| R-01 | **AI provider rate-limits during judging** | High | High | All | Deterministic fallback for all four AI features; kill-switch test [T-08] is a Phase 5 gate |
| R-02 | **PDF extraction fails live on stage** | High | Medium | Mahdiya | Test against the *actual* demo brief on day one [M-05]; cache the extraction result as a swap-in asset [T-11] |
| R-03 | **Learner Lab blocks a needed service** | Medium | High | Zoe | Hour-zero audit [T-01]; every fallback pre-decided (HLD §10.3, §14) |
| R-04 | **Venue wifi fails during the demo** | Medium | High | All | Full screen recording [T-11]; rehearse on venue wifi [T-13] |
| R-05 | **`template.yaml` merge conflicts stall deploys** | Medium | Medium | Philena | Disjoint member blocks (§3.2); merge `main` every 2 hours |
| R-06 | **Seed data goes stale between rehearsal and judging** | Medium | High | Philena | All dates relative to `now`; `npm run seed` immediately before the demo [T-07] |
| R-07 | **Scoring drift between the write path and the reminder Lambda** | Low | High | Hasini | One shared pure library imported by both; unit-tested in isolation [H-01] |
| R-08 | **Demo runs over 3 minutes** | Medium | Medium | Zoe (MC) | Timed rehearsals ×2; cut list (§13) agreed in advance |
| R-09 | **A judge asks the member who did not build UC-009** | High | Medium | All | [T-09] drill, rotated, twice |
| R-10 | **Timezone bug shows tasks falsely overdue on stage** | Medium | High | Zoe | All user-facing comparisons in the student's tz (HLD §10.2); explicitly tested in [Z-07] |
| R-11 | **Cross-account data leak found by a judge probing IDs** | Low | High | Philena | `userId` from authoriser only; partition-scoped queries; 404 not 403 (HLD §10.1) |
| R-12 | **$50 credit exhausted** | Low | High | All | No EC2/RDS/NAT/provisioned capacity; est. total spend < $5 (HLD §10.5) |
| R-13 | **Feature scope creep displaces rehearsal time** | High | Medium | All | Hard freeze at H−60min [T-12]; cut list (§13) |
| R-14 | **A member is blocked silently for hours** | Medium | Medium | All | 15-minute blocked rule (§3.3); four checkpoints |

---

## 13. Cut list — what to sacrifice, in order

Agreed **in advance**, so that cutting under time pressure is a decision rather than a panic. Cut from the top.

| Order | Cut | Cost of cutting | Never cut because |
| --- | --- | --- | --- |
| 1 | UC-023 `.ics` subscription feed (keep file export) | Negligible | — |
| 2 | UC-022 per-module estimation breakdown (keep the headline stat) | Small | — |
| 3 | UC-007 bulk paste import | Medium — high demo value, but UC-005 already proves the parser | — |
| 4 | UC-014 daily study plan | Medium — the heatmap already shows workload | — |
| 5 | UC-017 timeline view (keep the calendar) | Medium — the timeline is a genuine step up, but the heatmap covers workload | — |
| 6 | UC-012 milestone generation | High — Focus Mode falls back to whole tasks | — |
| 7 | UC-006 brief extraction | High — a headline innovation | — |
| — | **UC-009 scoring** | — | **It is the entire thesis** |
| — | **UC-010 explanations** | — | **It is the brief's explicit requirement** |
| — | **UC-011 Focus Mode** | — | **It is the emotional core of the demo** |
| — | **UC-015 weight sliders** | — | **It is the fastest proof the formula is not a black box** |
| — | **UC-018 heatmap + UC-013 crash weeks** | — | **It is the most memorable visual** |
| — | **UC-019 reminders** | — | **It is the AWS requirement, demonstrated end to end** |

---

## 14. Demo script and rehearsal protocol

Build toward this from hour one. **Under 3 minutes.** Rehearsed twice, timed, on venue wifi.

| Time | Beat | UC | What must be on screen |
| --- | --- | --- | --- |
| **0:00** | Dashboard loads. Four overlapping deadlines, one already red. *"This is a normal week in semester two."* | UC-016 | Ranked list sorted by priority, `tight` badge visible, overdue pinned |
| **0:20** | Paste into quick-add: *"IT2214 report due next Friday 11:59pm, 40% weighting, about 12 hours of work"* → confirmation card with parsed fields → confirm | UC-005 | Amber confidence highlighting, source phrase shown |
| **0:45** | Workload heatmap: week of 24 August turns **RED**, +7 hours over capacity | UC-018 | The 12-week grid, one unmistakable red cell |
| **1:05** | Open Focus Mode. One card. One task. The sentence: *"Top priority: worth 40% of IT2214, 12 hours of work left but only 6 free hours before Friday, and two other deadlines the same week."* Expand the sub-score bar underneath | UC-011, UC-010 | Sentence **and** stacked contribution bar together |
| **1:35** | *"But that's not a black box."* Open the weight sliders, drag Stakes down, watch the top 5 reorder live | UC-015 | Instant reorder, **network tab open showing no request** |
| **2:00** | Log 30% progress on the report → ranking visibly reorders, crash week lightens | UC-008 | Animated reorder within one second |
| **2:20** | Open the crash-week card: *"Start your IT2214 report 4 days earlier and move 5 hours into the week of 17 August."* Apply it | UC-013 | Heatmap cell visibly lightens after Apply |
| **2:40** | Show the reminder that fired this morning, and the CloudWatch log proving DynamoDB → EventBridge → Lambda → SNS | UC-019 | Real inbox, real CloudWatch dashboard |
| **2:55** | Close on the thesis: *"Every ranking in this system is arithmetic you can check. The AI writes the sentence. It never picks the order."* | — | — |

### 14.1 Rehearsal protocol

1. `npm run seed` **immediately** before every rehearsal and before the real demo.
2. Demo account already logged in on a **second browser profile** — never register live on stage.
3. Email inbox open in a background tab for the 2:40 beat.
4. CloudWatch dashboard open in another tab, bookmarked.
5. Screen recording ready to play if wifi collapses.
6. One person drives; the others do not touch the laptop.

---

## 15. Judging preparation

### 15.1 The three sentences every member must be able to say

**On the thesis:**
> *"Every ranking in this system is arithmetic you can check. The AI writes the sentence — it never picks the order."*

**On the AWS pipeline:**
> *"A task is written to DynamoDB by a Lambda behind API Gateway; an EventBridge rule wakes a scoring Lambda hourly; that Lambda queries the deadline GSI, recomputes priority, and publishes a reminder through SNS — and CloudWatch shows the whole chain."*

**On notification overload (the brief asks explicitly):**
> *"A hard cap of three per student per day, with the digest absorbing the overflow, and quiet hours enforced in the student's own timezone."*

### 15.2 Questions to expect, and where the answer lives

| Likely question | Answer | Reference |
| --- | --- | --- |
| "How does it decide what's most important?" | Five weighted factors, all deterministic. Walk the worked example. | HLD §7.4 |
| "Why is that task ranked above this one?" | Expand the row — the contribution bar shows exactly which factor dominated. | UC-010, UC-016 |
| "Is the AI making that decision?" | No. Show the weight sliders reordering with no network call. | UC-015 |
| "What if the AI is down?" | Demonstrate it — the kill-switch test is rehearsed. | HLD §8.5 |
| "How do you avoid spamming students?" | Three per day, digest absorbs overflow, quiet hours. | UC-019 §9.3 |
| "What happens when a student misses a deadline?" | Pinned red, Urgency 100, three explicit resolutions, archived tasks stop distorting capacity. | UC-021 |
| "What if the extracted deadline is wrong?" | Correction is a designed step — show the source-snippet review screen. | UC-006 |
| "Which AWS services, and why each?" | Point at the pipeline diagram; each service maps to one job. | HLD §2.6 |
| "Why DynamoDB and not a relational DB?" | Every hot query is one student's tasks in a deadline window — one Query on GSI1, zero Scans. | HLD §5.1 |
| "How is student data secured?" | `userId` from the authoriser only; partition-scoped queries make cross-account reads structurally impossible. | HLD §10.1 |
| "What would you build next?" | Shared team deadlines, Google Calendar OAuth, learned per-student weight tuning from completion history. | HLD §14 |

### 15.3 Final pre-demo checklist

```
[ ] npm run seed run, verified — tight badge + red crash week visible
[ ] Demo account logged in, second browser profile
[ ] Email inbox tab open
[ ] CloudWatch dashboard tab open
[ ] Screen recording ready offline
[ ] Cached brief-extraction fallback ready
[ ] Phone on silent, notifications off, laptop charged
[ ] All four rehearsed the UC-009 explanation
[ ] Code frozen — nobody is mid-merge
```
