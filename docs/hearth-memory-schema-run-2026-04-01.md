# Hearth Memory Schema Run - 2026-04-01

## Scope

Validate whether the current `ai-governance-framework` correctly handles a consuming repo like Hearth in two states:

1. pre-adoption partial memory schema
2. post-adoption scaffolded memory schema

## Environment

- Framework root: `E:\BackUp\Git_EE\ai-governance-framework`
- Scratch repo: `E:\BackUp\Git_EE\hearth-memory-check`
- Scratch baseline commit before local full adoption: `03dca60` (`Extract transaction import batch helper`)
- Scratch state after pre-check cleanup: detached HEAD at `03dca60`, `git clean -fd` run to remove newer untracked scaffold files

## Step 0

Scratch clone created:

```powershell
git clone https://github.com/Gavin0099/Hearth.git e:\BackUp\Git_EE\hearth-memory-check
```

## Step 1 - Pre-Adoption State

### Memory directory before adopt

```text
02_tech_stack.md
2026-03-21.md
2026-03-22.md
2026-03-23.md
2026-03-26.md
2026-03-27.md
2026-03-28.md
2026-03-29.md
2026-03-30.md
2026-03-31.md
2026-04-01.md
```

### Commands

```powershell
$env:PYTHONIOENCODING='utf-8'
python ..\ai-governance-framework\governance_tools\governance_drift_checker.py --repo . --framework-root ..\ai-governance-framework

$env:PYTHONPATH='..\ai-governance-framework'
python ..\ai-governance-framework\governance_tools\external_project_facts_intake.py --repo . --project-root ..\ai-governance-framework --format human

python ..\ai-governance-framework\governance_tools\external_repo_readiness.py --repo . --framework-root ..\ai-governance-framework --format human
```

### Pre-Adoption Summary

- `governance_drift_checker.py`
  - `memory_schema_complete = FAIL`
  - warning text explicitly says:
    - `memory/ schema is partial`
    - missing logical files: `active_task`, `knowledge_base`, `review_log`

- `external_project_facts_intake.py`
  - `source_filename = 02_tech_stack.md`
  - `memory_schema_status = partial`
  - `missing_logical_names = knowledge_base,review_log,active_task`

- `external_repo_readiness.py`
  - `project_facts.status = available`
  - `project_facts.source_filename = 02_tech_stack.md`
  - `project_facts.schema_status = partial`
  - `project_facts_schema_complete = False`
  - readiness therefore did **not** allow a single `02_*` file to silently masquerade as a complete memory schema

### Verdict

`partial correctly detected = YES`

## Step 2 - Adopt

### Command

```powershell
$env:PYTHONIOENCODING='utf-8'
python ..\ai-governance-framework\governance_tools\adopt_governance.py --target . --framework-root ..\ai-governance-framework
```

### Adopt Output Summary

Framework behavior on the scratch repo:

- kept existing `PLAN.md`
- kept existing `AGENTS.md`
- kept existing `contract.yaml`
- created `.governance/baseline.yaml`
- created:
  - `memory/01_active_task.md`
  - `memory/03_knowledge_base.md`
  - `memory/04_review_log.md`
- kept existing:
  - `memory/02_tech_stack.md`

Notable point:

- adopt did **not** create `02_project_facts.md`
- adopt did **not** create `03_decisions.md`
- adopt used canonical scaffold names, while existing `02_tech_stack.md` continued to satisfy the tech/project-facts logical slot

## Step 3 - Post-Adoption State

### Memory directory after adopt

```text
01_active_task.md
02_tech_stack.md
03_knowledge_base.md
04_review_log.md
2026-03-21.md
2026-03-22.md
2026-03-23.md
2026-03-26.md
2026-03-27.md
2026-03-28.md
2026-03-29.md
2026-03-30.md
2026-03-31.md
2026-04-01.md
```

### Commands

```powershell
$env:PYTHONIOENCODING='utf-8'
python ..\ai-governance-framework\governance_tools\governance_drift_checker.py --repo . --framework-root ..\ai-governance-framework

$env:PYTHONPATH='..\ai-governance-framework'
python ..\ai-governance-framework\governance_tools\external_project_facts_intake.py --repo . --project-root ..\ai-governance-framework --format human

python ..\ai-governance-framework\governance_tools\external_repo_readiness.py --repo . --framework-root ..\ai-governance-framework --format human
```

### Post-Adoption Summary

- `governance_drift_checker.py`
  - `memory_schema_complete = PASS`

- `external_project_facts_intake.py`
  - still selected `02_tech_stack.md` as the project-facts source
  - also resolved the new logical files:
    - `03_knowledge_base.md`
    - `04_review_log.md`
    - `01_active_task.md`
  - `memory_schema_status = complete`

- `external_repo_readiness.py`
  - `project_facts.source_filename = 02_tech_stack.md`
  - `project_facts.schema_status = complete`
  - `project_facts_schema_complete = True`

### Verdict

- `scaffold correctly created = YES`
- `post-adopt schema complete = YES`

## Alias Behavior

Observed behavior with Hearth-like precondition:

- pre-adopt only factual file present: `02_tech_stack.md`
- post-adopt:
  - original `02_tech_stack.md` was preserved
  - intake continued to use `02_tech_stack.md`
  - framework added canonical scaffold files for the missing logical slots
  - no duplicate `02_project_facts.md` was introduced in this run

### Assessment

`alias behavior acceptable = YES`

Reason:

- the framework did not overwrite or duplicate the existing facts file
- it completed the schema using canonical scaffold files
- readiness/intake switched from `partial` to `complete` only after those missing logical slots existed

## Root Workflow Observation

Even after scaffold creation, the Hearth-style repo still visibly retained its prior operating pattern:

- `PLAN.md`
- `MEMORY.md`
- `memory/YYYY-MM-DD.md`

This means the validation confirms two separate truths:

1. `framework memory scaffold has been created`
2. `repo working practice may still primarily rely on older plan + long-memory + daily-log workflow`

These are not the same thing.

## Additional Observations

- On Windows, both `governance_drift_checker.py` and `adopt_governance.py` needed `PYTHONIOENCODING=utf-8` to avoid `cp950` `UnicodeEncodeError`.
- `external_project_facts_intake.py` needed `PYTHONPATH=..\ai-governance-framework` in this invocation mode.
- A non-memory warning remained before and after adopt:
  - `expansion_boundary: new_return_key: unrecognized key(s) in return dict: ['boundary_effect', 'preconditions_checked']`
  - this did not block memory schema completion

## Final Judgment

- `partial correctly detected`: **PASS**
- `scaffold correctly created`: **PASS**
- `single 02_* no longer impersonates complete schema after tooling check`: **PASS**

## One-Line Conclusion

The framework now behaves correctly for this Hearth-shaped case: before adopt it explicitly marks the repo as `partial`, and after adopt it scaffolds the missing logical files so readiness/intake move to `complete` without letting a lone `02_tech_stack.md` masquerade as a full memory schema.
