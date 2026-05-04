# Security Boundary - Hearth (Initial Baseline)

Last updated: 2026-05-04
Owner: Hearth maintainers

## Purpose

This document defines Hearth's current data-security boundary for day-to-day engineering decisions.
It is intentionally practical: what is enforced now, what is not, and what must not be weakened.

## Trust boundaries

1. Client (`apps/web`)
- Untrusted for ownership decisions.
- May send malformed or hostile payloads.
- Must never be treated as authorization source.

2. API worker (`apps/api`)
- Canonical enforcement layer for auth, ownership checks, and write validation.
- Resolves Supabase bearer token identity via `/api/auth/me` and route middleware helpers.
- Uses server-side database client; route code must enforce ownership checks explicitly.

3. Supabase
- System of record for identities and persisted financial data.
- Schema constraints and migration discipline protect data integrity.
- Current design still relies on API-side ownership checks as primary boundary.

## Current enforced controls

1. Authentication boundary
- Protected routes return `401 unauthorized` when bearer user is missing/invalid.
- API tests cover unauthenticated negative paths for core routes.

2. Ownership boundary
- Account-scoped operations verify account belongs to current `user_id`.
- Import and recurring flows reject unowned account access with validation errors.

3. Secret handling boundary
- `user_settings` sensitive PDF passwords are write-encrypted in worker layer (AES-GCM).
- Explicit secret fetch endpoint is separated from regular settings read path.
- Legacy plaintext values are upgraded on read/backfill path.
- Missing `USER_SETTINGS_SECRET_KEY` fails closed for secret operations.

4. Data integrity boundary
- Cashflow source of truth is `transactions`.
- Import dedupe uses stable `source_hash`.
- Recurring apply is idempotent through deterministic hash and duplicate checks.
- Schema changes must update both `supabase/migrations/` and `supabase/schema.sql`.

## Known gaps (accepted for now)

1. RLS-first enforcement is not yet the primary enforcement layer for all domains.
2. Some global datasets (example: price snapshots) are authenticated but not strictly per-user owned by schema.
3. Runtime artifacts and memory logs may contain operational metadata and must be treated as internal-only.

## Non-negotiable rules

1. Never bypass account ownership checks in API routes.
2. Never return raw secrets from general settings endpoints.
3. Never weaken dedupe/hash semantics without explicit migration/backfill plan.
4. Never introduce schema drift outside migration workflow.

## Hardening backlog (next)

1. RLS hardening map by table and route.
2. Route-by-route matrix: auth + ownership + validation + failure code contract.
3. Secret lifecycle policy: rotation cadence and plaintext tail elimination target date.
