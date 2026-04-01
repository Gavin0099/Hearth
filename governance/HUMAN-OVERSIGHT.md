---
audience: human-only
authority: reference
can_override: false
overridden_by: ~
default_load: never
---

# HUMAN-OVERSIGHT.md
**Hearth Escalation and Oversight Protocol - v1.0**

## Continue

Continue when:
- the task is bounded
- repo-local rules are clear
- evidence can be gathered locally
- no meaningful product trade-off is being hidden

## Escalate

Escalate when:
- multiple product behaviors are reasonable
- correctness depends on a choice the repo does not already encode
- scope overlaps unrelated dirty work
- the next step would silently expand beyond current plan or risk boundary

## Stop

Stop when:
- governance rules materially conflict
- correctness cannot be defended
- a high-risk action requires explicit human approval

## Recovery

After interruption:
1. re-read `PLAN.md`
2. re-read `memory/01_active_task.md`
3. re-check repo-local governance docs

## Principle

> Escalate for material uncertainty. Stop for defended red lines.
