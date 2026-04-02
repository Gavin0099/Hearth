# Current Task: Portfolio Surface Closure And Memory Discipline

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
- [x] Added stricter cron verdict rules so ops checks can reject section-level report errors
- [x] Added recent-window cron summary view for repeated failure inspection
- [x] Verified `net-worth-history` and `trade-costs` API behavior with regression tests
- [x] Upgraded import preview from client-side file sniffing to parser-backed `/api/import/preview`
- [x] Fixed `trade-costs` to stop mixing different currencies into a fake TWD total
- [x] Fixed portfolio load order so `net-worth-history` reads after the snapshot-producing `net-worth` call
- [x] Added explicit error feedback for monthly-report category drill-down fetch failures
- [x] Restored `@hearth/web` typecheck by adding a local `tesseract.js` module shim
- [x] Split OCR/PDF parsing off the main web bundle through runtime lazy import in `GmailSyncPanel`
- [x] Upgraded ops summary from passive counts to machine-readable verdicts (`healthy` / `warning` / `critical`)
- [x] Added explicit ops threshold policy to the summary contract so freshness is no longer implicit / caller-only
- [x] Closed final-review findings around stale ops loading and silent portfolio DB-error fallback
- [x] Extended post-deploy smoke so ops checks can require healthy recent-window summary verdicts, not only a healthy latest run
- [ ] Run findings-first final code review on the current UI/product-closure batch
- [ ] Keep structured memory and daily logs in sync going forward

## Context
- **Recent achievements**: portfolio analytics now include `net-worth-history` and `trade-costs` routes/types with regression coverage, import dry-run preview now goes through the real parser/normalization path, the portfolio UI no longer renders mixed-currency trade costs as if they were all TWD, and ops now expose verdict-level health instead of raw counts only.
- **Validation baseline**: `npm.cmd --workspace @hearth/api run build` and `npm.cmd --workspace @hearth/api run test` now pass with the import-preview slice in place (`98/98`).
- **Next steps**: finish the findings-first review of the current A1/B1/A2/C1/C2/D1 worktree and then decide whether to commit/push the D1 API/shared pieces separately from the user’s in-progress UI changes.
