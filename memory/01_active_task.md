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
- [ ] Continue thinning `apps/api/src/routes/import.ts` where dividends and generic transactions still own bespoke parse/import shaping
- [ ] Keep structured memory and daily logs in sync going forward

## Context
- **Recent achievements**: stock routes now delegate their DB orchestration through `apps/api/src/lib/stock-import.ts`; all import routes share preflight helpers; and the repeated transaction/stock parse-result orchestration has been collapsed into shared route helpers.
- **Validation baseline**: `npm.cmd --workspace @hearth/api run build` and `npm.cmd --workspace @hearth/api run test` both pass after the cleanup.
- **Next steps**: Continue using helper extraction plus golden tests to shrink `import.ts`, with the next obvious targets being the bespoke `transactions-csv` row-normalization branch and the dividends import branch.
