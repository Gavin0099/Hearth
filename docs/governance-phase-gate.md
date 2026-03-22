# Governance Phase Gate

Run this to verify the repo-local governance baseline is present and fresh enough for ongoing delivery.

## Command

- Default:
  - `npm run governance:gate`

## What it checks

1. `governance/AGENT.md` exists
2. `governance/ARCHITECTURE.md` exists
3. `governance/TESTING.md` exists
4. `PLAN.md` exists and has parseable `最後更新: YYYY-MM-DD`
5. `PLAN.md` freshness is within 7 days (configurable)
6. today's memory note exists (`memory/YYYY-MM-DD.md`)

## Optional parameter

```powershell
powershell -ExecutionPolicy Bypass -File scripts/governance-phase-gate.ps1 -MaxPlanAgeDays 14
```
