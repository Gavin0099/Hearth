# Beta Gate Reviewer Record - 2026-03-31

Use this after the reviewer finishes.

Raw reviewer log path:

- `ai-governance-framework/docs/beta-gate/reviewer-run-<YYYY-MM-DD>.md`

Framework references:

- `ai-governance-framework/docs/beta-gate/reviewer-test-pack.md`
- `ai-governance-framework/docs/beta-gate/reviewer-signal-split.md`
- `ai-governance-framework/docs/beta-gate/reviewer-run-sheet.md`
- `ai-governance-framework/docs/beta-gate/onboarding-pass-criteria.md`

## Run metadata

```text
Reviewer:
Date:
Cold start: Y / N
Author guidance given: Y / N
Start point used:
Time used:
```

## Signal split

```text
First meaningful failure layer:
discoverability | interpretation | decision reconstruction | escalation judgment | none

Why this layer was chosen:

Secondary failure layers, if any:
```

## Gate score

```text
CP1:
CP2:
CP3:
CP4:
CP5:
```

## Override

```text
Applied: Y / N
Reason:
```

## First meaningful failure

```text
File / page:
What the reviewer expected:
What actually happened:
Why this is the earliest meaningful failure:
```

## Smallest next fix

```text
Fix target:
Why this is the smallest correct fix:
What should explicitly not be changed yet:
```

## Decision rule

- If the first meaningful failure is `discoverability` or `interpretation`, fix entry path or wording first.
- If the first meaningful failure is `decision reconstruction`, fix DBL surface or reviewer-pack framing.
- If the first meaningful failure is `escalation judgment`, fix authority or decision-model communication.
- Do not add a new feature until this run is classified.
