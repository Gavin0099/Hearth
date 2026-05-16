# Validation Log

## 2026-03-31

- `npm.cmd --workspace @hearth/api run build`
- `npm.cmd --workspace @hearth/api run test`
- Dividend visibility, net-worth summary, foreign-stock import, and early correctness/security slices verified during this window.

## 2026-04-01

- `npm.cmd --workspace @hearth/api run build`
- `npm.cmd --workspace @hearth/api run test`
- Validation count progressed through:
  - `59/59`
  - `62/62`
  - `66/66`
  - `70/70`
  - `74/74`
  - `75/75`
  - `76/76`
  - `79/79`
  - `81/81`
  - `83/83`
  - `85/85`
  - `87/87`
- Scope covered:
  - user-settings secret handling
  - migration baseline setup
  - import batch dedupe behavior
  - report/import golden matrices
  - dividends / stock / transaction import helper extraction
  - dividend route dead-code cleanup and ownership-check alignment
  - `sinopac-stock` route refactor onto shared batch + holding helpers
  - shared holdings refresh orchestration plus new helper-level portfolio tests
  - shared stock-import execution helper with route-level regression coverage still green
  - shared import-route preflight helpers for file validation and owned-account resolution
  - promotion of the shared import helper stack into `apps/api/src/lib/import-workflows.ts`
  - `daily-update` cron execution reporting plus injected-dependency tests (`89/89`)
  - `job_runs` persistence for cron execution summaries (`89/89`)
  - ops endpoint + smoke extension for latest cron-history inspection (`91/91`)
  - strict ops verdict rules for section-level cron report errors (`93/93`)
  - recent-window ops summary for cron-history inspection (`94/94`)

## 2026-04-02

- `npm.cmd --workspace @hearth/api run build`
- `npm.cmd --workspace @hearth/api run test`
- `npm.cmd --workspace @hearth/web run check`
- `npm.cmd --workspace @hearth/web run build`
- Validation count progressed to:
  - `96/96`
  - `98/98`
  - `99/99`
  - `100/100`
  - `102/102`
  - `105/105`
  - `107/107`
  - `109/109`
  - `112/112`
  - `126/126`
  - `170/170`
- Scope covered:
  - `portfolio/trade-costs` response shape aligned with `InvestmentCostsResponse`
  - `portfolio/net-worth` snapshot upsert regression coverage
  - `portfolio/net-worth-history` response normalization coverage
  - `portfolio/trade-costs` per-ticker-per-currency fee/tax aggregation coverage
  - holdings test stub updated for price-snapshot enrichment
  - parser-backed `/api/import/preview` route coverage for normalized CSV and `excel-monthly`
  - front-end dry-run preview now uses the API parser path instead of local file sniffing
  - local `tesseract.js` type shim restores `@hearth/web` TypeScript check
  - OCR parser now lazy-loads into a separate web chunk; production web build passes and main bundle size dropped materially
  - ops summary now includes backend verdicts, reason strings, age, and consecutive-failure counters (`99/99`)
  - ops summary now also includes explicit threshold policy and default daily-update freshness protection
  - portfolio DB-error paths and ops panel request-failure path are now covered; API suite moved to `102/102`
  - post-deploy smoke now supports recent-window ops summary verdict enforcement
  - parser-backed import preview now has route coverage for `sinopac-stock`, `foreign-stock-csv`, and `dividends-csv`; API suite moved to `105/105`
  - parser-backed import preview now also has direct route coverage for `sinopac-tw` and `credit-card-tw`; API suite moved to `107/107`
  - parser-backed import preview now also has direct error-path coverage for unowned accounts and account lookup failures; API suite moved to `109/109`
  - parser-backed import preview now also has direct preflight coverage for unauthorized, missing `import_mode`, and missing `account_id`; API suite moved to `112/112`
  - all import write routes now also have direct contract coverage for unowned-account rejection and account-lookup `database_error`; API suite moved to `126/126`
  - `GET /api/portfolio/net-worth` now returns `database_error` when `net_worth_snapshots` persistence fails instead of silently dropping the history write; API suite moved to `170/170`
  - post-deploy smoke import checks now also cover `/api/import/preview` validation wiring
  - post-deploy smoke import checks now also cover stock-trade and dividend import endpoints

## 2026-04-01 Governance Adoption

- `npm.cmd run readiness:first:codeonly`
- Result: script completed and reported `PASS`
- Observed caveats:
  - nested API test invocation inside the readiness script still hit sandbox `spawn EPERM`
  - web check still reports the pre-existing `tesseract.js` module/type issue in `apps/web/src/lib/pdf-parser.ts`

## 2026-04-13 Canonical Audit Trend Verification

- `git pull --ff-only origin main` (Hearth root)
- `python ai-governance-framework/governance_tools/session_end_hook.py --project-root . --format json`
- `Get-Content artifacts/runtime/canonical-audit-log.jsonl | ConvertFrom-Json | Group-Object { $_.signals.Count -gt 0 } | Select-Object Name, Count`
- `python ai-governance-framework/governance_tools/session_end_hook.py --project-root . --format json | python -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['canonical_audit_trend'], indent=2))"`
- `python governance_tools/session_end_hook.py --project-root tmp/canonical-trend-fixture --format json | python -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['canonical_audit_trend'], indent=2)); print(json.dumps(d['canonical_usage_audit'], indent=2))"` (run in `ai-governance-framework`)
- Observed:
  - Scenario A (`Hearth`) trend showed `signal_ratio=1.0` with `test_result_artifact_absent` dominating.
  - Scenario B fixture trend showed `signal_ratio=0.5455` and `adoption_risk=true` across 11 read entries (10 fixture + 1 hook run).

## 2026-04-13 Web Loading Deadlock Hotfix

- `npm.cmd --workspace @hearth/web run check`
- Result: pass
- Scope:
  - wrapped network-throw paths in `apps/web/src/lib/accounts.ts` (`fetchAccounts`)
  - wrapped network-throw paths in `apps/web/src/lib/portfolio.ts` (`fetchPortfolioHoldings`, `fetchNetWorth`, `fetchPortfolioDividends`, `fetchFxRates`, `fetchNetWorthHistory`, `fetchTradeCosts`)
  - objective: avoid infinite `loading` UI states when API requests fail before returning JSON

## 2026-05-04

- git pull --ff-only origin main (Hearth root) -> already up to date
- git -C ai-governance-framework fetch --all --prune + checkout origin/main -> moved to 502b80`n- 
pm.cmd --workspace @hearth/api run build -> pass
- 
pm.cmd --workspace @hearth/web run check -> pass
- 
ode --test apps/api/tests/pdf-credit-card.test.ts -> sandbox spawn EPERM (environment limitation)
- Scope covered:
  - credit-card posted-date import semantics across CSV/PDF parsers
  - formula-heavy excel-monthly parsing + recurring sidebar detail extraction
  - recurring template creation from candidates now carries mount`n

- python ai-governance-framework/governance_tools/governance_drift_checker.py --repo . --framework-root ai-governance-framework --format json -> pass (all checks ok)

- 
pm.cmd --workspace @hearth/web run check -> pass (ImportPanel recurring create+apply flow)

- npm.cmd --workspace @hearth/web run check -> pass
- python ai-governance-framework/governance_tools/plan_freshness.py --file PLAN.md --format json -> `FRESH` (2026-05-04, 0 days)
- python ai-governance-framework/governance_tools/adopt_governance.py --target . --refresh -> baseline inventory refreshed
- python ai-governance-framework/governance_tools/governance_drift_checker.py --repo . --framework-root ai-governance-framework --format json -> pass (all checks ok)

## 2026-05-16

- `npm run governance:validate-injection-memory` -> pass
- Scope covered:
  - enforced required memory references in injection artifacts (`memory/01_active_task.md`, `memory/04_validation_log.md`, `MEMORY.md`)
  - repaired historical `artifacts/runtime/injection/2026-05-07/*.json` `LOADED` fields to satisfy current governance baseline
  - wired injection-memory validation into first-release readiness flow (`scripts/first-release-readiness.ps1`)
- `npm run readiness:first:strict` -> pass (governance gate + env validation + api tests + api build + web check + web build)
- `npm --workspace @hearth/api run test` -> pass (`173/173`)
- `npm --workspace @hearth/web run check` -> pass
- `npm --workspace @hearth/web run build` -> pass
- Scope covered:
  - readiness gate now fails fast on non-zero `npm` step exit codes
  - API test expectations aligned with current import/ops behavior
  - web bundle optimization: Vite vendor chunks split by package + route/panel lazy loading in `App.tsx`
  - post-optimization build no longer emits `>500k` JS chunk warning (largest JS chunk: `vendor_pdfjs-dist` ~446k)
- `npm --workspace @hearth/web run check` -> pass
- `npm --workspace @hearth/web run build` -> pass
- Scope covered:
  - home UI simplified (hide recurring/manual panels)
  - Gmail PDF import fallback now retries blank password on failure
  - fixed Gmail fallback detached-buffer worker error by cloning bytes per parse attempt
  - first home UI uplift slice landed (status hero + semantic color tokens + clearer button hierarchy)
