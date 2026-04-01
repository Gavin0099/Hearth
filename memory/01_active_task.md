# Current Task: Full ai-governance-framework Adoption In Hearth

## Progress
- [x] Local governance baseline exists under `governance/`
- [x] Structured `memory/01~04` schema has been introduced in addition to daily logs
- [x] Framework-compatible facts / decisions / validation files exist in `memory/`
- [ ] Clean the legacy dead inline parsing block in `apps/api/src/routes/import.ts`
- [ ] Keep structured memory and daily logs in sync going forward

## Context
- **Recent achievements**: Hearth now has local `SYSTEM_PROMPT`, `HUMAN-OVERSIGHT`, `REVIEW_CRITERIA`, and framework-compatible memory files instead of relying only on the submodule and date-based logs.
- **Next steps**: Use `memory/01_active_task.md` for current state, `03_decisions.md` / `03_knowledge_base.md` / `04_validation_log.md` for durable structured records, and continue appending implementation detail to `memory/YYYY-MM-DD.md`.
