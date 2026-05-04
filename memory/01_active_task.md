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
- [x] Extended parser-backed import preview coverage to stock/dividend routes and fixed blank stock price preview cells
- [x] Run findings-first final code review on the current UI/product-closure batch
- [x] Extended post-deploy smoke import checks to cover `/api/import/preview` validation wiring
- [x] Extended post-deploy smoke import checks to cover stock-trade and dividend import routes too
- [x] Extended parser-backed import preview coverage to `sinopac-tw` and `credit-card-tw`
- [x] Added direct `/api/import/preview` error-path coverage for unowned accounts and account-lookup failures
- [x] Added direct `/api/import/preview` preflight coverage for unauthorized, missing `import_mode`, and missing `account_id`
- [x] Added symmetric import write-route coverage for unowned accounts and account-lookup failures
- [x] Stopped silently swallowing `net_worth_snapshots` write failures in `GET /api/portfolio/net-worth`
- [x] Updated `ai-governance-framework` submodule to latest reachable upstream commit (`a502b80`)
- [x] Ran canonical audit trend validation (Scenario A real consuming repo + Scenario B fixture simulation) and published test report
- [x] Unified credit-card CSV/PDF parser date mapping to posted date / 入帳起息日\n- [x] Expanded `excel-monthly` parser for formula-heavy workbook ingestion\n- [x] Extended recurring candidate -> template flow to carry optional amount\n- [x] Completed initial security-boundary consolidation (`docs/security-boundary.md`)\n- [ ] Keep structured memory and daily logs in sync going forward

## Context
- **Recent achievements**: portfolio analytics now include verified `net-worth-history` and `trade-costs` behavior, import dry-run preview goes through the real parser/normalization path for cashflow, excel, stock, and dividend modes, and ops expose verdict-level health instead of raw counts only.
- **Validation baseline**: `npm.cmd --workspace @hearth/api run build` and `npm.cmd --workspace @hearth/api run test` currently pass at `170/170`; `npm.cmd --workspace @hearth/web run check` and `npm.cmd --workspace @hearth/web run build` were also restored earlier in the current closure cycle.
- **Next steps**: keep pushing new `P0 correctness / ops` slices instead of reopening the already-closed A1/B1/A2/C1/C2/D1/E1 batch, and keep structured memory aligned with the real validation state.


