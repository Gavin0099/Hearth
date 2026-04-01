# Decisions

## 2026-03-31 to 2026-04-01

### Governance adoption model

- Hearth uses the framework submodule as reference and runtime guidance, but repo-local `governance/` documents are canonical for Hearth execution.
- Daily notes in `memory/YYYY-MM-DD.md` remain in use; structured `memory/01~04` files are added rather than replacing them.

### P0 priority order

- The highest-value work is `security`, `correctness`, and `schema discipline`, not new feature surface.
- Import/report correctness is being strengthened via helper extraction and fixture-driven regression coverage.

### Security boundary

- `user_settings` secret fields are no longer returned from the general settings endpoint.
- Application-layer encryption with `USER_SETTINGS_SECRET_KEY` is required for stored PDF passwords.

### Schema discipline

- `supabase/migrations/` is canonical change history.
- `supabase/schema.sql` is the fresh-bootstrap snapshot and must stay aligned with migrations.
