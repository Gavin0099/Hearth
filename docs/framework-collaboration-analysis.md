# AI Governance Framework Collaboration Analysis

Last updated: 2026-03-21

This note captures what happened while applying `ai-governance-framework` to `Hearth`, including both the friction and the value.

## Observed problems

### 1. Submodule import created a false sense of completion

At first, `Hearth` imported `ai-governance-framework` as a submodule, but did not yet have:

- local `AGENTS.md`
- local `PLAN.md`
- local `MEMORY.md`
- local `memory/YYYY-MM-DD.md`

That meant the framework was present in the tree, but not yet operating as a local workflow.

### 2. Framework planning and product planning were easy to confuse

The framework's own `PLAN.md` describes framework evolution, not the `Hearth` product roadmap.

Without a local `Hearth` `PLAN.md`, there was a risk of mixing:

- governance-framework progress
- product delivery progress

### 3. Repo-specific engineering governance is still missing

The framework helped establish planning and memory, but `Hearth` still does not yet have its own engineering governance baseline for:

- risk classification
- required verification per change type
- secrets handling
- escalation rules for auth/import/portfolio work

### 4. Governance syncing is still manual

The project now updates:

- `PLAN.md`
- `MEMORY.md`
- daily memory
- milestone docs

This is useful, but still manual. Without future automation or stricter freshness enforcement, drift can return.

### 5. Environment setup issues became more visible

Framework-guided collaboration made setup problems surface early:

- missing Git author identity
- GitHub token/push authentication issues
- missing local dependencies before tests could run

These were not caused by the framework, but the framework made them impossible to ignore.

## Observed benefits

### 1. Conversations became persistent project state

The biggest benefit was turning chat-driven progress into repo-state:

- local plan
- local long-term memory
- daily implementation memory
- milestone notes

That made `Hearth` more durable across sessions.

### 2. Milestone-based progress became natural

Instead of one large stream of changes, the work naturally broke into milestone commits:

- initial scaffold
- local framework adoption
- reference analysis
- frontend auth
- account creation
- local verification

This made AI collaboration easier to reason about and review.

### 3. Decision context stayed attached to the codebase

Important context is now captured in docs instead of disappearing into chat history:

- reference product analysis
- auth setup
- local verification strategy

That will make future iteration easier.

### 4. Verification entered the workflow earlier

The framework pushed the project toward executable checks instead of stopping at implementation.

As a result, `Hearth` now has local route tests for the current auth/accounts slice.

### 5. It helped keep the project on one main line

`Hearth` has multiple possible axes:

- product UX
- auth
- data model
- imports
- portfolio
- deployment

The plan/memory structure helped keep the team focused on the current phase instead of jumping randomly between tracks.

## Current conclusion

Applying `ai-governance-framework` to `Hearth` was valuable, but only after local adoption files were added.

The practical lesson is:

- framework reference alone is not enough
- repo-local plan and memory are required
- repo-specific engineering governance is the next missing layer

## Latest framework adoption status

After pulling the latest `ai-governance-framework`, `Hearth` also ran the framework's official adoption tool:

- `scripts/init-governance.sh --target D:/Hearth --adopt-existing`

This changed the collaboration state in an important way:

- `Hearth` is no longer only "framework-aware"
- `Hearth` now has a framework-generated `.governance/baseline.yaml`
- `AGENTS.base.md` is now the protected baseline file copied from the framework
- `PLAN.md` section headings are now recorded as `plan_section_inventory`

The framework's official drift checker now passes for `Hearth`, which means the repo has crossed from informal adoption into machine-verified baseline adoption.

## Remaining issues after the latest adoption

The current problems are narrower than before.

### 1. Repo-specific engineering governance is still underdefined

The framework baseline is now present and valid, but `Hearth` still has not yet filled in the repo-specific governance structure recommended by the framework template, especially around:

- repo-specific risk levels
- must-test paths
- L1 to L2 escalation triggers
- repo-specific forbidden behaviors

This is no longer a baseline-adoption problem. It is now a repo-governance completeness problem.

### 2. `contract.yaml` is structurally valid but still placeholder-shaped

The current `contract.yaml` satisfies the framework's required fields, but values such as:

- `name: <repo-name>-contract`
- `domain: <domain>`

still need to be made specific to `Hearth`.

### 3. `PLAN.md` is inventoried, not governance-mandated

Because `Hearth` used `--adopt-existing`, the framework intentionally did not impose `plan_required_sections`.

That is the correct behavior for an existing repo, but it also means:

- the current `PLAN.md` shape is recorded
- the current `PLAN.md` shape is not yet enforced

If `Hearth` later wants machine-enforced plan structure, that mandate still needs to be declared explicitly.

## Recommended next framework-related follow-up

Not for immediate action inside `Hearth`, but worth tracking:

- define a lighter repo-specific engineering governance baseline
- clarify secret-handling expectations during AI collaboration
- reduce manual synchronization burden where possible
