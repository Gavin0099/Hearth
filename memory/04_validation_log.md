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

## Review Notes

- Web check remains blocked by the known `tesseract.js` typing issue and is not attributable to the recent API correctness slices.

## 2026-04-01 Governance Adoption

- `npm.cmd run readiness:first:codeonly`
- Result: script completed and reported `PASS`
- Observed caveats:
  - nested API test invocation inside the readiness script still hit sandbox `spawn EPERM`
  - web check still reports the pre-existing `tesseract.js` module/type issue in `apps/web/src/lib/pdf-parser.ts`
