# Reviewer Handoff - 2026-05-22

## Scope Requested

1. Clone framework as submodule
2. Run `external-onboarding` skill to identify gaps
3. Manual decision for `contract.yaml` domain and risk tier
4. Initialize memory files (project facts needs human fill)
5. Install hooks and verify trigger on `git push`
6. Run `runtime-smoke` skill
7. Generate reviewer handoff report

## Outcome Summary

- Completed: 1, 3, 4, 5, 7
- Blocked by environment: 2, 6

## Evidence

- Submodule remote updated and synced to:
  - `https://gli-gitlab-ee.genesyslogic.com.tw/CRD/SW/ai-governance-framework/ai-governance-framework`
- Contract decision recorded:
  - `contract.yaml`: `domain: household-finance` (kept), `risk_tier: L2` (added)
- Memory initialization / updates:
  - `memory/2026-05-22.md` created
  - `memory/02_project_facts.md` appended human-verification checklist
- Hooks installed:
  - `.git/hooks/pre-commit`
  - `.git/hooks/pre-push`
  - `.git/hooks/ai-governance-framework-root`
- Hook trigger proof:
  - `git hook run pre-push -- origin`
  - emitted `ERROR: origin pushurl mismatch...`, proving pre-push hook executes

## External-Onboarding Gap Identification

Primary blocker is runtime tooling availability:

- `python` not found
- `py` not found
- `bash` not found

Because of this, skill commands could not be executed:

- `scripts/onboard-external-repo.sh`
- `governance_tools/external_repo_readiness.py`
- `governance_tools/external_repo_smoke.py`
- `governance_tools/quickstart_smoke.py`
- `runtime_hooks/smoke_test.py`

## Recommended Next Command After Runtime Prereqs Are Installed

Run onboarding:

`bash ai-governance-framework/scripts/onboard-external-repo.sh --target d:/Hearth --contract d:/Hearth/contract.yaml --format human`

Then run runtime smoke:

`python ai-governance-framework/governance_tools/quickstart_smoke.py --project-root d:/Hearth --plan d:/Hearth/PLAN.md --contract d:/Hearth/contract.yaml --format human`
