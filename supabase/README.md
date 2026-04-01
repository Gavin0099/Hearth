# Supabase Schema Workflow

`supabase/schema.sql` remains the bootstrap snapshot for a brand-new project.

`supabase/migrations/` is now the canonical change log for schema evolution:

1. Add a new timestamped SQL file for every schema change.
2. Keep each migration additive or include an explicit rollback/backfill note.
3. After the migration is finalized, fold the latest schema shape back into `supabase/schema.sql` so fresh environments still have a single bootstrap entrypoint.
4. Do not rewrite or reorder old migration files after they have been committed.

Current baseline migration:

- `supabase/migrations/20260401000000_baseline.sql`

Until a dedicated migration runner is introduced, apply SQL in order with your normal Supabase SQL workflow and treat `schema.sql` as the latest snapshot, not the only history.
