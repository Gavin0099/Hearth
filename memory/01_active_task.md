# Current Task: Import Route Cleanup And Memory Discipline

## Progress
- [x] Local governance baseline exists under `governance/`
- [x] Structured `memory/01~04` schema has been introduced in addition to daily logs
- [x] Framework-compatible facts / decisions / validation files exist in `memory/`
- [x] Removed the legacy dead inline parsing block from `apps/api/src/routes/import.ts` for `dividends-csv`
- [x] Aligned `sinopac-stock` with shared stock-import batch and holding rebuild helpers
- [x] Extracted shared holdings refresh orchestration for stock import routes
- [x] Extracted shared stock import execution flow for the two stock import routes
- [x] Routes now delegate stock import DB orchestration through `stock-import.ts`
- [x] Extracted shared import preflight helpers for auth/form/account ownership checks in `apps/api/src/routes/import.ts`
- [x] Extracted shared transaction/stock parse-result helpers inside `apps/api/src/routes/import.ts`
- [x] Extracted dedicated helpers for `transactions-csv` normalization and `dividends-csv` import shaping
- [x] Moved shared import helper stack into `apps/api/src/lib/import-workflows.ts`
- [x] Added execution reporting and first automated tests for the `daily-update` cron path
- [x] Persisted cron execution summaries into `job_runs`
- [x] Added authenticated `job_runs` read path and smoke coverage for cron history
- [ ] Continue on the next `P0 ops` slice after cron-history inspection baseline
- [ ] Keep structured memory and daily logs in sync going forward

## Context
- **Recent achievements**: stock routes now delegate their DB orchestration through `apps/api/src/lib/stock-import.ts`; all import routes share preflight, parse-result, transaction-csv, and dividend import helpers in `apps/api/src/lib/import-workflows.ts`; the `daily-update` cron now both returns structured execution reports and persists them into `job_runs`; and there is now an authenticated ops endpoint plus smoke hook for reading the latest cron run.
- **Validation baseline**: `npm.cmd --workspace @hearth/api run build` and `npm.cmd --workspace @hearth/api run test` both pass after the cleanup.
- **Next steps**: Stay off route-cleanup churn and continue the operational path from cron observability outward.
