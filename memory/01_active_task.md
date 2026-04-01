# Current Task: Import Route Cleanup And Memory Discipline

## Progress
- [x] Local governance baseline exists under `governance/`
- [x] Structured `memory/01~04` schema has been introduced in addition to daily logs
- [x] Framework-compatible facts / decisions / validation files exist in `memory/`
- [x] Removed the legacy dead inline parsing block from `apps/api/src/routes/import.ts` for `dividends-csv`
- [ ] Continue thinning `apps/api/src/routes/import.ts` where route-owned logic still duplicates helper behavior
- [ ] Keep structured memory and daily logs in sync going forward

## Context
- **Recent achievements**: The `dividends-csv` route now relies on the shared dividend parser/batch helper only, instead of carrying a second inline parser path with encoding-corrupted dead code.
- **Validation baseline**: `npm.cmd --workspace @hearth/api run build` and `npm.cmd --workspace @hearth/api run test` both pass after the cleanup.
- **Next steps**: Continue using helper extraction plus golden tests to shrink `import.ts`, and keep structured memory plus daily logs synchronized with those refactors.
