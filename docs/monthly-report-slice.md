# Monthly Report Slice

This is the first Phase C implementation slice for `Hearth`.

## What exists now

- shared transaction and monthly-report response types
- a Supabase-backed `GET /api/report/monthly` route skeleton
- frontend monthly report panel
- local route-level test coverage for the monthly summary aggregation path

## Current scope

The monthly report currently reads normalized `transactions` only.

It summarizes:

- total income
- total expense
- top category expense totals
- daily income/expense sequence
- transaction count

## What is intentionally deferred

- CSV / Excel parser ingestion
- manual transaction creation UI
- richer charts
- budget comparison
- recurring transaction logic
