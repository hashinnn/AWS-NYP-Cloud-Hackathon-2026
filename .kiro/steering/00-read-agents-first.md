---
inclusion: always
---

# Read AGENTS.md before anything else

Before reading, planning, editing, scaffolding, or answering any question
about this repository, open and read **`AGENTS.md`** at the repo root in full.

It is the single source of truth for:

- The winning thesis — **priority ranking is deterministic arithmetic (UC-009);
  AI only narrates it (UC-010)**. Never let an LLM influence ranking.
- The stack and the AWS Academy Learner Lab constraints (Cognito, SES,
  Textract and Bedrock are unavailable — the fallbacks are already chosen,
  do not reintroduce the blocked services).
- The single-table DynamoDB data model and GSI1 deadline index.
- The exact five-factor priority formula and its default weights.
- Per-member ownership boundaries (Philena / Mahdiya / Hasini / Zoe).
- The working agreement: read the use case first, plan before non-trivial
  work, deterministic fallback ships with every AI feature, never commit
  secrets.

Do not infer the design from the code. The repo starts nearly empty and the
schema is documented in `AGENTS.md`, not in migration files.

After `AGENTS.md`, read in this order:

1. `DeadlineIQ_Use_Cases.md` — the 23 use cases are the spec. For any task
   numbered `UC-###`, read that whole section before writing code.
2. `HIGH_LEVEL_DESIGN.md` — architecture, data flow, AWS wiring.
3. `PROJECT_IMPLEMENTATION_PHASES.md` — build order, dependencies, ownership.

#[[file:../../AGENTS.md]]
