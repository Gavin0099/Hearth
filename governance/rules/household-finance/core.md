# Household Finance Domain Rule Pack

## Data Ownership

- Every read or write operation must be scoped to accounts owned by the authenticated user.
- Never expose transaction data across user boundaries.
- Report aggregation must derive from user-owned accounts only.

## Financial Data Integrity

- Transaction amount sign semantics must never change implicitly.
- Dedupe hash input contract must remain stable unless an explicit migration strategy is documented.
- Recurring-transaction apply logic must be idempotent within the same period.

## Parser Safety

- Parser changes that affect amount, date, or category extraction are treated as L2 and require full verification gates.
- PDF/OCR fallback paths must not silently drop transactions; failures must surface as explicit errors.

## Schema Stability

- Column renames or type changes in financial tables require a migration with a rollback path.
- Removing columns used in aggregation is blocked until all report queries are updated.

## Verification Gates

- Changes touching ownership, parser semantics, or report aggregation require:
  - passing unit tests for the affected module
  - a PLAN.md note confirming scope and intent
  - human review before merge if the change is non-additive
