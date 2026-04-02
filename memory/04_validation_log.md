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

## Review Notes

- Web check remains blocked by the known `tesseract.js` typing issue and is not attributable to the recent API correctness slices.

## 2026-04-01 Governance Adoption

- `npm.cmd run readiness:first:codeonly`
- Result: script completed and reported `PASS`
- Observed caveats:
  - nested API test invocation inside the readiness script still hit sandbox `spawn EPERM`
  - web check still reports the pre-existing `tesseract.js` module/type issue in `apps/web/src/lib/pdf-parser.ts`
