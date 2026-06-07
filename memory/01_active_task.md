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
- [x] Unified credit-card CSV/PDF parser date mapping to posted date / 入帳起息日
- [x] Expanded `excel-monthly` parser for formula-heavy workbook ingestion
- [x] Extended recurring candidate -> template flow to carry optional amount
- [x] Completed initial security-boundary consolidation (`docs/security-boundary.md`)
- [x] Completed one-click recurring workflow (`ImportPanel`: create candidates -> templates -> apply current month)
- [x] Synced PLAN freshness/inventory and structured memory after the latest governance refresh
- [x] Upgraded `ai-governance-framework` to v1.2.0 (`78984f4`); full adopt (framework.lock.json, governance docs, rule packs, hooks, AGENTS.md governance keys)
- [x] Fixed Gmail OAuth re-login loop: added `access_type=offline` to get persistent refresh token
- [x] Fixed Gmail bill sync missing recent emails: removed `has:attachment` filter, added 90-day date range, maxResults=12
- [x] Backfilled historical injection artifacts so required memory files are explicitly present in `LOADED`
- [x] Added automated injection-memory validation script and wired it into first-release readiness flow
- [x] Hardened first-release readiness gate to fail fast on non-zero `npm` step exit code
- [x] Restored API suite to green (`173/173`) by aligning tests with current import/ops behavior
- [x] Added route/panel lazy-loading in `apps/web/src/App.tsx` and reduced JS chunk pressure via package-level Vite vendor chunking
- [x] Completed UI foundation Step 1+2 baseline: Warm Finance Console design tokens + shadcn-style primitive layer (`Button/Card/Badge/Tabs/Dialog/Skeleton`) with Radix tabs/dialog base
- [x] Completed UI Step 3 baseline: home information architecture now separates primary workflow (Gmail sync/import) from secondary analytics panels
- [x] Completed UI Step 4 first visual polish slice: typography hierarchy + panel depth + staged home-enter motion with reduced-motion accessibility fallback
- [x] Completed UI Step 5 baseline: mobile/accessibility pass for nav flow, touch targets, and small-screen spacing consistency

## Context
- **Recent achievements**: portfolio analytics now include verified `net-worth-history` and `trade-costs` behavior, import dry-run preview goes through the real parser/normalization path for cashflow, excel, stock, and dividend modes, and ops expose verdict-level health instead of raw counts only.
- **Validation baseline**: `npm run readiness:first:strict` now passes end-to-end; `npm --workspace @hearth/api run test` passes at `173/173`; `npm --workspace @hearth/web run check` and `npm --workspace @hearth/web run build` pass with largest JS chunk reduced below warning threshold.
- **Next steps**: start selective component restyling pass (Gmail/Import panel internals first) to align detailed form/table surfaces with the updated home visual system.

## 2026-05-22 Governance Re-Onboarding Snapshot

- `ai-governance-framework` submodule URL was aligned to GitLab remote.
- `contract.yaml` manual decision captured: keep `domain=household-finance`, set `risk_tier=L2`.
- `pre-commit` and `pre-push` hooks were installed and pre-push trigger was verified via `git hook run pre-push -- origin`.
- Local runtime prerequisites were restored with `D:\Hearth\.venv\Scripts\python.exe`.
- `external-onboarding` and `runtime-smoke` were executed successfully after adding `.governance/version_manifest.yaml`.
- Governance drift is now `severity=ok` after admitting post-task visibility keys via Expansion Admission Gate update.



- 2026-06-07: 完成 GmailSyncPanel 與 ImportPanel 的 UI 表單/列表視覺一致化；預計下一步完成銀行/信用卡 ledger 的同層次 token 化。
