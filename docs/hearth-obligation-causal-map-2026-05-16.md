# Hearth — Obligation Causal Map (2026-05-16)

Status: working draft — NOT enforcement spec
Purpose: identify real trigger surfaces and obligation artifacts before designing validation

Scope: Hearth repo only. Cross-repo and cross-agent portability analysis is out of scope here.

---

## Commit Model Observation (prerequisite to the map)

Hearth git history reveals two commit types that must be treated differently:

| Type | Pattern | Content |
|---|---|---|
| Semantic | `fix:`, `feat:`, `chore:`, `perf:`, `docs:` prefix | intentional milestone; code or policy change |
| Auto | `auto: YYYY-MM-DD HH:MM` | Claude Code frequent auto-save; may contain code, memory, or both |

**Critical: auto commits are NOT clean obligation-satisfying artifacts.**

An `auto:` commit may contain:
- Code changes that belong to an in-progress semantic unit (not yet a trigger)
- Memory updates that satisfy a prior obligation
- Both of the above in the same commit

Example from 2026-05-16 history:
```
c5e121d chore(web): hide panels          ← semantic trigger
858219e auto: 2026-05-16 20:36           ← contains styles.css (code, not obligation)
8ad6ad0 auto: 2026-05-16 20:37           ← contains 04_validation_log.md (obligation)
```

Obligation verification cannot use commit type as a signal.
Verification must track FILE changes across commits, not commit labels.

---

## Classification: Syntactic vs Semantic Event Inference

Events differ in how reliably they can be inferred from a git diff:

| Inference quality | Meaning | Automatable? |
|---|---|---|
| `syntactic` | the diff pattern itself IS the event | yes |
| `semantic` | the diff pattern implies the event, but requires content analysis | partially |
| `manual` | a human decision occurred; no diff signal is reliable | no |

This matters for false positive risk. Syntactic events are low-risk; semantic events need disambiguation.

---

## Obligation Map

### MOB-01 — Schema Migration Added

| Field | Value |
|---|---|
| **Trigger surface** | New file matching `supabase/migrations/*.sql` |
| **Inferred event** | `schema_migration` |
| **Inference quality** | syntactic (new file in that path = migration) |
| **Required artifact** | `memory/04_validation_log.md` (migration applied + tested), `memory/YYYY-MM-DD.md` |
| **Verification boundary** | within 3 commits after trigger commit (migration should be applied and tested before next unrelated work) |
| **False positive risk** | **low** — a new `.sql` file in `supabase/migrations/` is always a schema change |
| **Self-referential risk** | none — trigger is in `supabase/`, obligations are in `memory/` |
| **Current staleness** | not applicable; last migration visible in history was properly logged |

---

### MOB-02 — PLAN.md Sprint Item Completed

| Field | Value |
|---|---|
| **Trigger surface** | `PLAN.md` diff shows a `- [ ]` → `- [x]` transition in "本輪重點" section |
| **Inferred event** | `sprint_item_complete` |
| **Inference quality** | syntactic (checkbox transition is literal) |
| **Required artifact** | `memory/01_active_task.md` (progress updated), `memory/YYYY-MM-DD.md` |
| **Verification boundary** | within 5 commits after trigger commit |
| **False positive risk** | **low** for major items; **medium** for minor sub-items (some `[x]` transitions are tactical tracking, not semantic phase events) |
| **Disambiguation rule** | top-level `- [ ]` items in "本輪重點" are obligations; nested sub-items under a single delivery unit are not |
| **Self-referential risk** | none — trigger in `PLAN.md`, obligations in `memory/` |
| **Current staleness** | `01_active_task.md` updated today; appears aligned with current sprint state |

---

### MOB-03 — PLAN.md Sprint Boundary Change

| Field | Value |
|---|---|
| **Trigger surface** | `PLAN.md` diff shows "本輪聚焦" header date changes OR "當前階段" section content changes |
| **Inferred event** | `sprint_boundary` |
| **Inference quality** | semantic (date header change implies sprint rollover; requires reading the diff to confirm) |
| **Required artifact** | `memory/01_active_task.md` (reset to new sprint), `MEMORY.md` (if durable lessons from prior sprint) |
| **Verification boundary** | same commit or next semantic commit |
| **False positive risk** | **medium** — cosmetic date edits (formatting) vs real sprint boundary; hard to distinguish syntactically |
| **Disambiguation rule** | obligation fires only if sprint date AND at least one "已完成" section item changed |
| **Self-referential risk** | none |
| **Current staleness** | last sprint boundary was 2026-05-16; `01_active_task.md` reflects current sprint |

---

### MOB-04 — governance/ Policy Content Changed

| Field | Value |
|---|---|
| **Trigger surface** | `governance/AGENT.md`, `governance/ARCHITECTURE.md`, or `governance/TESTING.md` changed |
| **Inferred event** | `governance_policy_mutation` |
| **Inference quality** | **semantic** — minor wording changes and policy rewrites are syntactically identical |
| **Required artifact** | `memory/03_decisions.md` (what changed, why, and what it blocks or unblocks) |
| **Verification boundary** | within 5 commits after trigger commit |
| **False positive risk** | **high** — governance files get formatting, typo fixes, and minor clarifications frequently; these do NOT require a `03_decisions.md` entry |
| **Disambiguation challenge** | No syntactic signal reliably distinguishes "policy rewrite" from "wording fix" without semantic content analysis |
| **Proposed disambiguation** | obligation fires only if diff shows a NEW rule section, a REMOVED rule section, or a changed risk level classification — not paragraph rewording |
| **Self-referential risk** | none — trigger in `governance/`, obligation in `memory/03_decisions.md` |
| **Current staleness** | `03_decisions.md` last updated 2026-04-19; governance files updated since then |

---

### MOB-05 — ai-governance-framework Submodule Bumped

| Field | Value |
|---|---|
| **Trigger surface** | `ai-governance-framework` submodule SHA changed (detectable from `git diff --submodule` or change in `.gitmodules`) |
| **Inferred event** | `framework_version_upgrade` |
| **Inference quality** | syntactic (submodule pointer change is unambiguous) |
| **Required artifact** | `memory/02_project_facts.md` (version record), `AGENTS.md` (if hooks or keys changed), `memory/03_decisions.md` (if adoption scope changed) |
| **Verification boundary** | same commit or next commit |
| **False positive risk** | **low** — submodule bump is always an intentional version change |
| **Self-referential risk** | none — trigger is in submodule pointer, obligations are in root files |
| **Current staleness** | framework upgraded to v1.2.0+ on 2026-05-16; `02_project_facts.md` last updated 2026-04-19 — **gap exists** |

---

### MOB-06 — New Hono Route Handler Added

| Field | Value |
|---|---|
| **Trigger surface** | `apps/api/src/routes/*.ts` diff shows new `app.get/post/put/delete/patch` registration |
| **Inferred event** | `api_surface_expanded` |
| **Inference quality** | syntactic (new `.get/.post/...` call = new route) |
| **Required artifact** | `memory/04_validation_log.md` (route covered by test), `memory/03_decisions.md` if new architectural pattern |
| **Verification boundary** | same commit (new route must have test coverage in same semantic unit) |
| **False positive risk** | **medium** — Hono `.route()` chaining can look like new registration; helper functions with similar names can confuse pattern matching |
| **Disambiguation rule** | obligation fires on new top-level `app.get/post/put/delete` calls with a path string literal, not on delegated sub-app mounts |
| **Self-referential risk** | none |
| **Current staleness** | new routes (Gmail cron, job_runs read path) added recently; `04_validation_log.md` updated today, appears current |

---

### MOB-07 — Security-Sensitive RLS or Auth Code Changed

| Field | Value |
|---|---|
| **Trigger surface** | New or modified file in `supabase/migrations/` containing `CREATE POLICY`, `ALTER POLICY`, `ENABLE ROW LEVEL SECURITY`, OR changes to `user_id` scoping in `apps/api/src/routes/*.ts` |
| **Inferred event** | `security_boundary_mutation` |
| **Inference quality** | **syntactic** for migrations (policy DDL is literal); **semantic** for route code (user_id scoping changes require reading intent) |
| **Required artifact** | `memory/04_validation_log.md` (security path tested), `docs/security-boundary.md` (if boundary scope changed) |
| **Verification boundary** | same commit — security boundary changes should not be split from their validation evidence |
| **False positive risk** | **medium** for route code — `user_id` appears in many contexts that are not security boundary changes; low for migration DDL |
| **Self-referential risk** | none |
| **Current staleness** | `docs/security-boundary.md` exists; security boundary map (RLS per-table, route auth matrix) is listed as in-progress in PLAN.md |

---

### MOB-08 — Validation Count Changed in 04_validation_log.md

| Field | Value |
|---|---|
| **Trigger surface** | `memory/04_validation_log.md` diff shows new count (e.g., `173/173` → `175/175` or regression) |
| **Inferred event** | `validation_state_changed` |
| **Inference quality** | syntactic (count is literal) |
| **Required artifact** | `memory/01_active_task.md` (if regression — must be flagged); `memory/YYYY-MM-DD.md` (count advance recorded) |
| **Verification boundary** | same day (auto-commits typically cover this within minutes) |
| **False positive risk** | **low** — count changes are always meaningful |
| **Self-referential risk** | **partial** — `04_validation_log.md` change triggers obligation to update other `memory/` files, NOT itself; loop-free |
| **Note** | This is one of the few events where the trigger artifact and obligation artifact are in the same `memory/` directory but different files — still loop-free |

---

## Causal Loop Risks

Events that WOULD create self-referential obligation loops if not designed correctly:

| Circular design | Why it's circular | Correct replacement |
|---|---|---|
| `03_decisions.md changed → require 03_decisions.md updated` | trigger IS the obligation artifact | Use code/plan/governance changes as triggers; 03_decisions.md is always the obligation |
| `MEMORY.md changed → require MEMORY.md updated` | same issue | MEMORY.md is an obligation artifact only, never a trigger |
| `memory/01_active_task.md changed → require 01_active_task.md current` | same issue | PLAN.md completion or phase shift is the trigger; 01_active_task.md is the obligation |
| `04_validation_log.md → require 04_validation_log.md updated` | same issue | Test run completion (inferred from test suite output or count change) is the trigger; 04_validation_log.md is the obligation — but since we detect the event FROM 04_validation_log.md changing, the trigger surface here is the 04_validation_log.md diff itself. The obligation lands in OTHER memory files, so it's loop-free. |

---

## Verification Boundary Problem

The current commit model creates a verification ambiguity:

Hearth has ~6–12 `auto:` commits per active hour. Defining "within N commits" as the verification window mixes meaningful proximity with noise.

More robust boundary definitions:

| Boundary type | Definition | Works for |
|---|---|---|
| `same-semantic-unit` | trigger and obligation artifact appear between two consecutive semantic commits | best for "code + test together" (MOB-06, MOB-07) |
| `same-working-day` | trigger and obligation artifact both have commits with the same calendar date | acceptable for sprint-level obligations (MOB-02, MOB-03) |
| `next-semantic-commit` | obligation artifact must appear before or within the first non-auto commit after trigger | best for governance mutations (MOB-04, MOB-05) |

The auto-commit stream makes "within N commits" too coarse. `same-working-day` is the most practically automatable boundary for Hearth's current commit density.

---

## What Cannot Be Inferred from Git Diff

These obligations exist in AGENTS.md but have no reliable git-detectable trigger:

| Obligation | Why it's not inferrable | Current handling |
|---|---|---|
| "Promote durable lessons into MEMORY.md" | there is no code event that reliably corresponds to "a lesson worth keeping long-term" | human judgment only |
| "Keep PLAN.md current when priorities change" | priority changes are a decision, not a file pattern | obligation only fires if the human decides PLAN.md needs updating |
| "Run full readiness after env prerequisites confirmed" | env prerequisites are external state (Cloudflare env vars, Supabase migration apply) — not visible in git | manual gate only |

These obligations cannot be moved into the event-sourced model without an external state source (e.g., CI pass/fail, deployment record, env validation script output committed as artifact).

---

## Summary: Event Inference Admissibility

| MOB | Inference quality | False positive risk | Self-referential | Currently verifiable? |
|---|---|---|---|---|
| MOB-01 schema migration | syntactic | low | none | yes — file pattern match |
| MOB-02 sprint item complete | syntactic | low–medium | none | yes — checkbox pattern match |
| MOB-03 sprint boundary | semantic | medium | none | partially — requires date+section co-change |
| MOB-04 governance policy | semantic | **high** | none | **no** — cannot distinguish policy rewrite from wording fix |
| MOB-05 submodule bump | syntactic | low | none | yes — submodule diff |
| MOB-06 new route | syntactic | medium | none | mostly — HTTP verb pattern |
| MOB-07 security boundary | syntactic (migration) / semantic (route) | low–medium | none | partially |
| MOB-08 validation count | syntactic | low | partial (loop-free) | yes — count regex match |

The primary obstacle to automated verification is MOB-04 (governance policy mutation): high false positive risk from semantic inference ambiguity. This is the event that most resembles `claim_discipline_drift` in the epistemic framework — observable pattern, but causal attribution requires a layer that syntactic diff cannot provide.

---

## Next Decision Points (not implementing yet)

Before writing any enforcement script, these questions need answers:

1. **MOB-04 disambiguation**: is there a structural convention (e.g., "only H2-level sections are policy; below H2 is implementation detail") that makes governance policy changes syntactically inferrable?

2. **Verification boundary**: is `same-working-day` an acceptable proxy for "same semantic unit" for Hearth's current commit density? Or do we need the semantic-commit boundary instead?

3. **Auto-commit exclusion**: should `auto:` commits be explicitly excluded from obligation triggering? If yes, only semantic commits can fire obligations — which would miss some real state transitions that happen to land in auto-commits.

4. **Obligation expiry**: if an obligation is triggered but the artifact never appears, how long before it's treated as a governance gap vs. a valid deferral?
