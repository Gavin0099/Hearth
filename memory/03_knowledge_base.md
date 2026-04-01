# Knowledge Base

## Known Gotchas

### Import route cleanup boundary

- The old `dividends-csv` inline parsing block has been removed from `apps/api/src/routes/import.ts`.
- `dividends-csv` now follows the tested shared helper path end-to-end: parser normalization plus batch diffing.
- `sinopac-stock` now also uses the shared stock batch-preparation and holding rebuild helpers, so the two stock import routes no longer diverge on duplicate handling or weighted-cost logic.
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
