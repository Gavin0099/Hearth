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

## Current Adoption Boundary

As of 2026-04-01, `Hearth` has adopted:

- framework submodule import
- local `governance/` runtime entry docs (`SYSTEM_PROMPT`, `HUMAN-OVERSIGHT`, `REVIEW_CRITERIA`, `AGENT`, `ARCHITECTURE`, `TESTING`)
- structured `memory/01~04` schema plus daily notes
- explicit repo-level governance entrypoint
- ongoing synchronization between structured memory, daily logs, and plan updates
