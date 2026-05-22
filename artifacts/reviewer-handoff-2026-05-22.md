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

- Completed: 1, 2, 3, 4, 5, 6, 7
- Note: Steps 2 and 6 were executed but produced governance failures (not runtime-tool missing anymore).

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

Executed results:

- `external_repo_readiness.py`: `ready=True`, but with drift/version warnings.
- `external_repo_smoke.py`: initially failed with `version_compatibility_unsupported`; after adding `.governance/version_manifest.yaml`, now `ok=True`.
- `quickstart_smoke.py`: initially failed with `session_start_ok=False`; after version manifest fix, now `ok=True`.

Resolved setup blockers:

- Created local venv at `D:\Hearth\.venv`.
- Installed framework requirements.
- Replaced non-governance identity hooks with framework governance hooks.
- `hook_install_validator.py` now passes (`valid=True`).

## Recommended Next Command

Remaining cleanup (non-blocking warnings):

`D:\Hearth\.venv\Scripts\python.exe ai-governance-framework\governance_tools\external_repo_onboarding_report.py --repo d:/Hearth --framework-root d:/Hearth/ai-governance-framework --contract d:/Hearth/contract.yaml --format human`

Focus areas:
- expansion boundary warning (`new_return_key` set)
- framework version compare warning (`adopted_release` format `v1.2.0+post`)
