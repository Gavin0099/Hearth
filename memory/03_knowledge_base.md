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
- `import.ts` still contains other older route-owned branches and some legacy text noise, so continue refactors as focused slices with build/test verification.

### Web check blocker

- `npm --workspace @hearth/web run check` is still blocked by a pre-existing `tesseract.js` module/type issue in `apps/web/src/lib/pdf-parser.ts`.
- This is not caused by the recent import correctness work.

### Memory model in Hearth

- Hearth keeps both structured framework memory (`memory/01~04`) and append-only daily notes (`memory/YYYY-MM-DD.md`).
- `memory/01_active_task.md` should stay concise; detailed implementation narrative belongs in the daily log.

## Reusable Practices

- When import correctness changes, prefer pure helper extraction plus golden tests before large route rewrites.
- Keep `supabase/migrations/` as canonical schema history and `supabase/schema.sql` as the latest bootstrap snapshot.
