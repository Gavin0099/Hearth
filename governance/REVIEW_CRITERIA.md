---
audience: human-only
authority: reference
can_override: false
overridden_by: ~
default_load: never
---

# REVIEW_CRITERIA.md
**Hearth Review Protocol - v1.0**

Load this document when `SCOPE = review`.

## Review Goals

- verify the change is predictable
- verify the change is safe
- verify the evidence matches the risk

## Mandatory Checks

1. Ownership / auth boundary
2. Import/report correctness
3. Schema or migration discipline when relevant
4. Dirty-worktree scope hygiene
5. Validation evidence quality

## Output Expectations

Every review should name:
- finding severity
- file/location
- concrete evidence
- required fix or reason it is non-blocking

## Memory Follow-up

After review:
- append summary to `memory/04_validation_log.md`
- add next-state note to `memory/01_active_task.md`
- record any reusable gotcha in `memory/03_knowledge_base.md`
