# Framework Adoption In Hearth

`Hearth` uses `ai-governance-framework` as a submodule-backed governance reference, but keeps its own repo-local product context at the root.

## Local files that now matter

- `AGENTS.md`: repo-local working entrypoint
- `PLAN.md`: live implementation plan and current priorities
- `MEMORY.md`: long-term project memory
- `memory/YYYY-MM-DD.md`: daily execution log

## Relationship to existing planning docs

- `Hearth-plan.md`: original product and scope planning document
- `PLAN.md`: current execution plan derived from that original plan

## Why not only use the submodule files

The framework submodule describes a reusable governance system.

`Hearth` still needs its own:

- product-specific priorities
- current implementation phase
- repo-local decisions
- execution memory

Without those local files, the framework is imported but not truly adopted.
