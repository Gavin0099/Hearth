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
- [ ] Continue thinning `apps/api/src/routes/import.ts` by deciding whether remaining helpers should move out of the route file into import-domain modules
- [ ] Keep structured memory and daily logs in sync going forward

## Context
- **Recent achievements**: stock routes now delegate their DB orchestration through `apps/api/src/lib/stock-import.ts`; all import routes share preflight helpers; repeated parse-result orchestration is collapsed into shared helpers; and the two last bespoke branches (`transactions-csv`, `dividends-csv`) now also have dedicated helper paths.
- **Validation baseline**: `npm.cmd --workspace @hearth/api run build` and `npm.cmd --workspace @hearth/api run test` both pass after the cleanup.
- **Next steps**: Decide whether to keep the new helpers inside `import.ts` or promote them into `lib/` modules; after that, move to another `P0 correctness` or operational slice instead of churning the same route forever.
