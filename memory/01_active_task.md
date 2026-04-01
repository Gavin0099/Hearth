# Current Task: Import Route Cleanup And Memory Discipline

## Progress
- [x] Local governance baseline exists under `governance/`
- [x] Structured `memory/01~04` schema has been introduced in addition to daily logs
- [x] Framework-compatible facts / decisions / validation files exist in `memory/`
- [x] Removed the legacy dead inline parsing block from `apps/api/src/routes/import.ts` for `dividends-csv`
- [x] Aligned `sinopac-stock` with shared stock-import batch and holding rebuild helpers
- [x] Extracted shared holdings refresh orchestration for stock import routes
- [x] Extracted shared stock import execution flow for the two stock import routes
- [ ] Continue thinning `apps/api/src/routes/import.ts` where route-owned DB write logic still duplicates across import families
- [ ] Keep structured memory and daily logs in sync going forward

## Context
- **Recent achievements**: both stock import routes now share a full stock-import execution helper, so the routes mainly own auth, account selection, and source-specific parsing.
- **Validation baseline**: `npm.cmd --workspace @hearth/api run build` and `npm.cmd --workspace @hearth/api run test` both pass after the cleanup.
- **Next steps**: Continue using helper extraction plus golden tests to shrink `import.ts`, and keep structured memory plus daily logs synchronized with those refactors.
