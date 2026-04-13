# Knowledge Base

## Known Gotchas

### Import route cleanup boundary

- The old `dividends-csv` inline parsing block has been removed from `apps/api/src/routes/import.ts`.
- `dividends-csv` now follows the tested shared helper path end-to-end: parser normalization plus batch diffing.
- `sinopac-stock` now also uses the shared stock batch-preparation and holding rebuild helpers, so the two stock import routes no longer diverge on duplicate handling or weighted-cost logic.
- Holdings refresh orchestration now lives in `apps/api/src/lib/holdings.ts`, including persistence-trade normalization and per-ticker upsert/delete behavior.
- Stock-import route orchestration now lives in `apps/api/src/lib/stock-import.ts`, which owns existing-hash lookup, fresh-trade upsert, holdings refresh, and response shaping.
- Import-route preflight now also has shared helpers inside `apps/api/src/routes/import.ts` for unauthorized responses, `account_id` / file validation, and owned-account resolution.
- Transaction and stock import routes now also share route-local parse/result helpers in `apps/api/src/routes/import.ts`, so `sinopac-tw`, `credit-card-tw`, `excel-monthly`, `sinopac-stock`, and `foreign-stock-csv` no longer each carry their own parse-empty-import-response boilerplate.
- `transactions-csv` normalization and `dividends-csv` import shaping are now also isolated behind dedicated helpers inside `apps/api/src/routes/import.ts`, so the route file is mostly composing helpers rather than carrying inline import logic.
- The shared import helper stack has now been promoted into `apps/api/src/lib/import-workflows.ts`; `apps/api/src/routes/import.ts` is back to acting mainly as route wiring.
- `apps/api/src/cron/daily-update.ts` now returns a structured `DailyUpdateReport` and supports injected `supabase`, `fetch`, and `logger` dependencies, which makes scheduled-job behavior testable without real network calls.
- Scheduled-job execution history now persists to the `job_runs` table with `job_name`, start/finish timestamps, status, and full JSON report payload. This is now the canonical first ops-level trace for the `daily-update` cron.
- `apps/api/src/routes/ops.ts` now exposes `GET /api/ops/job-runs/latest`, which is bearer-auth protected and intended for internal operational inspection / smoke verification of persisted cron history.
- `GET /api/ops/job-runs/latest` supports `require_status`, `max_age_minutes`, and `require_zero_errors=true`; the last one inspects the structured `report` and rejects runs with section-level `errors`, which is how Hearth currently distinguishes true success from partial-success degradation.
- `GET /api/ops/job-runs/summary` complements the latest-run verdict with recent-window counts (`ok`, `error`, `with_report_errors`) so operators can quickly see whether a clean latest run is hiding repeated recent failures.
- `GET /api/ops/job-runs/summary` now also emits a backend verdict (`healthy` / `warning` / `critical`), reason strings, latest-run age, and consecutive failure counts; the UI should consume that verdict directly instead of re-deriving health client-side.
- `GET /api/ops/job-runs/summary` also emits the threshold policy it used. For `daily-update`, Hearth now treats runs older than `4320` minutes (72h) as stale by default so verdicts are not silently "healthy" when the caller forgets to pass freshness parameters.
- `OpsPanel` must catch request failures around `fetchOpsSummary`; otherwise a thrown request leaves the panel in perpetual loading state.
- `scripts/post-deploy-smoke.ps1` now supports `-RequireOpsSummaryHealthy` so deploy validation can fail on unhealthy recent-window summary verdicts instead of relying only on the single latest cron row.
- `ExerciseImports` in `scripts/post-deploy-smoke.ps1` now also probes `/api/import/preview`, so the preview route's auth/validation wiring is smoke-tested alongside the write endpoints.
- `ExerciseImports` now also covers `sinopac-stock`, `foreign-stock-csv`, and `dividends-csv`; the smoke run no longer stops at cashflow/excel import surfaces.
- Stock preview rows in `/api/import/preview` need a display-level `price` field mapped from `price_per_share`; otherwise the preview table shows a blank price column even when parsing succeeded.
- Cashflow preview correctness should be locked at the `/api/import/preview` route level too, not inferred only from the write endpoints; `sinopac-tw` and `credit-card-tw` can drift in preview formatting even when real import still passes.
- `/api/import/preview` should also have direct error-path coverage for owned-account rejection and account-lookup failures; otherwise preview can regress on authorization/data-layer semantics while happy-path parsing still looks healthy.
- `/api/import/preview` preflight should stay route-tested for unauthorized access plus missing `import_mode` / `account_id`; smoke checks only prove the script wiring, not the exact API contract.
- Import write routes should mirror preview-route ownership/database semantics; once `readOwnedImportFile` and `resolveOwnedImportContext` are shared, contract drift is most likely to show up as route-specific test gaps rather than implementation divergence.
- `GET /api/portfolio/net-worth` should not silently ignore `net_worth_snapshots` write failures; otherwise the top-line response looks healthy while the history/chart surface quietly goes stale.
- `GET /api/portfolio/net-worth` now opportunistically upserts `net_worth_snapshots`; the chart/history slice is only trustworthy if tests also cover that write path plus `/api/portfolio/net-worth-history`.
- `GET /api/portfolio/trade-costs` aggregates `investment_trades` in application code and must group by `ticker + currency`; otherwise USD/TWD fees get silently mixed into a fake single-currency total.
- `PortfolioPanel` should fetch `net-worth-history` only after the `net-worth` request that opportunistically writes today's snapshot; parallel fetches can make the chart miss the most recent point.
- Portfolio analytics routes must not silently swallow `price_snapshots` / `fx_rates` / holdings lookup errors and fall back to guessed values, or the UI will present incorrect net-worth / FX data as if it were healthy.
- Import dry-run preview now has a dedicated `/api/import/preview` path that reuses the real parser/normalization logic for `transactions-csv`, `sinopac-tw`, `credit-card-tw`, `excel-monthly`, `sinopac-stock`, `foreign-stock-csv`, and `dividends-csv`.
- `ImportPanel` should treat preview fetch failures as a separate failure path from validation errors; request throws must clear preview state and release the loading indicator.
- `apps/web/src/lib/pdf-parser.ts` currently relies on a repo-local `tesseract.js` ambient declaration (`apps/web/src/tesseract.d.ts`) to keep TypeScript happy under the current dependency/toolchain combination.
- `GmailSyncPanel` now lazy-loads `../lib/pdf-parser` at sync time, which keeps `pdfjs-dist` and `tesseract.js` out of the main application bundle and leaves OCR in a separate chunk.
- `import.ts` still contains other older route-owned branches and some legacy text noise, so continue refactors as focused slices with build/test verification.

### Memory model in Hearth

- Hearth keeps both structured framework memory (`memory/01~04`) and append-only daily notes (`memory/YYYY-MM-DD.md`).
- `memory/01_active_task.md` should stay concise; detailed implementation narrative belongs in the daily log.

## Reusable Practices

- When import correctness changes, prefer pure helper extraction plus golden tests before large route rewrites.
- Keep `supabase/migrations/` as canonical schema history and `supabase/schema.sql` as the latest bootstrap snapshot.
