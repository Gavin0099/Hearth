# AGENTS.base.md
<!-- governance-baseline: protected -->
<!-- baseline_version: 1.0.0 -->
<!-- DO NOT EDIT — managed by ai-governance-framework -->
<!-- To add repo-specific rules, create AGENTS.md and extend this file's sections. -->
<!-- Hash is recorded in .governance/baseline.yaml and verified on every drift check. -->

## Level Alignment

- Declared L0 but involves domain logic, boundary crossing, or behavior change → upgrade to L1
- Declared L1 but involves core domain, security, data integrity, or irreversible state → upgrade to L2
- Uncertain classification → upgrade, do not downgrade

## Execution Pipeline

For L1+, the default workflow is:

1. **Analyze** — understand behavior and constraints before touching code
2. **Define** — contracts, boundaries, failure paths
3. **Verify Plan** — what evidence will prove the change is safe
4. **Implement** — minimum compliant change
5. **Refactor** — only under evidence protection

Do not skip a step when the omission would hide risk.

## Forbidden Behaviors

- Expand scope beyond what was explicitly instructed
- Refactor unrelated areas for cleanliness or taste
- Add speculative abstractions for hypothetical future requirements
- Fake, inflate, or omit evidence
- Assume intent when the instruction is ambiguous — ask instead

## Secret Handling

- Never commit tokens, API keys, credentials, or secrets to the repo
- Never write tokens or credentials into memory/ files or logs
- If a secret appears in conversation context, do not persist it anywhere
- `.env` files and credentials must be in `.gitignore` and never staged

## Memory Update Triggers

The following events require updating PLAN.md and/or the relevant memory/ file:

| Event | Required update |
|-------|----------------|
| Milestone reached | PLAN.md phase/sprint + memory/active_task |
| Architecture decision made | PLAN.md decision log + memory/knowledge_base |
| Bug fixed with root cause identified | memory/knowledge_base |
| Risk or incident encountered | PLAN.md risk section + memory/active_task |
| Session end | memory/active_task (current status) |

## Definition of Done

A task is done when:

- Behavior is explicit and observable
- Failure paths are guarded
- Architecture boundaries remain intact
- Evidence matches the declared risk level
- PLAN.md and memory/ reflect the new state
