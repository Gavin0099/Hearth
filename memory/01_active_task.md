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
- [ ] Move to the next `P0 correctness / ops` slice instead of continuing route-only cleanup
- [ ] Keep structured memory and daily logs in sync going forward

## Context
- **Recent achievements**: stock routes now delegate their DB orchestration through `apps/api/src/lib/stock-import.ts`; all import routes share preflight, parse-result, transaction-csv, and dividend import helpers; and that helper stack now lives in `apps/api/src/lib/import-workflows.ts` instead of inside the route file.
- **Validation baseline**: `npm.cmd --workspace @hearth/api run build` and `npm.cmd --workspace @hearth/api run test` both pass after the cleanup.
- **Next steps**: Stop churning `import.ts` and switch to the next `P0 correctness` or operational slice.
