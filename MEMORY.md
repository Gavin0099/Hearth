# MEMORY.md - Hearth Long-Term Memory

## Product Identity

- `Hearth` is a household-finance and personal-asset management system for real financial workflows, not a throwaway demo.
- The product scope is: account aggregation, cashflow reporting, imports/parsers, recurring flows, portfolio tracking, and operational readiness.

## Architecture Decisions

- Supabase is the persistence and identity backbone.
- Cloudflare Pages + Workers host the web and API surfaces.
- `transactions` remain the source of truth for cashflow reporting.
- Import flows must stay deterministic through stable source-hash dedupe.
- `supabase/migrations/` is canonical schema history; `supabase/schema.sql` is the latest bootstrap snapshot.

## Governance Model

- `ai-governance-framework/` is the upstream framework reference and working submodule.
- Repo-local governance for Hearth is canonical under `governance/`.
- Hearth now keeps both:
  - structured framework-compatible memory in `memory/01~04`
  - append-only execution logs in `memory/YYYY-MM-DD.md`

## Working Model

- `PLAN.md` is the source of truth for active priorities and anti-goals.
- `memory/01_active_task.md` is the concise restart/resume handoff.
- `memory/02_*` stores factual project and tech-stack baselines.
- `memory/03_*` stores reusable gotchas and durable decisions.
- `memory/04_validation_log.md` stores review/build/test validation history.
- `memory/YYYY-MM-DD.md` stores detailed daily execution notes.

## Important Boundary

- Framework adoption is only real if local governance docs and local memory are maintained in the Hearth repo itself.
- Repo-local governance wins over framework examples when product-specific scope or delivery order differs.
