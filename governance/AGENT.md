# AGENT.md — Hearth Repo Engineering Governance

Version: 1.0
Scope: Repo-local engineering governance for Hearth.

This file defines how engineering changes in Hearth are classified and executed.
Workspace behavior remains governed by `AGENTS.md` in repo root.

## Level classification

- `L0`:
  - docs-only wording fixes
  - comment/formatting-only changes with no behavior impact
- `L1`:
  - UI behavior updates that do not alter financial calculation logic
  - non-critical API ergonomics or validation messages
  - import UX improvements without changing parser semantics
- `L2`:
  - transaction amount/sign/category/date handling
  - source-hash dedupe behavior
  - auth boundary, account ownership scoping, or RLS-sensitive paths
  - schema changes under `supabase/schema.sql`
  - recurring apply logic and monthly report aggregation
  - deploy/runtime config that can affect production correctness or data safety

When uncertain between levels, upgrade to the higher level.

## Required execution rigor

- `L0`:
  - bounded change + one lightweight verification
- `L1`:
  - explicit behavior statement before implementation
  - run impacted checks/tests
  - update docs when surface behavior changes
- `L2`:
  - explicit contract and failure-path reasoning
  - run full affected test suite plus build/check gates
  - ensure user ownership and data-integrity constraints are preserved
  - record decision/risk notes in `memory/YYYY-MM-DD.md`

## Escalation triggers

Escalate before proceeding when:

- there are multiple viable product behaviors with different trade-offs
- scope expansion touches both parser semantics and persistence logic
- touched files overlap with unrelated pending work in the same areas
- test evidence cannot convincingly cover changed risk surface

## Hearth-specific guardrails

- Treat `transactions` as source-of-truth for cashflow reporting.
- Treat ownership checks (`user_id` via auth + account join scoping) as non-optional.
- Keep import parsers deterministic and repeatable.
- Do not weaken dedupe rules without explicit migration/backfill plan.
