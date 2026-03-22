# Hearth Core Rules

## Ownership safety

- Every write path must prove account ownership for current authenticated user.
- Every read list path must stay user-scoped by owned account IDs.

## Data integrity

- Never change transaction amount sign semantics implicitly.
- Keep dedupe hash input contract stable unless migration strategy exists.
- Keep recurring apply behavior idempotent within the same period.

## Verification

- Changes touching ownership, parser semantics, or report aggregation are treated as L2 and require full verification gates.
