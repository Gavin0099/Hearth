# Beta Gate Reviewer Run - 2026-03-31

## Goal

Run one new external cold-start onboarding pass against
`https://github.com/Gavin0099/ai-governance-framework` and use the result to
decide whether the next fix belongs to onboarding wording, DBL surface, or
authority/decision-model communication.

This is the next highest-value step after the recent DBL first-slice,
reviewer-failure diagnostics, and Route B / reviewer-pack additions.

## Why this run is next

- DBL first slice now has runtime boundary material, example material, external
  reconstruction, and adversarial before-state coverage.
- Reviewer failure diagnosis is no longer a single pass/fail bucket; it now has
  `reviewer-signal-split.md` and `reviewer-run-sheet.md`.
- Without a fresh reviewer run, we still do not know whether those additions
  materially improve Beta Gate condition 2.

## Required inputs

Use these three documents together:

- `ai-governance-framework/docs/beta-gate/reviewer-test-pack.md`
- `ai-governance-framework/docs/beta-gate/reviewer-signal-split.md`
- `ai-governance-framework/docs/beta-gate/reviewer-run-sheet.md`

Supporting score / override reference:

- `ai-governance-framework/docs/beta-gate/onboarding-pass-criteria.md`

## Run setup

Reviewer constraints:

- External reviewer
- Cold start
- No author guidance
- Start from repo URL only

Author constraints:

- Do not point to files
- Do not explain concepts during the run
- Only tell the reviewer to keep going and record what they are thinking

## Recording checklist

Save the raw reviewer log as:

- `ai-governance-framework/docs/beta-gate/reviewer-run-<YYYY-MM-DD>.md`

Then record all of the following before proposing any fix:

```text
Signal split:
- First meaningful failure layer: discoverability | interpretation | decision reconstruction | escalation judgment | none
- Why this layer was chosen:

Gate score:
- CP1:
- CP2:
- CP3:
- CP4:
- CP5:

Override:
- Applied: Y/N
- Reason:

Smallest next fix:
- ...
```

## Decision rule after the run

If the first meaningful failure layer is `discoverability` or
`interpretation`:

- fix entry path, wording, headings, or README/start-session pointers

If the first meaningful failure layer is `decision reconstruction`:

- return to DBL surface, examples, and reviewer-pack boundary framing

If the first meaningful failure layer is `escalation judgment`:

- refine authority language, gate override communication, or decision-model
  wording

## Non-goal

Do not add another feature before this run.

The purpose of this pass is to measure whether the current onboarding and DBL
surface are now legible enough to move Beta Gate condition 2 forward.
