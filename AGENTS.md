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
  --loaded "AGENTS.md, PLAN.md, governance/AGENT.md, memory/01_active_task.md, memory/02_tech_stack.md|memory/02_project_facts.md, memory/03_knowledge_base.md|memory/03_decisions.md, memory/04_validation_log.md, MEMORY.md, memory/YYYY-MM-DD.md(today), memory/YYYY-MM-DD.md(yesterday)" `
  --context "<what you're doing; NOT what you're NOT doing>" `
  --pressure "<SAFE|ELEVATED> (<scope note>)" `
  --prompt "<one-line task description>" `
  --artifact-root "artifacts/runtime/injection" `
  --format text
```

最低要求：`LOADED` 必須至少包含 `memory/01_active_task.md`、`memory/04_validation_log.md`、`MEMORY.md`。

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

## AI Governance Update Intent Rule

When the user asks to "Update AI Governance to latest" or 「把 AI Governance
更新到最新」, do not interpret this as checking whether `AGENTS.md`,
`AGENTS.base.md`, or local governance instruction files are clean.

First determine whether the repository consumes AI Governance through a
submodule path such as:
- `ai-governance-framework`
- `.ai-governance-framework`

If a governance submodule exists, the request maps to the governed submodule
update workflow. The agent must compare the nested governance HEAD with the
approved target upstream HEAD, preferably through the governed submodule updater
dry-run path.

The agent must not claim AI Governance is already current based only on:
- `AGENTS.md` unchanged
- `AGENTS.base.md` unchanged
- parent repository `HEAD == origin/main`
- `git pull --ff-only` reporting already up to date
- clean parent repository working tree

A valid `already_current` conclusion for a submodule consumer must include:
- governance submodule path
- nested governance HEAD
- target upstream framework HEAD
- dry-run update result

Required response shape:

```text
AI Governance update check: <already_current | update_available | updated | not_submodule_consumer | not_verified>
governance submodule path: <path | NOT FOUND | NOT CHECKED>
nested governance HEAD: <sha | NOT CHECKED>
target framework HEAD: <sha | NOT CHECKED>
dry-run: PASS | FAIL | NOT RUN
update mode: already_current | fast_forward | detached_target_checkout | NOT CLAIMED
parent repo commit: <hash | NOT NEEDED | NOT CREATED>
```

If the session only updates `AGENTS.md` or other local instruction files, report
that as an instruction-file update and mark the AI Governance Framework update
as `not_verified`. Do not collapse instruction-file sync into framework update
status.

Invalid conclusion:

```text
AGENTS.md was updated and the parent repo is up to date, so AI Governance is current.
```

Valid partial conclusion:

```text
AGENTS.md was updated, but the AI Governance Framework submodule was not checked.
AI Governance update check: not_verified
governance submodule path: NOT CHECKED
nested governance HEAD: NOT CHECKED
target framework HEAD: NOT CHECKED
dry-run: NOT RUN
update mode: NOT CLAIMED
parent repo commit: NOT CREATED
```

### AI Governance Check Vs Update Intent

Classify the user's wording before acting:

`check` intent examples:
- "檢查 AI Governance 是否最新"
- "確認 AI Governance 有沒有更新"
- "verify AI Governance version"
- "check whether AI Governance is up to date"

Action: verify-only. Do not update the submodule pointer.

`update` intent examples:
- "幫我更新最新版 AI Governance"
- "把 AI Governance 更新到最新"
- "更新 AI Governance 到最新版"
- "Update AI Governance to latest"

Action: perform the governed update flow for a submodule consumer: detect the
governance submodule path, run dry-run, then apply the scoped submodule pointer
update if dry-run is safe and no blocker exists.

For `update` intent, do not stop after direct HEAD comparison when nested
governance HEAD differs from target framework HEAD. A direct HEAD comparison may
establish `update_available`, but it is not a completed update.

If the repository is a submodule consumer and no blocker exists, the agent must
continue from `update_available` to the governed update step.

The agent must not ask "要不要我幫你更新？" after the user has already used
update wording. Ask only when the user intent is ambiguous or when a blocker
requires user decision.

AI Governance update status must use one of these fixed values only:

- `already_current`: nested governance HEAD already matches the target framework HEAD.
- `update_available`: nested governance HEAD differs from the target framework HEAD, but update has not yet been applied.
- `updated`: governed update flow completed and nested governance HEAD now matches the target framework HEAD.
- `blocked`: update could not proceed due to dirty worktree, staged changes, dirty nested submodule, dry-run failure, missing path, or other explicit blocker.
- `not_submodule_consumer`: repository does not consume AI Governance through a submodule.
- `not_verified`: the agent could not safely determine current or target governance state.

For update intent, `update_available` is an intermediate state, not a final
successful outcome. Final response must be one of:
`already_current | updated | blocked | not_submodule_consumer | not_verified`.

Updating the governance submodule pointer does not automatically authorize a
parent repository commit or push unless the user explicitly requested commit/push
or the active workflow already defines commit/push as part of the governed
update task.

If no parent repo commit is created, report:
`parent repo commit: NOT CREATED`.

### F-7 Full Update Semantics

F-7 is the AI Governance Full Update workflow. The governed submodule update is
Stage 1 of F-7, not the whole workflow.

When the user asks to update or adopt the latest AI Governance through F-7, F-7
must execute the full adoption/update workflow or explicitly report a blocker.
A submodule pointer update alone is insufficient and must be reported as
`partially_updated`, not completed.

Required stages:

1. framework pointer update
2. repo-local instruction refresh
3. memory writer coverage check
4. hook / validator coverage check
5. existing memory normalization status check
6. final adoption status report

Layered status fields:

```text
framework_pointer: updated | already_current | blocked | not_present | not_verified
repo_local_instruction: updated | already_current | blocked | missing | not_verified
memory_writer_coverage: verified | updated | blocked | missing | not_applicable | not_verified
hook_validator_enforcement: verified | updated | blocked | missing | not_applicable | not_verified
existing_memory_normalization: completed | needed | blocked | not_applicable | not_verified
final_status: full_update_completed | already_current | partially_updated | blocked | not_submodule_consumer | not_verified
```

`full_update_completed` may be used only when every required stage is
`updated`, `already_current`, `verified`, `completed`, or `not_applicable`.
If any required surface is `missing`, `needed`, `blocked`, or `not_verified`,
the final status must not be `full_update_completed`.

This semantic update defines the required F-7 contract. It does not by itself
implement updater automation for all stages.

NOT CLAIMED unless separately implemented and validated:
- updater automation performs all F-7 stages
- hooks changed
- validators changed
- artifact schema changed
- existing memory was normalized
