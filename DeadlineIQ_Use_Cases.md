============================================================
DEADLINEIQ — ACADEMIC DEADLINE TRACKING & PRIORITISATION SYSTEM
USE CASES
============================================================
Problem statement: PS-3 (Assignment Deadline Tracker) — PRIMARY
                   AWS Service Integration Requirement — MANDATORY
                   AI Usage Bonus (5 marks, relaxed criteria) — TARGETED

Winning thesis:
  The brief states that "a higher-priority recommendation should be
  understandable rather than appearing arbitrary." Most teams will ship a
  CRUD app that sorts by nearest deadline. DeadlineIQ computes priority
  from a five-factor DETERMINISTIC formula and uses AI only to NARRATE
  that formula in plain English. Every ranking is reconstructable on a
  whiteboard. This is the differentiator — everything else supports it.

Use case allocation:
Philena (Platform & Data):    UC-001      (auth),
                              UC-002 (create task),
                               UC-003 (edit/delete/restore),
                               UC-004 (modules + study availability),
                               plus data model, API Gateway layer, IAM,
                               seed script, and the SHARED SAM template +
                               deploy pipeline used by every member.
                               NOTE: Philena owns the SAM template and the
                               DynamoDB/API Gateway skeleton, but does NOT
                               gate other members' function deploys — each
                               member deploys their own Lambdas against
                               the shared stack (see M2/M4 notes below).
Mahdiya (Smart Capture):      UC-005 (natural-language entry),
                               UC-006 (assignment brief extraction),
                               UC-007 (bulk paste import),
                               UC-008 (progress + study-hour logging).
                               NOTE: Mahdiya owns her own Lambda + S3
                               deploys end to end (parse handler, brief
                               extract handler, presigned upload). Once
                               Philena publishes the SAM template at hour
                               4, Mahdiya adds her functions to it and
                               runs `sam deploy` herself — no queueing.
Hasini (Intelligence):        UC-009 (priority scoring engine),
                               UC-010 (explanation generation),
                               UC-011 (Focus Mode), UC-012 (milestones),
                               UC-013 (crash-week detection),
                               UC-014 (daily study plan),
                               UC-015 (weight tuning),
                               UC-018 (workload heatmap).
                               NOTE: Hasini also owns the SHARED Chart.js
                               theme config (`src/lib/chartTheme.ts`),
                               which UC-016 and UC-017 import. Crash-week
                               data is her computation, so the heatmap
                               that visualises it lives with her rather
                               than crossing a handoff boundary.
Zoe (Experience + Notif):     UC-016 (dashboard + ranked list),
                               UC-017 (calendar + timeline),
                               UC-019 (scheduled reminder pipeline),
                               UC-020 (reminder preferences),
                               UC-021 (overdue handling),
                               UC-022 (completed tasks + estimation accuracy),
                               UC-023 (.ics export).
                               NOTE: Zoe owns her own EventBridge + SNS +
                               reminder Lambda deploys end to end. HOUR
                               ZERO TASK: confirm SNS/SES availability in
                               the Learner Lab and pick the delivery path
                               (SNS vs Nodemailer SMTP) before anyone
                               writes reminder code. This unblocks her
                               whole track and every other member depends
                               on the answer for the notification-touching
                               parts of their own UCs.

Actors:
  Student   — the sole human actor; creates tasks, records progress,
              consumes prioritisation and reminders
  System    — automated actor (scoring engine, AI parser/narrator,
              EventBridge-scheduled deadline checks, reminder dispatch)

Tools used throughout: React + Vite (Vercel), AWS Lambda + Amazon API
Gateway (Node.js backend), Amazon DynamoDB (single-table store), Amazon
EventBridge (scheduled deadline checks), Amazon S3 (assignment brief
uploads), Amazon CloudWatch (logs/metrics), Amazon SNS or SES for
notification delivery (see fallback note), Chart.js (charts + heatmap),
OpenRouter free-tier LLM (parsing, narration, milestone generation —
permitted under the relaxed AI bonus criteria), pdfjs-dist (client-side
PDF text extraction), chrono-node (deterministic date-parse fallback),
ics (calendar export), Tailwind CSS.

LEARNER LAB REALITY CHECK — HOUR ZERO, ZOE OWNS THIS:
  AWS Academy Learner Lab restricts the service allowlist and forces the
  pre-provisioned LabRole. BEFORE ANYONE WRITES CODE, Zoe logs in and
  confirms availability of: Lambda, DynamoDB, API Gateway, EventBridge,
  S3, SNS, CloudWatch. Amazon Cognito, SES, Textract and Bedrock are
  frequently NOT available in Learner Lab. Zoe reports the allowlist to
  the whole team in the first hour — Members 1, 2 and 4 all have
  fallback paths that depend on the answer. Fallbacks (already assumed):
    Cognito     → self-managed JWT (jsonwebtoken + bcrypt), users in DynamoDB
    SES         → SNS email subscription, or Nodemailer via Gmail SMTP / Resend
    Textract    → pdfjs-dist client-side text extraction + LLM field extraction
    Bedrock     → OpenRouter free model (explicitly permitted by the update)
  The $50 credit is comfortably sufficient for Lambda + DynamoDB +
  EventBridge + S3 at hackathon scale. Do not burn it on EC2 or RDS.

Core data-model decision:
  A single DynamoDB table `deadlineiq` holds every entity via a composite
  key with an entity-type discriminator on the sort key:

    PK = USER#<userId>
    SK = TASK#<taskId>        — an academic task
         MILESTONE#<taskId>#<milestoneId>
         MODULE#<moduleCode>
         PREFS                — reminder + availability + weight settings
         PROFILE              — credentials, display name

    GSI1 (deadline index):
      GSI1PK = USER#<userId>
      GSI1SK = DUE#<ISO8601 dueAt>

  Rationale: every hot query in this system is "give me one student's
  tasks within a deadline window, in deadline order." GSI1 answers that
  with a single Query and zero Scans, which is both cheap and a genuine
  architecture answer when a judge asks about data design.

  Task item fields:
    taskId, userId, title, module, type ('assignment' | 'test' |
    'project' | 'presentation'), dueAt, gradeWeight, effortHours,
    hoursSpent, progressPct, isGroup, prepDays, status ('active' |
    'completed' | 'overdue' | 'archived' | 'deleted'), notes,
    priorityScore, subScores {urgency, stakes, effortPressure,
    progressDeficit, clashPenalty}, explanation, explanationStale,
    createdAt, updatedAt, completedAt, source ('form' | 'nl' | 'brief' |
    'paste')

Required environment variables (Lambda configuration):
  TABLE_NAME              — DynamoDB table name (deadlineiq)
  JWT_SECRET              — Secret for signing auth tokens (Cognito fallback)
  FRONTEND_URL            — Vercel app URL (CORS allowlist)
  AI_API_KEY              — OpenRouter (or equivalent) API key
  AI_MODEL                — Model identifier, e.g. a free-tier chat model
  S3_BUCKET               — Bucket for uploaded assignment briefs
  SNS_TOPIC_ARN           — Topic for reminder delivery
  CRON_SECRET             — Shared secret validated by scheduled endpoints
  SMTP_HOST / SMTP_USER / SMTP_PASS — Nodemailer fallback if SNS/SES blocked
  NODE_ENV                — "production"

Required environment variables (Vercel dashboard):
  VITE_API_URL            — API Gateway invoke URL
  VITE_ENV                — "production"

Dependency order (build in this sequence):
  HOUR 0     Zoe confirms Learner Lab allowlist (SNS/SES path decided)
  HOUR 0–4   Philena: UC-001/UC-002 skeleton + SAM template + API contract
             frozen. Every other member's Lambdas plug into this stack.
    → UC-004 + UC-009 + UC-016 in parallel
    → UC-010 → UC-011
    → UC-005 / UC-012 / UC-017 / UC-019
    → UC-013, UC-018, UC-006
    → UC-007, UC-014, UC-015, UC-020..UC-023 as time allows
============================================================


────────────────────────────────────────────────────────────
UC-001: Student Registers and Authenticates
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: The React frontend is deployed on Vercel; API Gateway routes
              are live; the DynamoDB table exists with GSI1 provisioned;
              JWT_SECRET is set in the Lambda environment.

Main Flow:
  1. Student opens the app and selects "Create account".
  2. Student enters display name, email, and password (min 8 characters,
     strength meter shown live).
  3. System validates the email format and checks DynamoDB for an existing
     PROFILE item with that email (email-lookup GSI or deterministic key).
  4. System hashes the password with bcrypt (cost factor 10) and writes a
     PROFILE item: userId (uuid), email, displayName, passwordHash,
     createdAt.
  5. System writes a default PREFS item: study availability (3 h weekdays,
     5 h weekends), digest time 08:00 SGT, quiet hours 22:00–07:00,
     notification cap 3/day, default scoring weights.
  6. System issues a signed JWT (24 h expiry) containing sub = userId.
  7. Frontend stores the token and attaches it as a Bearer header on every
     subsequent request.
  8. A Lambda authoriser validates the token on every protected route and
     injects userId into the event context — the userId is NEVER read from
     the request body.
  9. Student lands on an empty dashboard with an onboarding prompt linking
     to UC-004 (set up modules and study availability) and UC-002 (add a
     first task).

Alternative Flow A — Returning student signs in:
  Student enters email and password → system fetches PROFILE, compares the
  bcrypt hash, issues a fresh JWT, and routes to the dashboard (UC-016)
  with the priority ranking already computed.

Alternative Flow B — Demo mode:
  Student clicks "Try the demo" → system authenticates a pre-seeded demo
  account (see Seed Script under Scheduled Jobs & Ops). Used for judging so
  a live signup never blocks the demo.

Error Cases:
  E1 — Email already registered: system returns 409 with "An account with
       this email already exists" and offers a sign-in link. No item written.
  E2 — Invalid credentials on sign-in: system returns a single generic
       message "Email or password is incorrect" — it does not disclose
       whether the email exists (no account enumeration).
  E3 — Token expired mid-session: frontend attempts a silent refresh; on
       failure it redirects to sign-in and preserves any in-progress form
       data in sessionStorage so nothing typed is lost.
  E4 — Student requests another student's task by guessing an ID: the
       Lambda scopes every DynamoDB call to PK = USER#<token userId>, so the
       item is not found and a 404 is returned (not 403 — existence is not
       leaked).
  E5 — DynamoDB throttling on write: system retries with exponential
       backoff (3 attempts); on final failure returns "Could not create your
       account — please try again."

Postcondition: A PROFILE item and a default PREFS item exist in DynamoDB
under PK = USER#<userId>. The student holds a valid JWT. Every subsequent
request is partition-scoped to that student, so no cross-account read is
structurally possible.


────────────────────────────────────────────────────────────
UC-002: Student Creates an Academic Task (Structured Form)
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated with a valid JWT; at least the
              default PREFS item exists; module list may be empty (modules
              can be created inline).

Main Flow:
  1. Student clicks "Add task" from any view.
  2. System opens a form with fields: title, module (autocomplete over the
     student's MODULE items, with "create new" inline), task type
     (assignment / test / project / presentation), deadline date, deadline
     time, grade weight (%), estimated effort (hours), individual or group,
     preparation days (tests/presentations), notes.
  3. System applies SMART DEFAULTS by task type so the student types as
     little as possible:
         assignment    → effortHours 8,  prepDays 0
         test          → effortHours 6,  prepDays 3
         project       → effortHours 15, prepDays 0
         presentation  → effortHours 5,  prepDays 1
     Grade weight defaults to the module's average unassigned weight.
     Deadline time defaults to 23:59 (the polytechnic norm).
     Every default is visibly editable and labelled "suggested".
  4. Student overrides any defaults and submits.
  5. System validates: title non-empty, dueAt is a valid future ISO8601
     timestamp, gradeWeight 0–100, effortHours > 0, type in enum.
  6. System writes a TASK item with PK = USER#<userId>,
     SK = TASK#<uuid>, GSI1SK = DUE#<dueAt>, status = 'active',
     progressPct = 0, hoursSpent = 0, source = 'form'.
  7. System synchronously invokes the scoring engine (UC-009) for the
     affected task set and persists priorityScore + subScores.
  8. System returns the created task with its score; the frontend inserts
     it into the ranked list with a brief highlight animation, and the
     ranking visibly reorders if the new task outranks existing ones.

Alternative Flow A — Deadline in the past (recording something already missed):
  System warns "This deadline has already passed — record it as overdue?"
  If confirmed, the task is created with status = 'overdue' and enters the
  UC-021 overdue flow rather than being rejected.

Alternative Flow B — Near-duplicate detected:
  If an active task exists with a similar title in the same module within
  ±7 days, system shows a soft warning "You may already have this: [title],
  due [date]" with "Create anyway" and "Open existing". It never blocks.

Alternative Flow C — Module does not exist yet:
  Student types a new module code → system offers "Create module IT2214"
  inline, writes a MODULE item with an auto-assigned colour, and continues
  the form without navigating away.

Error Cases:
  E1 — Required field missing: system highlights the field in red, shows an
       inline message, and moves focus to the first offending field. No
       write occurs.
  E2 — Grade weight pushes the module's cumulative assigned weight above
       100%: system shows a non-blocking warning "IT2214 is now at 115% of
       assessment weight — check your figures." Task is still created.
  E3 — DynamoDB write failure: system shows "Task could not be saved —
       please try again", retains the form contents, and writes nothing.
  E4 — Scoring engine unavailable (UC-009 error): task is saved with
       priorityScore = null and a "score pending" badge; the next scheduled
       recompute (UC-019) fills it in. Creation is never blocked by scoring.

Postcondition: A TASK item exists with status 'active', a computed
priorityScore and full subScores breakdown. The task is visible in the
dashboard, calendar, and workload heatmap, and is included in the next
reminder evaluation.


────────────────────────────────────────────────────────────
UC-003: Student Edits, Deletes, or Restores a Task
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; at least one TASK item exists under
              their partition.

Main Flow:
  1. Student opens a task from any view (list, calendar, heatmap, Focus
     Mode) to reach the task detail screen.
  2. System displays all fields, the milestone list (UC-012), the current
     priority explanation and sub-score breakdown (UC-010), and a change
     history.
  3. Student edits a field inline; the change is saved on blur with an
     optimistic UI update.
  4. System validates the changed field, writes a partial update
     (UpdateExpression, never a full-item overwrite), and refreshes
     updatedAt.
  5. If dueAt, effortHours, gradeWeight, prepDays or progressPct changed,
     system marks explanationStale = true and re-invokes UC-009 for the
     whole active task set (a deadline change alters the ClashPenalty of
     other tasks, so a single-task rescore is not sufficient).
  6. Frontend animates the reordering of the ranked list so the consequence
     of the edit is visible rather than silent.
  7. Student may click "Delete"; system asks for confirmation.
  8. On confirm, system performs a SOFT delete (status = 'deleted'), removes
     it from all views, and shows a toast with a 10-second "Undo".
  9. Clicking Undo within the window restores status to its previous value
     and re-inserts the task into the ranking.

Alternative Flow A — Student changes the deadline of a task with milestones:
  System detects that milestone dates now fall after the new deadline and
  offers "Shift milestones proportionally?" — accepting rescales all
  milestone dates to fit the new window with the one-day buffer preserved
  (see UC-012).

Alternative Flow B — Student archives instead of deleting:
  Student selects "Archive (no longer relevant)" → status = 'archived'. The
  task is removed from ranking and from workload capacity calculations but
  remains visible in the completed/archived view for the record.

Error Cases:
  E1 — Validation failure on an inline edit: the field reverts to its
       previous value, an inline error is shown, and the optimistic update
       is rolled back.
  E2 — Concurrent edit conflict (two tabs open): system uses a conditional
       write on updatedAt; on mismatch it shows "This task changed in
       another tab — reload to see the latest" rather than overwriting.
  E3 — Undo pressed after the soft-delete window closed: system shows "This
       task has already been removed" and offers a link to the archived view
       (the item is retained, never hard-deleted during the hackathon).
  E4 — Rescore fails after an edit: the edit is still committed; the task
       shows a "score pending" badge and the next scheduled recompute
       corrects it.

Postcondition: The TASK item reflects the student's changes, the ranking
across all active tasks has been recomputed, and any deletion is reversible
within the undo window and recoverable from the archive thereafter.


────────────────────────────────────────────────────────────
UC-004: Student Configures Modules, Grade Weights and Study Availability
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; a default PREFS item exists from
              UC-001.

Main Flow:
  1. Student opens "Setup" (also reachable from the onboarding prompt).
  2. Student adds each module: code (e.g. IT2214), name, colour, and total
     assessment weight available (default 100%).
  3. System writes a MODULE item per module. Colours are drawn from a fixed
     accessible palette and reused consistently across every chart, card and
     calendar entry in UC-016 to UC-018.
  4. Student sets study availability: hours available per weekday
     (Mon–Sun sliders, defaults 3 h weekdays / 5 h weekends).
  5. Student optionally blocks out unavailable dates — work shifts, CCA
     commitments, family events — as zero-availability days.
  6. System writes availability into the PREFS item.
  7. System immediately re-invokes UC-009, because availability is a direct
     input to the EffortPressure sub-score.
  8. Frontend shows a live preview: "Reducing Thursday to 1 hour moved your
     IT2214 report from #3 to #1." The consequence of the setting is shown,
     not hidden.

Alternative Flow A — Student skips setup:
  Defaults apply. The system operates fully, but tasks display a subtle
  "set your study hours for better ranking" hint on the EffortPressure row
  of the explanation breakdown.

Alternative Flow B — Module assessment weight over-allocated:
  Cumulative task grade weights for a module exceed its total → system
  displays an amber badge on that module in the setup list showing the
  overage. It is informational only and never blocks.

Error Cases:
  E1 — Duplicate module code: system shows "IT2214 already exists" and
       offers to open the existing module instead of creating a second.
  E2 — Availability set to zero for every day of the week: system warns
       "With no study hours, every task will be flagged as impossible —
       set at least some availability." Saving is allowed but flagged.
  E3 — PREFS write failure: system shows "Settings could not be saved" and
       reverts the sliders to their last persisted values.

Postcondition: MODULE items exist with consistent colours; the PREFS item
carries per-weekday availability and blocked dates. The scoring engine now
has a realistic capacity model, which is what makes EffortPressure
meaningful rather than cosmetic.


────────────────────────────────────────────────────────────
UC-005: Student Creates a Task by Natural Language  [AI BONUS]
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; AI_API_KEY and AI_MODEL are set in
              the Lambda environment; chrono-node is bundled as the
              deterministic fallback parser.

Main Flow:
  1. Student types into the always-visible quick-add bar, for example:
     "db report due next friday 11:59pm, 30% of IT2214, about 9 hours work".
  2. Frontend posts the raw string to POST /api/tasks/parse.
  3. Lambda builds a strict JSON-only prompt containing: the raw text, the
     CURRENT DATE AND TIMEZONE (Asia/Singapore) so relative dates resolve
     correctly, and the student's existing module codes for matching.
  4. The model returns a JSON object of extracted fields, each with a
     confidence value between 0 and 1: title, module, type, dueAt,
     gradeWeight, effortHours, isGroup.
  5. System validates the JSON against a schema, rejects any field outside
     its allowed range, and applies UC-002 smart defaults to fill gaps.
  6. System renders a CONFIRMATION CARD — every field editable, fields
     below 0.7 confidence highlighted amber with the source phrase shown
     beneath ("'next friday' → 22 Aug 2026, 23:59").
  7. Student edits anything wrong and clicks "Add task".
  8. System creates the task via the UC-002 write path with source = 'nl',
     then scores it (UC-009).

Alternative Flow A — Ambiguous relative date:
  If "Friday" could mean this week or next, the system presents both as
  selectable chips with explicit dates rather than silently guessing.

Alternative Flow B — Model unavailable, rate-limited, or times out (>6 s):
  System falls back to chrono-node for the date and regex for the module
  code, percentage and hour count. It prefills whatever it found into the
  full UC-002 form and shows "Smart parsing unavailable — please check
  these details." Task creation is never blocked by AI availability.

Alternative Flow C — Text contains multiple deadlines:
  System routes the input to the UC-007 bulk-import review table instead of
  the single-task confirmation card.

Error Cases:
  E1 — Model returns malformed JSON or wraps it in markdown fences: system
       strips ``` fences, attempts a re-parse, and on second failure invokes
       Alternative Flow B. The raw response is logged to CloudWatch.
  E2 — Model hallucinates a field not present in the input (e.g. invents a
       grade weight): validation flags any field with confidence < 0.5 as
       amber and never auto-accepts it. Confirmation is always required.
  E3 — Empty or nonsensical input: system shows "I couldn't find a task in
       that — try 'IT2214 report due Friday 11:59pm'" with a worked example.
  E4 — Resolved date is in the past: system flags it amber and asks whether
       the student meant next year or is recording an overdue task.

Postcondition: A TASK item exists with source = 'nl'. Nothing was written
without explicit student confirmation. This directly answers the brief's
question of "how students can correct incorrectly entered or extracted
deadlines" — correction is a designed step in the flow, not an afterthought.


────────────────────────────────────────────────────────────
UC-006: Student Extracts Deadlines from an Uploaded Assignment Brief  [AI BONUS]
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; S3_BUCKET is configured with a CORS
              policy permitting presigned uploads from FRONTEND_URL;
              pdfjs-dist is bundled in the frontend. Mahdiya deploys the
              S3 bucket + presign endpoint + extract handler herself against
              Philena's shared SAM stack — no wait on Philena.

Main Flow:
  1. Student drags an assignment brief (PDF, DOCX or image, ≤5 MB) into the
     upload zone.
  2. Frontend requests a presigned S3 PUT URL from the API and uploads the
     file directly to S3 — the file never passes through Lambda, avoiding
     payload limits.
  3. Frontend extracts raw text client-side using pdfjs-dist (PDF) or
     mammoth (DOCX). For images, or if extraction yields under 50
     characters, the file is routed to the vision path in Alternative Flow A.
  4. Extracted text (truncated to a sensible token budget, prioritising the
     first two pages where deadlines almost always appear) is posted to
     POST /api/briefs/extract.
  5. Lambda prompts the model to return JSON: title, dueAt, gradeWeight,
     deliverables[] (a list of required components), and for each field a
     verbatim SOURCE SNIPPET from the document.
  6. System renders a REVIEW SCREEN in two columns — extracted value on the
     left, the source snippet it came from on the right, so the student can
     verify each field against the actual wording of the brief.
  7. Student corrects anything wrong and confirms.
  8. System creates the task with source = 'brief' and stores the S3 object
     key on the task for later reference.
  9. The extracted deliverables[] list is handed to UC-012 as pre-seeded
     milestone suggestions rather than being discarded.

Alternative Flow A — Scanned or image-based document:
  System sends the image to a vision-capable model for text extraction, then
  continues from step 5. If the model is unavailable, see Error Case E2.

Alternative Flow B — Multiple dates found in the document:
  System lists every candidate date with its surrounding sentence and asks
  "Which of these is the submission deadline?" It never silently picks the
  first date it sees.

Error Cases:
  E1 — File exceeds 5 MB or has an unsupported extension: rejected
       client-side with "Please upload a PDF, Word document or image under
       5 MB." No S3 write occurs.
  E2 — Text extraction fails entirely (scanned, handwritten, or corrupt):
       system shows "I couldn't read this document" and opens the UC-002
       form prefilled with the filename as the title, so the upload is never
       a dead end.
  E3 — No date found anywhere in the document: system shows the extracted
       title and weight, leaves the deadline empty and focused, and prompts
       the student to enter it.
  E4 — S3 presigned upload fails: system retries once, then offers the
       UC-005 quick-add bar as an alternative route with a toast explaining
       the upload could not complete.
  E5 — Model call exceeds the Lambda timeout: the function returns a partial
       result with whatever regex extraction found and flags the response
       degraded = true; the review screen renders with amber fields.

Postcondition: A TASK item exists with source = 'brief', linked to the
stored S3 object, and with candidate milestones queued for UC-012. Every
extracted value was shown alongside its source text and confirmed by the
student before any write.

BUILD NOTE: test this against the ACTUAL brief you will use on stage on day
one, and cache that extraction result as a demo fallback. PDF extraction is
the single most common cause of a hackathon demo failing live.


────────────────────────────────────────────────────────────
UC-007: Student Bulk-Imports Deadlines from Pasted Text
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; UC-005 parsing is implemented and
              stable (this use case reuses its parser).

Main Flow:
  1. Student pastes a block of text — a lecture slide's assessment schedule,
     a group chat message, or a list of dates — into the bulk-import box.
  2. System splits the text into candidate lines (newline, semicolon, and
     bullet-marker aware) and discards lines with no date-like token.
  3. Each candidate line is parsed through the UC-005 pipeline in a single
     batched model call rather than one call per line, to stay within
     free-tier rate limits.
  4. System renders a REVIEW TABLE, one row per detected task, every cell
     editable inline, with a tick box per row (all ticked by default) and
     low-confidence cells highlighted amber.
  5. Student unticks rows they do not want, corrects any cells, and clicks
     "Import 5 tasks".
  6. System writes all ticked rows via BatchWriteItem (chunked at 25 items),
     each with source = 'paste'.
  7. System runs a single scoring pass (UC-009) across the full active set
     and shows the updated ranking, plus a summary: "5 tasks added — your
     workload for week of 24 Aug is now over capacity" linking to UC-013.

Alternative Flow A — Some lines unparseable:
  Unparseable lines appear in a separate "Couldn't read these" section below
  the table with the raw text preserved, so the student can copy them into
  the UC-002 form manually. The parseable rows still import.

Alternative Flow B — Duplicates against existing tasks:
  Rows matching an existing active task (same module, similar title, ±7
  days) are pre-unticked with a "possible duplicate" tag, so the default
  action is the safe one.

Error Cases:
  E1 — Paste exceeds 20 candidate lines: system processes the first 20 and
       shows "Showing the first 20 — import these, then paste the rest",
       protecting both the token budget and the review UX.
  E2 — Batch write partially fails: successfully written tasks are kept, the
       failed rows remain in the table flagged "not saved — retry", and the
       system reports exactly how many of how many succeeded.
  E3 — Batched model call is rate-limited: system falls back to chrono-node
       date extraction for every line, marks all rows amber, and tells the
       student to check each date before importing.

Postcondition: Multiple TASK items exist from a single paste, each having
passed through an editable review step. Nothing was imported without the
student seeing it first.

PRIORITY NOTE: build this ONLY after UC-005 is solid. It is very high demo
value for low incremental cost once the parser works, and worthless before.


────────────────────────────────────────────────────────────
UC-008: Student Updates Progress and Logs Study Hours
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; at least one active TASK item
              exists.

Main Flow:
  1. Student finishes a work session and opens the task, or uses the "Log
     progress" action directly from a dashboard card or from Focus Mode.
  2. Student sets progress by either: dragging a percentage slider, or
     ticking completed milestones (ticking auto-computes progressPct as
     completed milestone effort ÷ total milestone effort).
  3. Student optionally logs hours actually spent in this session.
  4. System updates progressPct, increments hoursSpent, and appends a
     progress-history entry (timestamp, previous %, new %, hours logged).
  5. System recomputes remainingHours = effortHours × (1 − progressPct/100)
     and re-invokes UC-009 across the active set.
  6. Frontend animates the ranking reorder within one second, so the student
     sees the direct consequence of their work.
  7. If progressPct reaches 100, system sets status = 'completed', records
     completedAt, computes on-time-or-late, and routes to the UC-022
     completion view with a brief celebration state.

Alternative Flow A — Student logs hours without changing progress:
  System accepts it, and if hoursSpent now exceeds effortHours while
  progress is below 100%, it prompts "This is taking longer than estimated —
  update your effort estimate?" Accepting revises effortHours upward, which
  correctly raises EffortPressure in the next score.

Alternative Flow B — Student reduces progress (over-reported earlier):
  System allows the decrease, logs it in progress history, and rescores. It
  never treats progress as monotonic.

Error Cases:
  E1 — Progress set above 100 or below 0: slider is hard-clamped; direct API
       calls are rejected with a 400 validation error.
  E2 — Update write fails: the optimistic UI change reverts, the slider
       returns to its persisted value, and a toast reads "Progress could not
       be saved — please try again."
  E3 — Milestone tick conflicts with a manually set percentage: system
       prefers the milestone-derived value and shows an inline note
       "Progress is now calculated from your milestones."

Postcondition: The task carries an accurate progressPct and hoursSpent,
a full progress history, and a freshly computed priority. Logged hours feed
the UC-022 estimation-accuracy loop. Progress is a direct input to the
ProgressDeficit sub-score, so under-reporting visibly raises urgency.


────────────────────────────────────────────────────────────
UC-009: System Computes an Explainable Priority Score   [CORE DIFFERENTIATOR]
────────────────────────────────────────────────────────────
Actor:        System
Precondition: Student has at least one active TASK item; the PREFS item
              carries study availability and scoring weights (defaults from
              UC-001 if never configured).
Trigger:      Any task create, edit, progress update, availability change,
              weight change, or the hourly EventBridge recompute (UC-019).

Main Flow:
  1. System loads all TASK items with status 'active' or 'overdue' via a
     single GSI1 Query, plus the PREFS item.
  2. For each task, system computes five sub-scores, each normalised to
     0–100:

     (a) URGENCY — how close the real start-by point is, not just the
         deadline. Tests that need preparation are effectively due earlier.
             effectiveDays = daysUntil(dueAt) − prepDays
             Urgency = 100 × e^(−0.25 × max(effectiveDays, 0))
             Overdue tasks are pinned to Urgency = 100.
         A test 5 days away needing 3 prep days scores as if it were 2 days
         away — which is the truth, and which a nearest-deadline sort misses
         entirely.

     (b) STAKES — how much of the module grade is at risk.
             Stakes = min(100, gradeWeight × 2.5)
         A 40% component saturates at 100. A 5% quiz scores 12.5.

     (c) EFFORT PRESSURE — whether the work still fits in the time left.
             remainingHours  = effortHours × (1 − progressPct / 100)
             availableHours  = Σ (daily availability from PREFS) over every
                               day between now and dueAt, minus blocked days
             ratio           = remainingHours / max(availableHours, 0.5)
             EffortPressure  = min(100, ratio × 70)
         A ratio above 1.0 means the task is MATHEMATICALLY IMPOSSIBLE in
         the time remaining at the student's stated availability, and the
         task is tagged `tight = true`. No competing team will have this
         metric, and it is the one judges remember.

     (d) PROGRESS DEFICIT — how far behind a steady pace the student is.
             expected = 100 × (now − createdAt) / (dueAt − createdAt)
             ProgressDeficit = max(0, expected − progressPct)
         Being 60% through the available time with 10% done scores 50.

     (e) CLASH PENALTY — deadline pile-up in the same window.
             n = count of other active tasks with dueAt within ±72 hours
             ClashPenalty = min(100, n × 30)

  3. System applies the student's weights (defaults shown; adjustable in
     UC-015):
         Priority = 0.30·Urgency + 0.25·Stakes + 0.20·EffortPressure
                  + 0.15·ProgressDeficit + 0.10·ClashPenalty
  4. System persists priorityScore AND the full subScores object on each
     TASK item, and sets explanationStale = true where the score changed
     materially (>5 points).
  5. System returns the ranked list with each task's sub-score breakdown
     attached, so UC-010 can narrate it and UC-016 can render it as a bar.
  6. Ties are broken by earliest dueAt, then by higher gradeWeight.

Alternative Flow A — Task missing gradeWeight or effortHours:
  System substitutes a neutral 50 for the affected sub-score and attaches a
  `dataGap` flag naming the missing field. The task card shows "add effort
  estimate for a better ranking". The engine degrades in quality, never in
  availability.

Alternative Flow B — Student has zero recorded availability for the window:
  availableHours floors at 0.5 to avoid a divide-by-zero, which pushes
  EffortPressure to 100 and correctly surfaces the task as impossible. The
  explanation names the availability gap as the cause.

Error Cases:
  E1 — dueAt is malformed or missing on a stored item: task is excluded from
       ranking, flagged `unscoreable`, and pinned to a "needs attention"
       strip at the top of the list rather than silently disappearing.
  E2 — Compute exceeds the Lambda timeout with a very large task set: system
       scores the nearest 100 tasks by deadline (which is every task that
       could plausibly rank) and marks the remainder for the next pass.
  E3 — Weight configuration does not sum to 1.0 (corrupted PREFS): system
       normalises the weights to sum to 1.0 and logs a CloudWatch warning.

Postcondition: Every active task carries a priorityScore and five persisted
sub-scores. The computation is fully DETERMINISTIC — no LLM participates in
ranking — so identical inputs always produce identical output, the demo is
reproducible, and any judge can verify the arithmetic by hand.

JUDGING NOTE: every team member must be able to explain this in 45 seconds.
Judges routinely ask the person who did NOT build a feature.


────────────────────────────────────────────────────────────
UC-010: System Generates a Plain-Language Priority Explanation  [AI BONUS]
────────────────────────────────────────────────────────────
Actor:        System
Precondition: UC-009 has produced sub-scores for the task; AI_API_KEY is
              set; a deterministic template generator is implemented as the
              mandatory fallback.

Main Flow:
  1. Trigger: a task with explanationStale = true is about to be rendered in
     Focus Mode (UC-011) or in a dashboard card (UC-016).
  2. System identifies the two or three highest-CONTRIBUTING sub-scores
     (sub-score × its weight, not the raw sub-score) — these are the actual
     reasons the task ranks where it does.
  3. System sends ONLY structured numbers to the model: the sub-score
     labels, their values, their weighted contributions, and the concrete
     supporting figures (grade weight %, remaining hours, available hours,
     days until deadline, clash count). The raw task description is NOT
     needed and is not sent.
  4. The prompt is template-constrained: exactly one sentence, maximum 30
     words, plain English, must cite the actual figures supplied, must not
     introduce any number not in the payload, no hedging, no preamble.
  5. System validates the returned sentence: word count ≤30, and every
     numeral appearing in the output must exist in the input payload.
  6. Validated explanation is persisted on the task with a hash of the
     sub-score state, and explanationStale is set to false.
  7. Frontend renders the sentence directly above a stacked horizontal bar
     showing each sub-score's weighted contribution, colour-coded and
     labelled, so the words and the arithmetic are visible together.

  Example output:
     "Top priority: worth 40% of IT2214, 9 hours of work left but only
      6 free hours before Friday, and two other deadlines the same week."

Alternative Flow A — Explanation already cached and sub-scores unchanged:
  System serves the cached sentence with no model call. This keeps the demo
  fast and stays inside free-tier rate limits during judging.

Alternative Flow B — Batch pre-warm:
  The hourly EventBridge recompute (UC-019) pre-generates explanations for
  the top 5 ranked tasks so Focus Mode opens instantly with no visible
  loading state during the demo.

Error Cases:
  E1 — Model unavailable, rate-limited, or times out: system assembles a
       deterministic template sentence from the same sub-scores, e.g.
       "Ranked first: 40% of your IT2214 grade, due in 2 days, and 9 hours
       of work remain against 6 available." The UI is visually identical.
  E2 — Output exceeds the word limit or contains a number absent from the
       payload: the response is DISCARDED and the template is used. A
       hallucinated figure in an explanation would destroy the credibility
       of the entire system, so validation is strict rather than lenient.
  E3 — Model returns markdown, quotes, or a preamble: system strips
       formatting and takes the first sentence; if still invalid, falls back
       to the template.

Postcondition: Every top-ranked task carries a one-sentence explanation
grounded entirely in its own sub-scores, cached against the sub-score state,
and rendered alongside a visual breakdown. The AI narrates the maths; it
never determines the ranking. This is precisely the brief's requirement that
recommendations be "understandable rather than appearing arbitrary."


────────────────────────────────────────────────────────────
UC-011: Student Uses Focus Mode to Decide What to Do Next
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; at least one active task with a
              computed priority exists.

Main Flow:
  1. Student opens Focus Mode from the dashboard or the app's persistent
     bottom action.
  2. System displays EXACTLY ONE card, full screen, no scrolling: the
     highest-priority task — or, if it has milestones, its next incomplete
     milestone, since "write the literature review section" is more
     actionable than "do the report".
  3. The card shows: task title, module (colour-coded), deadline with a
     live countdown ("due in 2 days, 14 hours"), and the one-sentence
     explanation from UC-010.
  4. Below the sentence, a stacked bar shows the weighted contribution of
     each of the five sub-scores, each labelled and hoverable for its
     underlying figure.
  5. Student chooses one of four actions:
       Start    — begins a session timer; on stop, prefills UC-008 with the
                  elapsed hours
       Progress — opens the UC-008 slider inline
       Not now  — reveals task #2
       Done     — marks complete and advances to the next task
  6. Choosing "Not now" reveals the next-ranked task WITH a one-line reason
     it ranked below the previous one ("lower stakes: 10% of IT2212 versus
     40% of IT2214"), so the ordering remains transparent even when the
     student overrides it.
  7. Any action recomputes the ranking (UC-009) and Focus Mode reflects the
     new top item immediately.

Alternative Flow A — All tasks complete:
  System shows a clear "Nothing due — you're ahead" state with the next
  upcoming deadline and its start-by date, so the empty state is still
  useful rather than blank.

Alternative Flow B — Top task is blocked (group dependency):
  If the task is flagged isGroup and marked "waiting on teammate", Focus
  Mode skips it with a visible note "skipped: waiting on your group" and
  presents the next actionable item.

Error Cases:
  E1 — Explanation unavailable: card renders the sub-score bar and the
       template sentence. Focus Mode never blocks on the AI.
  E2 — Ranking is empty because every task is unscoreable: system routes to
       the "needs attention" strip from UC-009 E1 with a prompt to fix the
       affected tasks.
  E3 — Session timer left running overnight: on next open, system asks "Was
       that a 9-hour session?" with quick corrections rather than silently
       logging an implausible figure.

Postcondition: The student has one unambiguous next action and understands
why it was chosen. This is the emotional core of the demo and the direct
answer to the brief's observation that "knowing a deadline is not always
enough — students must also decide which task should be completed first."


────────────────────────────────────────────────────────────
UC-012: System Breaks a Large Task into Milestones  [AI BONUS]
────────────────────────────────────────────────────────────
Actor:        System (invoked by the Student)
Precondition: Student is authenticated; the target task has effortHours and
              a dueAt; a deterministic template breakdown exists as
              fallback.

Main Flow:
  1. Student clicks "Break this down" on a task, or arrives automatically
     from the UC-006 brief-extraction flow carrying a deliverables list.
  2. System sends the model: task title, type, effortHours, dueAt, today's
     date, the student's per-day availability, and any deliverables
     extracted from the brief.
  3. Model returns 3–6 milestones, each with a name, an effort-hour
     allocation summing to effortHours, and a suggested internal deadline.
  4. System applies two hard constraints programmatically, NOT via the
     prompt (constraints enforced in the prompt alone are unreliable):
       (i)  the final milestone completes at least ONE FULL DAY before the
            real deadline — a deliberate buffer
       (ii) no milestone deadline falls on a zero-availability blocked day;
            such dates shift to the previous available day
  5. System renders the proposed milestones as an editable list — rename,
     re-date, reallocate hours, delete, or add.
  6. Student accepts; system writes MILESTONE items under
     SK = MILESTONE#<taskId>#<milestoneId>.
  7. Milestones become tickable and now drive progressPct in UC-008, and
     appear as spans on the UC-017 timeline.
  8. Focus Mode (UC-011) now surfaces the next incomplete milestone rather
     than the whole task.

Alternative Flow A — Student edits the hour allocation:
  System rebalances the remaining milestones proportionally so the total
  continues to equal effortHours, and shows the running total live.

Alternative Flow B — Task is too small to break down (<3 hours):
  System declines gracefully: "This one's small enough to do in a single
  session" and offers a single-milestone option instead of manufacturing
  artificial steps.

Error Cases:
  E1 — Model unavailable: system uses a deterministic template by task type.
         report/assignment → research · outline · draft · revise · submit
         test             → topics 1–3 · topics 4–6 · past papers · review
         presentation     → script · slides · rehearse · final run
         project          → plan · build · integrate · test · document
       Hours are split evenly and dates are back-scheduled from the buffer.
  E2 — Returned milestone hours do not sum to effortHours: system rescales
       them proportionally to match before rendering. It never displays an
       inconsistent total.
  E3 — Model returns a milestone dated after the task deadline: the date is
       clamped by the step-4 constraint and a note is shown on that row.
  E4 — Milestone batch write fails: no milestones are created (all-or-
       nothing), the proposal remains on screen, and a retry is offered.

Postcondition: The task has 3–6 dated, hour-allocated milestones respecting
the student's blocked days and finishing a full day before the deadline.
Progress tracking becomes granular, Focus Mode becomes specific, and the
timeline view gains work spans instead of bare deadline points.


────────────────────────────────────────────────────────────
UC-013: System Detects a Crash Week and Recommends Redistribution
────────────────────────────────────────────────────────────
Actor:        System
Precondition: At least three active tasks exist; PREFS carries study
              availability.
Trigger:      Any deadline change, task creation, availability change, or
              the hourly EventBridge recompute.

Main Flow:
  1. System buckets the next 12 calendar weeks.
  2. For each week, system computes:
       requiredHours  = Σ remainingHours of every task due in that week,
                        plus every milestone dated in that week
       availableHours = Σ daily availability for that week, minus blocked
                        days
       loadRatio      = requiredHours / availableHours
  3. Any week with loadRatio > 1.0 is flagged a CRASH WEEK, with the
     overload recorded in hours.
  4. For each crash week, system generates CONCRETE, QUANTIFIED
     redistribution recommendations, computed deterministically:
       - identify the task in that week with the largest remainingHours and
         the earliest possible start date
       - compute how many hours must move earlier to bring loadRatio to
         ≤1.0
       - check that the receiving week has spare capacity; if not, cascade
         to the week before that
       - express it as: "Start your IT2214 report 4 days earlier and move
         5 hours into the week of 17 Aug, which has 6 spare hours."
  5. System renders this as an amber card on the dashboard (UC-016) and on
     the heatmap (UC-018), with "Apply" and "Dismiss".
  6. Applying creates or shifts milestone dates (UC-012) to enact the plan
     and rescores; the crash week's loadRatio visibly drops.
  7. Dismissing logs dismissedAt and suppresses the card for that week for
     48 hours.

Alternative Flow A — No earlier capacity anywhere:
  If no preceding week has spare hours, the system says so honestly:
  "There's no spare capacity before this week. Consider reducing scope on
  the lowest-stakes item — your 5% IT2212 quiz." It does not invent a plan
  that cannot work.

Alternative Flow B — Crash week caused by a single oversized task:
  If one task alone exceeds the week's capacity, the recommendation is to
  break it down (UC-012) and spread its milestones, with a direct link.

Error Cases:
  E1 — Availability is zero for an entire week (blocked out): loadRatio is
       infinite; system reports "no study time available that week" rather
       than a number, and recommends moving work entirely out of it.
  E2 — Recommendation computation finds no valid move: card is suppressed
       and the week is flagged informationally only, with no misleading
       advice.

Postcondition: Crash weeks are identified with quantified overloads, and
each carries a specific, checkable recommendation naming a task, a number of
days, and a number of hours. This answers the brief's "recommendations for
redistributing work when several deadlines clash" and its "detection of
unusually busy periods" in one mechanism.

DEMO REQUIREMENT: the seeded dataset MUST contain one unmistakable crash
week. This is the moment the heatmap goes red on stage.


────────────────────────────────────────────────────────────
UC-014: System Generates a Daily Study Plan
────────────────────────────────────────────────────────────
Actor:        System (invoked by the Student, or by the morning digest)
Precondition: Student is authenticated; availability is configured; at least
              one active task exists.

Main Flow:
  1. Student opens the "Today" view, or receives the 08:00 digest (UC-019)
     containing the plan.
  2. System reads today's available hours from PREFS, subtracting any
     blocked period.
  3. System greedily allocates today's hours to the highest-priority
     incomplete MILESTONES (falling back to whole tasks where no milestones
     exist), subject to:
       - a minimum useful block of 45 minutes (no 10-minute fragments)
       - no more than 3 hours on a single item before switching, to avoid a
         single task consuming the whole day
       - any task flagged `tight = true` in UC-009 gets first allocation
  4. System returns an ordered schedule with hour allocations and a one-line
     rationale per block ("2 h — IT2214 outline: highest priority and you're
     40% behind pace").
  5. Student may drag blocks to reorder; reordering affects today's plan
     only and does not alter the underlying priority scores.
  6. Completing a block links straight into UC-008 progress logging with the
     allocated hours prefilled.

Alternative Flow A — Zero available hours today:
  System does not produce an empty plan. It shows what shifts to tomorrow
  and what that costs: "No study time today. Your IT2214 report moves to
  tomorrow, leaving 6 hours of work in 5 available hours."

Alternative Flow B — More available hours than remaining work:
  System allocates all outstanding work, then shows "You have 2 hours spare
  — here's what you could start early" with the next-ranked upcoming task.

Error Cases:
  E1 — All tasks complete: system shows a clear rest state with the next
       start-by date, not a blank page.
  E2 — Allocation produces a block shorter than the 45-minute minimum: the
       remainder is merged into the preceding block rather than shown as a
       fragment.

Postcondition: The student has a concrete, ordered, hour-allocated plan for
today, derived from the same deterministic priority scores, with each block
traceable to a reason.


────────────────────────────────────────────────────────────
UC-015: Student Tunes Prioritisation Weights
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; UC-009 is persisting sub-scores;
              at least three active tasks exist for a meaningful preview.

Main Flow:
  1. Student opens Settings → Prioritisation.
  2. System displays five sliders — Urgency, Stakes, Effort Pressure,
     Progress Deficit, Clash Penalty — showing the current weights (default
     0.30 / 0.25 / 0.20 / 0.15 / 0.10).
  3. Alongside the sliders, a LIVE PREVIEW panel shows the student's current
     top 5 tasks in ranked order.
  4. As the student drags a slider, the system recomputes locally from the
     already-persisted sub-scores — no server round-trip, no model call —
     and the preview list reorders INSTANTLY with animated transitions.
  5. System auto-normalises the five weights to sum to 1.0 as they move, so
     the total is always coherent.
  6. Four one-click presets are offered:
       Balanced           — the defaults
       Grade-focused      — Stakes weighted highest
       Deadline-focused   — Urgency weighted highest
       Anti-procrastination — Progress Deficit weighted highest
  7. Student saves; weights persist to PREFS and the full ranking recomputes.
  8. "Reset to default" is always available.

Alternative Flow A — Student sets a weight to zero:
  Permitted. That sub-score is excluded from ranking and its bar disappears
  from every explanation breakdown, keeping the visual and the maths
  consistent.

Alternative Flow B — Preview shows no change:
  If a slider movement does not reorder anything, system shows a subtle
  "no change to your top 5" note rather than leaving the student wondering
  whether the control is working.

Error Cases:
  E1 — PREFS write fails on save: sliders revert to the last persisted
       values and a toast reports the failure. The preview state is not
       silently treated as saved.
  E2 — Fewer than two active tasks: preview shows "Add more tasks to see
       how weighting changes your order", and the sliders remain adjustable.

Postcondition: The student's personal weighting is persisted and applied to
every subsequent score. The system has demonstrated, interactively, that the
prioritisation is a transparent formula and not a black box — which is the
fastest possible way to prove the thesis to a judge standing at your table.


────────────────────────────────────────────────────────────
UC-016: Student Views Dashboard and Ranked Task List
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; UC-009 has produced a ranking (the
              dashboard renders correctly with zero tasks); the shared
              Chart.js theme config (`src/lib/chartTheme.ts`, owned by
              Hasini) is imported for the progress ring and sub-score bars.

Main Flow:
  1. Student signs in and lands on the dashboard.
  2. Above the fold, system renders four elements:
       - NEXT UP: the #1 task with its live countdown and one-line
         explanation, linking straight into Focus Mode (UC-011)
       - THIS WEEK: required hours versus available hours, as a capacity
         bar that turns amber above 80% and red above 100%
       - COUNTS: tasks due in 7 days, tasks overdue, tasks completed this
         week
       - ALERTS: the crash-week card from UC-013, if any
  3. Below, system renders the ranked task list, sorted by priorityScore
     DESCENDING BY DEFAULT (not by deadline — the default sort is itself an
     argument for the product's thesis).
  4. Each row shows: priority badge (1, 2, 3…), title, module colour chip,
     type icon, countdown text per the brief's wording ("Test in 3 days",
     "Assignment due in 24 hours"), a progress ring, and a `tight` warning
     icon where EffortPressure indicates the work does not fit.
  5. Expanding a row reveals the sub-score bar breakdown and the UC-010
     explanation sentence, in place.
  6. Filter and sort controls sit above the list and persist across
     navigation.

Alternative Flow A — Empty state (new student):
  System shows a purposeful onboarding path: "Add your first deadline" with
  three routes side by side — quick type (UC-005), upload a brief (UC-006),
  full form (UC-002).

Alternative Flow B — Everything complete:
  Dashboard shows a clear "You're on top of everything" state with the next
  upcoming deadline and its recommended start-by date.

Error Cases:
  E1 — Ranking endpoint times out (>8 s): system renders the task list from
       cached local state sorted by deadline, with a banner "Live
       prioritisation unavailable — showing deadline order" and a retry.
       The app remains usable.
  E2 — A single card fails to render (malformed data): that card is replaced
       by a minimal fallback row; the rest of the dashboard renders normally.
  E3 — Countdown crosses zero while the page is open: the row transitions
       live into the overdue state (UC-021) without requiring a reload.

Postcondition: The student sees their complete situation — what is next, how
loaded the week is, what is overdue, and why the order is what it is —
within five seconds of the page appearing. Visual clarity here
disproportionately drives judging scores; treat it as a first-class
deliverable, not decoration.


────────────────────────────────────────────────────────────
UC-017: Student Views Calendar and Timeline
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; at least one dated task exists;
              shared Chart.js theme config (Hasini) imported for timeline
              rendering.

Main Flow:
  1. Student switches to the Calendar tab and selects Week or Month.
  2. System renders tasks positioned by deadline, coloured by module, with
     the priority badge shown on each entry and a size or border weight
     reflecting grade weight.
  3. Student switches to the Timeline view.
  4. Timeline renders each task as a HORIZONTAL SPAN from its recommended
     start date (derived from its first milestone, or back-calculated as
     effortHours ÷ daily availability) to its deadline — visualising the
     WORK PERIOD, not just the endpoint.
  5. Milestones appear as markers along each span, filled when complete.
  6. Overlapping spans are stacked, making concentrated workload visible at
     a glance and complementing the numeric view in UC-018.
  7. Clicking any entry or span opens the task detail (UC-003).
  8. Today is marked with a vertical line; spans already begun are shaded to
     show elapsed portion versus progress recorded — visually exposing a
     student who is behind.

Alternative Flow A — Task has no milestones:
  Span is back-calculated from effort and availability and rendered with a
  dashed border, labelled "estimated work period", distinguishing it from a
  planned one.

Alternative Flow B — Very long horizon (semester-scale project):
  Timeline compresses to a weekly scale automatically when the visible range
  exceeds 8 weeks, keeping labels legible.

Error Cases:
  E1 — A task's computed start date precedes its creation date: span is
       clipped to start at creation and flagged with a "started late" marker
       rather than rendering off-canvas.
  E2 — Chart render failure: the container is hidden and a plain list of the
       period's deadlines is shown as a fallback, so the view is never blank.
  E3 — More than 40 entries in the visible range: system paginates by week
       and shows a count, protecting render performance.

Postcondition: The student can see both deadline points and work periods.
Most competing teams will plot deadline points only; showing the runway —
and the gap between elapsed time and recorded progress — is a visible step
up that a judge will register immediately.


────────────────────────────────────────────────────────────
UC-018: Student Views Semester Workload Heatmap
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; availability is configured; UC-013
              has computed weekly load ratios. Hasini owns this view — she
              already computes the crash-week data (UC-013) so routing the
              visualisation through a second person would add a handoff
              boundary for no benefit. She also owns the shared Chart.js
              theme (`src/lib/chartTheme.ts`) that UC-016/UC-017 import.

Main Flow:
  1. Student opens the Workload tab.
  2. System renders a grid of the next 12 weeks (Chart.js matrix), each cell
     shaded by loadRatio = requiredHours / availableHours:
       ≤0.5 green · 0.5–0.8 light · 0.8–1.0 amber · >1.0 red (crash week)
  3. Each cell is labelled with the week commencing date and its ratio as a
     percentage.
  4. Crash weeks are rendered with a distinct border and their overload in
     hours ("+7 h over capacity").
  5. Hovering a week reveals a tooltip listing the contributing tasks with
     their individual hour requirements.
  6. Clicking a crash week opens the UC-013 redistribution recommendation
     card for that week with Apply / Dismiss.
  7. A capacity line chart beneath the grid overlays required versus
     available hours across the same 12 weeks, so the trend is legible as
     well as the snapshot.

Alternative Flow A — Fewer than three tasks:
  System shows the grid with an explanatory overlay "Add more deadlines to
  see your semester shape" rather than a misleadingly empty green grid.

Alternative Flow B — Student changes availability from this view:
  An inline availability control lets the student adjust weekly hours and
  watch the grid re-shade live — a powerful, wordless demonstration of the
  capacity model.

Error Cases:
  E1 — Division by zero (a fully blocked week): cell renders as a distinct
       hatched pattern labelled "unavailable", not as an error or a
       misleading zero.
  E2 — Matrix chart fails to render: system falls back to a simple bar chart
       of required hours per week, preserving the information.

Postcondition: The student can see their whole semester's shape at a glance
and act on the worst week in two clicks. This is the single most
screenshot-able view in the product — invest in making it beautiful.


────────────────────────────────────────────────────────────
UC-019: System Runs Scheduled Deadline Check and Delivers Reminders  [AWS SHOWCASE]
────────────────────────────────────────────────────────────
Actor:        System
Precondition: An Amazon EventBridge rule is configured to invoke the
              reminder Lambda; SNS_TOPIC_ARN (or SMTP fallback) is set;
              CRON_SECRET protects any HTTP-invoked variant; the PREFS item
              carries digest time, quiet hours, and the daily cap. Zoe
              owns this entire pipeline end to end (EventBridge rules,
              reminder Lambda, SNS/SMTP wiring) and deploys against
              Philena's shared SAM stack herself.

Main Flow:
  1. Amazon EventBridge invokes the reminder Lambda on two schedules:
       rate(1 hour)              — urgency evaluation + score refresh
       cron(0 0 * * ? *)         — 08:00 SGT daily digest (00:00 UTC)
  2. Lambda queries GSI1 for every task with dueAt inside the next 14 days,
     for each active student.
  3. Lambda re-invokes the UC-009 scoring engine so that ProgressDeficit and
     Urgency reflect the passage of time even when the student has not
     opened the app — a task becomes more urgent overnight without any user
     action, which a purely on-write scoring model would miss.
  4. Lambda applies the REMINDER RULES, in order:
       (a) DAILY DIGEST at the student's configured time: today's plan
           (UC-014), the top 3 priorities, and anything overdue
       (b) SAME-DAY NUDGE for any task due within 24 hours that is below
           90% complete
       (c) ESCALATION for any task where ProgressDeficit > 40 AND the
           deadline is within 48 hours: "You're 45% behind on a task due
           in 2 days"
       (d) CRASH-WEEK ALERT, at most once per week, when UC-013 flags a new
           overloaded week
  5. Lambda enforces the NOTIFICATION BUDGET: a hard cap of 3 notifications
     per student per day. Anything beyond the cap is absorbed into the next
     digest rather than sent separately.
  6. Lambda enforces QUIET HOURS (default 22:00–07:00 SGT): messages due in
     that window are queued and released at the next permitted time.
  7. Lambda publishes to Amazon SNS (or sends via Nodemailer/SMTP fallback —
     path chosen at hour zero by Zoe based on the Learner Lab allowlist),
     writes an in-app notification item, and records deliveredAt.
  8. Delivery outcomes are logged to Amazon CloudWatch for the metrics the
     team can show during judging.

  END-TO-END AWS STORY (rehearse this sentence):
    "A task is written to DynamoDB by a Lambda behind API Gateway; an
     EventBridge rule wakes a scoring Lambda hourly; that Lambda queries the
     deadline GSI, recomputes priority, and publishes a reminder through SNS
     — and CloudWatch shows the whole chain."
  This directly satisfies the brief's requirement to "demonstrate how a task
  moves through the AWS-powered system."

Alternative Flow A — Student has notifications disabled:
  Lambda still recomputes scores (so the dashboard is fresh on next open)
  but sends nothing. Scoring and delivery are deliberately decoupled.

Alternative Flow B — Manual trigger for the demo:
  A protected POST /api/reminders/run endpoint, validating CRON_SECRET,
  runs the same handler on demand so reminder delivery can be shown live on
  stage without waiting for the schedule.

Error Cases:
  E1 — SNS publish fails: Lambda retries once after 3 seconds, then writes
       the notification in-app only with delivered = false and surfaces it
       on next login. The student never silently misses a reminder.
  E2 — Lambda times out mid-batch: the handler processes students in pages
       and records a cursor, so the next invocation resumes rather than
       restarting. Partial delivery is logged, not repeated.
  E3 — Duplicate delivery risk (EventBridge at-least-once invocation): each
       notification is keyed on studentId + taskId + rule + date, and a
       conditional write prevents the same reminder being sent twice.
  E4 — Scoring failure inside the scheduled run: reminders are still sent
       using the last persisted scores, flagged internally as stale.
  E5 — SES/SNS unavailable in the Learner Lab environment: SMTP fallback via
       Nodemailer is used and the in-app notification path is unaffected.
       This path was decided at hour zero, not discovered late.

Postcondition: Every student has received at most three well-timed,
non-overlapping notifications, none during quiet hours. Scores are fresh
regardless of app usage. The full AWS pipeline — DynamoDB → EventBridge →
Lambda → SNS → CloudWatch — has executed and is demonstrable.

JUDGING NOTE: the brief explicitly asks "how notification overload can be
avoided". Say the number out loud: a hard cap of three per day, with a
digest absorbing the overflow, and quiet hours enforced.


────────────────────────────────────────────────────────────
UC-020: Student Manages Reminder Preferences
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; a PREFS item exists.

Main Flow:
  1. Student opens Settings → Notifications.
  2. Student configures: channels (email on/off, in-app on/off), daily
     digest time, quiet-hours window, daily notification cap (1–5, default
     3), and per-type lead times.
  3. Per-type lead times default sensibly — tests 7 days (they need
     preparation), projects 5 days, assignments 3 days, presentations 3 days
     — and each is adjustable.
  4. Student toggles escalation alerts for falling behind pace.
  5. System writes the changes to PREFS; they take effect on the next
     EventBridge invocation.
  6. A "Send test notification" button dispatches an example reminder
     immediately through the real delivery path.

Alternative Flow A — Student disables all channels:
  System confirms "You'll only see reminders inside the app" and keeps
  in-app notifications on regardless, so nothing is ever lost entirely.

Alternative Flow B — Quiet hours cover the digest time:
  System detects the conflict and warns "Your digest time falls inside quiet
  hours — it will be delivered at 07:00 instead", resolving it visibly
  rather than silently dropping the digest.

Error Cases:
  E1 — Test notification fails to send: system reports the specific failure
       ("email delivery failed — check your address") rather than a generic
       error, since this button exists precisely to diagnose delivery.
  E2 — PREFS write fails: controls revert to persisted values with a toast.

Postcondition: Reminder behaviour matches the student's stated preferences,
and the test button provides live, on-stage proof that the notification
pipeline works — which is far more convincing to a judge than a screenshot.


────────────────────────────────────────────────────────────
UC-021: System Handles Overdue Tasks
────────────────────────────────────────────────────────────
Actor:        System, then Student
Precondition: An active task's dueAt has passed with progressPct < 100.

Main Flow:
  1. The hourly EventBridge run (UC-019), or a live countdown crossing zero
     in an open session, detects the passed deadline.
  2. System sets status = 'overdue', records overdueSince, and pins the task
     to the top of every list with distinct red styling. It is NEVER hidden
     and never silently dropped from the ranking.
  3. Urgency is pinned at 100 in UC-009 so the task cannot be outranked by
     something merely due soon.
  4. On next open, the student sees an overdue prompt offering three
     explicit resolutions:
       (a) MARK COMPLETE (submitted late) — records completedAt, flags
           lateSubmission = true, feeds the UC-022 on-time statistics
       (b) RESCHEDULE — student enters a new deadline (extension granted,
           resubmission, or a self-imposed catch-up date); status returns to
           'active' and the task is rescored
       (c) ARCHIVE — no longer relevant; status = 'archived', removed from
           ranking AND from workload capacity calculations so it stops
           distorting the heatmap
  5. System appends the resolution to the task's history with a timestamp.
  6. Until resolved, overdue tasks are excluded from the UC-014 daily plan's
     hour allocation but shown above it as a "resolve these first" strip —
     so they demand a decision without silently consuming study hours.

Alternative Flow A — Multiple tasks go overdue at once:
  System groups them into a single "3 tasks are overdue" card with a bulk
  resolution flow, rather than issuing three separate alerts (which would
  also breach the UC-019 notification cap).

Alternative Flow B — Task overdue by more than 30 days:
  System prompts once more, then auto-archives with a notification, so
  abandoned tasks do not permanently poison the workload figures.

Error Cases:
  E1 — Reschedule date is also in the past: form blocks with "Please choose
       a future date" and offers "or mark it complete if you've submitted".
  E2 — Status transition write fails: the task remains 'active' with the
       countdown showing negative time, and the next scheduled run retries
       the transition.
  E3 — Timezone edge case (deadline 23:59 SGT evaluated in UTC): all
       comparisons are performed in the student's timezone, stored
       explicitly in PREFS, never in the Lambda's default UTC.

Postcondition: Overdue tasks are visible, ranked at the top, and resolvable
in one click via three honest options. Archived tasks stop affecting
capacity calculations. The brief names overdue handling as an explicit
judging consideration — this use case is the whole answer to it.


────────────────────────────────────────────────────────────
UC-022: Student Reviews Completed Tasks and Estimation Accuracy
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; at least one task has status
              'completed'.

Main Flow:
  1. Student opens the Completed tab.
  2. System lists completed tasks grouped by week, each showing: title,
     module, completion date, on-time or late badge, estimated hours versus
     actual hours logged, and final grade weight.
  3. System renders three summary statistics:
       - tasks completed this week / this month
       - on-time completion rate as a percentage
       - ESTIMATION ACCURACY: the mean ratio of hoursSpent to effortHours
         across completed tasks
  4. Where estimation accuracy deviates meaningfully from 1.0 (based on at
     least three completed tasks), system surfaces a hint at task-creation
     time in UC-002: "You usually need about 1.3× your estimate — consider
     10 hours instead of 8."
  5. Accepting the hint pre-adjusts effortHours on the new task, which flows
     straight into a more realistic EffortPressure score.
  6. A per-module breakdown shows where the student most consistently
     under-estimates.

Alternative Flow A — Fewer than three completed tasks:
  Estimation accuracy is shown as "not enough data yet (3 needed)" rather
  than a misleading figure derived from one data point.

Alternative Flow B — Student never logs hours:
  Estimation accuracy is unavailable; the panel explains that logging hours
  in UC-008 enables it, with a direct link.

Error Cases:
  E1 — A completed task has hoursSpent = 0: it is excluded from the accuracy
       calculation rather than skewing the mean toward zero.
  E2 — Outlier ratio above 5× (a mis-logged overnight session): excluded
       from the mean and flagged for the student to correct.

Postcondition: The student can see what they finished, how reliably they
finish on time, and how wrong their effort estimates tend to be — and that
last figure feeds forward to make future prioritisation more accurate. This
self-correcting loop is a genuinely novel touch and costs almost nothing
once UC-008 is logging hours.


────────────────────────────────────────────────────────────
UC-023: Student Exports Deadlines to a Calendar
────────────────────────────────────────────────────────────
Actor:        Student
Precondition: Student is authenticated; at least one active task exists.

Main Flow:
  1. Student clicks "Export to calendar" from the calendar view or settings.
  2. Student selects scope: all active tasks, a single module, or a date
     range; and whether to include milestone dates as separate entries.
  3. System generates an .ics file server-side containing, per task: title
     prefixed with the module code, deadline as the event time, description
     carrying the grade weight and effort estimate, and a VALARM set to the
     student's configured lead time for that task type.
  4. Browser downloads the file; the student imports it into Google
     Calendar, Apple Calendar, Outlook or their institutional calendar.
  5. System shows a confirmation with the count exported.

Alternative Flow A — Subscription feed:
  System offers a tokenised read-only .ics URL that external calendars can
  poll, so changes in DeadlineIQ propagate without re-export. The token is
  revocable from settings.

Error Cases:
  E1 — Zero tasks in the selected scope: export button disabled with tooltip
       "Nothing to export for this selection."
  E2 — .ics generation fails: system offers a CSV export as a fallback so
       the student is never left without a way to get their data out.

Postcondition: The student holds a portable .ics file, or a live
subscription URL, containing their deadlines with alarms.

SCOPE DECISION: this deliberately replaces full Google Calendar OAuth
integration. An .ics export delivers the same user value in under an hour of
work; OAuth consent screens consume half a day and are a notorious cause of
live demo failure. Build .ics. If you somehow finish everything else, then
consider OAuth.


============================================================
SCHEDULED JOBS & OPS SUMMARY
============================================================
Two Amazon EventBridge rules are required. Both target the same Lambda with
different input payloads so there is only one handler to maintain. Zoe owns
both rules and the handler.

1. RULE: deadlineiq-hourly-recompute
   Schedule: rate(1 hour)
   Target:   reminderLambda   Input: { "job": "recompute" }
   Does:     re-scores all active tasks (UC-009), refreshes crash-week
             detection (UC-013), pre-warms explanations for top 5 tasks
             (UC-010), sends same-day nudges and escalations (UC-019)

2. RULE: deadlineiq-daily-digest
   Schedule: cron(0 0 * * ? *)   — 00:00 UTC = 08:00 SGT
   Target:   reminderLambda   Input: { "job": "digest" }
   Does:     builds each student's daily plan (UC-014) and dispatches the
             morning digest (UC-019) subject to cap and quiet hours

MANUAL DEMO TRIGGER:
   POST /api/reminders/run with header Authorization: Bearer <CRON_SECRET>
   Runs either job on demand so the reminder pipeline can be shown live.

SEED SCRIPT (Philena owns — run before EVERY rehearsal):
   `npm run seed` wipes and reseeds the demo account with a deliberately
   brutal week. All deadlines are computed RELATIVE TO NOW (now + 2 days,
   now + 4 days…) so the demo never goes stale between rehearsal and
   judging. The script is idempotent and completes in under 10 seconds.
   Seeded dataset MUST contain:
     - a 40%-weight IT2214 report at 15% progress, due in 3 days,
       12 effort hours (guarantees EffortPressure > 1.0 → `tight`)
     - a test due in 5 days with prepDays = 3 (proves the prep-day logic)
     - a group project with a teammate dependency
     - two small assignments clustered in the same 72 hours (drives
       ClashPenalty)
     - one overdue task (drives UC-021)
     - availability configured so week 2 is unmistakably a crash week

DEPLOY OWNERSHIP:
   Philena — SAM template, DynamoDB table + GSI1, API Gateway, Lambda
             authoriser, UC-001/002/003/004 handlers.
   Mahdiya — S3 bucket, presign endpoint, parse handler, brief-extract
             handler, bulk-import handler. Deploys her own functions
             against Philena's shared stack.
   Hasini —  Scoring engine (deployed as a shared library imported by
             both Philena's task-write handlers and Zoe's reminder
             Lambda), UC-013/UC-018 endpoints, shared Chart.js theme.
   Zoe —     EventBridge rules, reminder Lambda, SNS topic (or SMTP
             fallback), notification write path, manual demo trigger.

COST CONTROL ($50 credit):
   DynamoDB on-demand, Lambda 256 MB / 10 s timeout, S3 standard, SNS email.
   Do not provision EC2, RDS, NAT Gateways, or provisioned DynamoDB
   capacity. At hackathon scale this stack costs cents, not dollars.

============================================================
NON-NEGOTIABLES BEFORE PRESENTING
============================================================
1. EVERY AI-dependent use case has a working deterministic fallback:
   UC-005 (chrono-node), UC-006 (regex + manual form), UC-010 (template
   sentence), UC-012 (template breakdown). Pull the AI_API_KEY out of the
   environment and confirm the entire demo still runs end to end. A demo
   that dies on a 429 loses to a duller demo that works.
2. The seed script runs clean immediately before the demo.
3. ALL FOUR MEMBERS can explain UC-009 in 45 seconds. Judges ask the person
   who did not build the feature.
4. Freeze the code for the final 10% of your time. Rehearse the three-minute
   script end to end, twice, on the actual venue wifi.

============================================================
DEMO SCRIPT (build toward this from hour one — under 3 minutes)
============================================================
  0:00  Dashboard loads. Four overlapping deadlines, one already red.
        "This is a normal week in semester two."
  0:20  Paste into quick-add: "IT2214 report due next Friday 11:59pm,
        40% weighting, about 12 hours of work" → confirmation card appears
        with the parsed fields → confirm.        [UC-005]
  0:45  Workload heatmap: week of 24 August turns RED, +7 hours over
        capacity.                                [UC-018]
  1:05  Open Focus Mode. One card. One task. The sentence:
        "Top priority: worth 40% of IT2214, 12 hours of work left but only
         6 free hours before Friday, and two other deadlines the same week."
        Expand the sub-score bar underneath.     [UC-011, UC-010]
  1:35  "But that's not a black box." Open weight sliders, drag Stakes down,
        watch the top 5 reorder live.            [UC-015]
  2:00  Log 30% progress on the report → the ranking visibly reorders and
        the crash week lightens.                 [UC-008]
  2:20  Open the crash-week card: "Start your IT2214 report 4 days earlier
        and move 5 hours into the week of 17 August." Apply it.  [UC-013]
  2:40  Show the reminder that fired this morning, and the CloudWatch log
        proving DynamoDB → EventBridge → Lambda → SNS.           [UC-019]
  2:55  Close on the thesis: "Every ranking in this system is arithmetic you
        can check. The AI writes the sentence. It never picks the order."

============================================================
END OF USE CASES
============================================================
