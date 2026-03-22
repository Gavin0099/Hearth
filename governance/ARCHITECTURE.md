# ARCHITECTURE.md — Hearth Engineering Boundaries

Version: 1.0

## Core boundaries

- Web app (`apps/web`):
  - presentation + user interaction
  - no trust in client-side ownership decisions
- API worker (`apps/api`):
  - auth resolution
  - ownership enforcement
  - domain orchestration for import/report/recurring flows
- Supabase:
  - persistent state
  - auth identity source
  - schema constraints and data integrity

## Non-negotiable invariants

- A user can only read/write rows associated with owned accounts.
- Cashflow report math must be based on persisted `transactions`.
- Import dedupe must remain deterministic by stable hash inputs.
- Recurring apply must be idempotent for same template + period.

## Change impact guidance

- Schema updates require matching shared type and API alignment.
- Parser updates require regression coverage for prior accepted formats.
- Auth boundary updates require negative-path tests (invalid/missing token).
- Deploy/runtime config updates require post-deploy smoke verification.
