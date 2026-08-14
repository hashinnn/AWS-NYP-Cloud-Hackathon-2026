# CLAUDE.md

**Before doing anything in this repository — reading, planning, editing,
scaffolding, answering a question — you MUST read [AGENTS.md](AGENTS.md)
in full.**

`AGENTS.md` is the single source of truth for:
- The winning thesis (deterministic priority + AI narration — do not blur
  this line).
- The stack, the AWS Academy Learner Lab constraints, and the fallbacks
  that are already baked in.
- The single-table DynamoDB data model.
- The UC-009 priority formula (the product).
- Per-member ownership boundaries (Philena / Mahdiya / Hasini / Zoe).
- The working agreement every AI contributor must follow.

Do **not** infer the design from the code — the repo starts nearly empty
and the schema is documented in `AGENTS.md`, not in migrations.

After `AGENTS.md`, the reading order is:

1. [`DeadlineIQ_Use_Cases.md`](DeadlineIQ_Use_Cases.md) — the 23 use cases
   are the spec. For any task numbered `UC-###`, open the matching section
   end to end before writing code — main flow, alternative flows, error
   cases, postcondition. The main flow alone is not the spec.
2. [`HIGH_LEVEL_DESIGN.md`](HIGH_LEVEL_DESIGN.md) — architecture, full data
   dictionary, the complete API contract and error-code catalogue, the
   scoring algorithm with a worked example, failure-mode matrix, security
   model, sequence flows.
3. [`PROJECT_IMPLEMENTATION_PHASES.md`](PROJECT_IMPLEMENTATION_PHASES.md) —
   build order, per-ticket acceptance criteria, dependency graph, risk
   register, cut list, demo script.
4. [`README.md`](README.md) — setup, deploy, how to run the fallback test.

**Precedence when documents conflict:** use cases (behaviour) > high-level
design (structure) > implementation phases (sequencing). If you find a
genuine contradiction, raise it — do not silently pick one.

This instruction applies equally to **Claude Code, Kiro, Cursor, Windsurf,
Copilot**, and any other assistant a teammate is using. Kiro and other
tools that look for `AGENTS.md` will find it at the repo root; this file
exists so tools that look for `CLAUDE.md` first still land on the same
briefing.

@AGENTS.md
