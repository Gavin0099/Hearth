# Knowledge Base

## Known Gotchas

### Import route encoding debt

- `apps/api/src/routes/import.ts` still contains an old `dividends-csv` inline parsing block with encoding-corrupted text.
- Runtime behavior no longer depends on that block because the route now reuses shared helper logic.
- Treat removal of that dead block as a focused cleanup task; do not casually refactor that area without verifying diff stability.

### Web check blocker

- `npm --workspace @hearth/web run check` is still blocked by a pre-existing `tesseract.js` module/type issue in `apps/web/src/lib/pdf-parser.ts`.
- This is not caused by the recent import correctness work.

### Memory model in Hearth

- Hearth keeps both structured framework memory (`memory/01~04`) and append-only daily notes (`memory/YYYY-MM-DD.md`).
- `memory/01_active_task.md` should stay concise; detailed implementation narrative belongs in the daily log.

## Reusable Practices

- When import correctness changes, prefer pure helper extraction plus golden tests before large route rewrites.
- Keep `supabase/migrations/` as canonical schema history and `supabase/schema.sql` as the latest bootstrap snapshot.
