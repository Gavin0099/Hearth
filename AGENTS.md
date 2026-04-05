# AGENTS.md - Hearth Workspace

This repository adopts `ai-governance-framework` as a working system, not just a reference submodule.

## Canonical Framework Source

The framework lives at:

- `ai-governance-framework/`

When this repo needs the underlying governance model, helper docs, or future runtime tooling, start there.

## Every Session

Before doing substantial work in `Hearth`, read:

1. `AGENTS.md`
2. `PLAN.md`
3. structured memory files when present:
   - `memory/01_active_task.md`
   - `memory/02_tech_stack.md` or `memory/02_project_facts.md`
   - `memory/03_knowledge_base.md` / `memory/03_decisions.md`
   - `memory/04_validation_log.md`
4. `memory/YYYY-MM-DD.md` for today and yesterday when present
5. `MEMORY.md` for curated long-term project context

Do not skip the local `Hearth` files just because the framework submodule exists.

## Division Of Responsibility

Use `Hearth` root files for repo-local operating context:

- `PLAN.md`: current product plan and implementation priorities
- `MEMORY.md`: curated long-term project memory
- `memory/01_active_task.md`: concise current-state handoff
- `memory/02_*`: structured project facts / tech stack baseline
- `memory/03_*`: knowledge base and durable decisions
- `memory/04_validation_log.md`: validation and review history
- `memory/YYYY-MM-DD.md`: daily implementation log

Use `ai-governance-framework/` for framework-level guidance:

- working style and memory discipline
- governance concepts and reference implementation
- future reusable governance tooling

If a local `Hearth` plan or memory file conflicts with framework examples, `Hearth` local product context wins for product scope and delivery order.

`Hearth` now has repo-local engineering governance at:

- `governance/AGENT.md`
- `governance/ARCHITECTURE.md`
- `governance/TESTING.md`

Use those files as the canonical source for repo-level risk classification, execution rigor, architecture guardrails, and testing expectations.

## Required Habits

- Write down meaningful decisions in `memory/YYYY-MM-DD.md`
- Keep `memory/01_active_task.md` current at meaningful milestones
- Promote durable facts / decisions / validation history into the structured `memory/01~04` files
- Keep `PLAN.md` current when priorities, phases, or delivery order changes
- Promote durable lessons from daily notes into `MEMORY.md`
- Do not claim framework adoption is complete unless the local plan/memory workflow is actually being maintained

## Token Run Checklist (每次任務必做)

每次 AI-assisted 任務前後依序執行：

### Before Task — 產生 injection artifact
```powershell
cd Hearth
python -m ai-governance-framework.governance_tools.governed_prompt_bridge `
  --provider claude `
  --lang <TypeScript|Python|...> `
  --level <L0|L1|L2> `
  --scope <fix|feat|chore|review> `
  --plan "<task summary>" `
  --loaded "AGENTS.md, PLAN.md, governance/AGENT.md" `
  --context "<what you're doing; NOT what you're NOT doing>" `
  --pressure "<SAFE|ELEVATED> (<scope note>)" `
  --prompt "<one-line task description>" `
  --artifact-root "artifacts/runtime/injection" `
  --format text
```

### Per Run — 最少記錄 5 項
寫入當日 `artifacts/runtime/injection/YYYY-MM-DD/token-meta.json`：
1. `repo` = Hearth
2. `timestamp` = artifact timestamp
3. `task_type` = `<scope>/<short-label>`
4. token fields（Claude Code 固定值）：
   - `total_tokens`: null
   - `token_source_summary`: "claude_code_internal"
   - `token_observability_level`: "none"
   - `decision_usage_allowed`: false
5. `artifact_path` = injection artifact 路徑

### End-of-Day Check
- 所有 artifact_path 都存在
- `decision_usage_allowed` 全部為 false
- total_tokens=null 時 source/observability 必須明確填寫

## Session Closeout Obligation

Before ending any session, write `artifacts/session-closeout.txt` with these fields:

```
TASK_INTENT: <what this session was trying to accomplish>
WORK_COMPLETED: <specific files changed or tools run — name at least one filename or tool>
FILES_TOUCHED: <comma-separated list of files, or NONE>
CHECKS_RUN: <specific commands run, or NONE>
OPEN_RISKS: <anything left uncertain or partially done>
NOT_DONE: <explicitly deferred items>
RECOMMENDED_MEMORY_UPDATE: <what should be persisted to MEMORY.md or daily log>
```

The stop hook calls `session_end_hook.py` at session end. If `artifacts/session-closeout.txt`
is missing or insufficient, the runtime records the gap and memory will not update.

If no verifiable work was done, write `WORK_COMPLETED: NONE` — that is a valid closeout.
Do not skip the file entirely; a missing file is treated as a governance gap, not a clean session.

See `ai-governance-framework/docs/session-closeout-schema.md` for field constraints and examples.
## Current Adoption Boundary

As of 2026-04-01, `Hearth` has adopted:

- framework submodule import
- local `governance/` runtime entry docs (`SYSTEM_PROMPT`, `HUMAN-OVERSIGHT`, `REVIEW_CRITERIA`, `AGENT`, `ARCHITECTURE`, `TESTING`)
- structured `memory/01~04` schema plus daily notes
- explicit repo-level governance entrypoint
- ongoing synchronization between structured memory, daily logs, and plan updates

---

## Repo-Specific Risk Levels
<!-- governance:key=risk_levels -->

- HIGH (L2): transaction amount/sign/category/date handling; source-hash dedupe; auth boundary / account ownership scoping / RLS paths; `supabase/migrations/`; recurring apply logic; monthly report aggregation; deploy/runtime config affecting production correctness
- MEDIUM (L1): UI behavior changes that do not alter financial calculation logic; API ergonomics; import UX without parser semantic change
- LOW (L0): docs-only wording; comment/formatting-only with no behavior impact

## Must-Test Paths
<!-- governance:key=must_test_paths -->

- `packages/shared/src/parsers/` — any parser change needs unit + integration tests
- `apps/api/src/routes/transactions*` — transaction write paths need auth + data-integrity tests
- `supabase/migrations/` — schema changes need rollback evidence
- `apps/api/src/routes/recurring*` — recurring apply logic needs idempotency tests
- monthly report aggregation — needs numerical regression tests

## L1 → L2 Escalation Triggers
<!-- governance:key=escalation_triggers -->

- Multiple viable product behaviors with different financial semantics trade-offs
- Scope touches both parser semantics and persistence logic simultaneously
- Changes overlap with unrelated pending work in the same areas
- Test evidence cannot convincingly cover changed financial-correctness risk surface
- Any change to ownership checks (`user_id` + account join scoping)

## Repo-Specific Forbidden Behaviors
<!-- governance:key=forbidden_behaviors -->

- Do not weaken dedupe rules without explicit migration/backfill plan
- Do not write directly to production DB from tests
- Do not commit `.env` files
- Do not treat `supabase/schema.sql` as migration source; use `supabase/migrations/` as canonical history
- Do not skip `user_id` scoping on any financial data query
