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
3. `memory/YYYY-MM-DD.md` for today and yesterday when present
4. `MEMORY.md` for curated long-term project context

Do not skip the local `Hearth` files just because the framework submodule exists.

## Division Of Responsibility

Use `Hearth` root files for repo-local operating context:

- `PLAN.md`: current product plan and implementation priorities
- `MEMORY.md`: curated long-term project memory
- `memory/YYYY-MM-DD.md`: daily implementation log

Use `ai-governance-framework/` for framework-level guidance:

- working style and memory discipline
- governance concepts and reference implementation
- future reusable governance tooling

If a local `Hearth` plan or memory file conflicts with framework examples, `Hearth` local product context wins for product scope and delivery order.

If a future `Hearth` repo-local engineering governance file is added, it should define risk classification and testing expectations for this product and explicitly reference the framework where appropriate.

## Required Habits

- Write down meaningful decisions in `memory/YYYY-MM-DD.md`
- Keep `PLAN.md` current when priorities, phases, or delivery order changes
- Promote durable lessons from daily notes into `MEMORY.md`
- Do not claim framework adoption is complete unless the local plan/memory workflow is actually being maintained

## Current Adoption Boundary

As of 2026-03-21, `Hearth` has adopted:

- framework submodule import
- local plan and memory structure
- explicit repo-level governance entrypoint

Still pending:

- repo-specific engineering governance rules
- automation around freshness or phase gates
- reusable runtime hooks from the framework, if they become needed for this product
