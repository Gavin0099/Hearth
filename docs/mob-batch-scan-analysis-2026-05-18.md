# MOB Verifier Batch Scan Analysis — 2026-05-18

Status: read-only analysis — no gaps confirmed, no enforcement consequences
Verifier version: v0.1
Scan dates: 2026-03-31, 2026-04-01, 2026-04-02, 2026-05-04, 2026-05-07
Purpose: assess false positive rate, ambiguity handling, and Gap Consumption Boundary stability

---

## Batch Results (summary)

| Date | Triggers | Observed | Gap | Ambiguous | Note |
|---|---|---|---|---|---|
| 2026-03-31 | 16 | 0 | 16 | 0 | pre-convention — see Finding 1 |
| 2026-04-01 | 29 | 29 | 0 | 0 | convention establishment day |
| 2026-04-02 | 19 | 19 | 0 | 0 | |
| 2026-05-04 | 6 | 5 | 1 | 0 | MOB-05 systemic pattern |
| 2026-05-07 | 7 | 1 | 6 | 0 | MOB-05 ×3 systemic pattern |

---

## Finding 1 — Retroactive Application (main false positive source)

**2026-03-31 produced 16 gap_observed. All 16 are false positives.**

Root cause: all obligation files were created on 2026-04-01 in a single commit
(`698a508` — "Complete local governance framework adoption"):

- `memory/04_validation_log.md` — first created 2026-04-01
- `memory/02_project_facts.md` — first created 2026-04-01
- `memory/01_active_task.md` — first created 2026-04-01

Before 2026-04-01, the obligation convention did not exist in Hearth.
Applying MOB rules to 2026-03-31 retroactively imposes a convention
that was not operative at that time.

**This is not a verifier logic error — it is a scope boundary problem.**

The verifier produces correct `gap_observed` outputs given its rules.
The rules themselves have implicit effective dates that the verifier does not yet encode.

**Required policy addition (deferred to v0.2)**: each MOB definition needs a
`convention_start` field. Observations before that date should be classified as
`pre_convention` (informational only, no gap classification permitted).

Convention effective date for all obligation files: **2026-04-01**.

---

## Finding 2 — MOB-05 is the most consistent real gap

MOB-05 (ai-governance-framework submodule bump without `memory/02_project_facts.md` update)
appears as a gap on every post-convention date where a bump occurred:

| Date | MOB-05 triggers | Status |
|---|---|---|
| 2026-04-01 | yes (convention day) | obligation_observed (file created same day) |
| 2026-05-04 | 1 | gap_observed |
| 2026-05-07 | 3 | gap_observed ×3 |

This is a real systemic continuity gap: framework upgrades are occurring without
the corresponding `memory/02_project_facts.md` version record being updated.

This is not a false positive. It is a genuine lineage discontinuity:
> change exists (submodule SHA advanced) but causal narrative missing
> (no record of what changed in the framework, why, or what it affects)

This is the correct output for a temporal governance system — surfacing where
change exists but reconstruction capability is absent.

---

## Finding 3 — reconstruction_ambiguous: zero across all dates

The ambiguity bucket did not fire on any of the 5 scanned dates.

This is correct behavior — none of the scanned dates involved:
- overnight continuation (trigger evening, obligation next morning)
- cross-timezone commit patterns
- weekend carryover

The mechanism is working as designed (not over-classifying), but has not been
exercised with actual edge cases. The ambiguity handling logic is untested
in practice.

This is not a problem — it is an honest observation about test coverage
of the policy boundary.

---

## Finding 4 — Gap Consumption Boundary: stable

The batch scan output contains:
- observation records (mob_id, trigger_commit, trigger_file, status)
- summary counts (triggers_detected, obligation_observed, gap_observed)

The output contains NO:
- contributor attribution
- person-level gap rates
- trend charts or sequences
- enforcement consequences
- trust or quality scores

The boundary is holding in the output format.

The drift risk identified in the policy document has not materialized
in this batch run. The risk remains forward-looking: it will emerge if
a batch-scan-over-time feature is added that introduces per-person
or per-contributor aggregation.

---

## What this scan does NOT establish

In keeping with the `bounded_reconstruction` claim ceiling:

- These results do NOT establish temporal integrity for the scanned dates
- `gap_observed` records here are NOT promoted to `gap_confirmed`
- MOB-05 systemic pattern is NOT a causal assertion (it is an observation pattern)
- 2026-04-01 and 2026-04-02 being 100% observed does NOT mean those dates were
  governance-complete — only that the verifier's syntax-inferable obligations
  appear to have been satisfied

---

## Policy additions required before v0.2

1. **convention_start per MOB** — dates before convention_start should produce
   `pre_convention` status, not `gap_observed`. This eliminates the retroactive
   application false positive class entirely.

   Proposed values:
   - MOB-01, 02, 05, 06, 08: convention_start = 2026-04-01
   - MOB-03, 04, 07: deferred from v0.1 (unchanged)

2. **MOB-06 trigger refinement** — currently fires on any change to a route file.
   A `files_added` filter would reduce false positives for style/bug fixes
   that don't introduce new routes. Deferred to v0.2 (requires content analysis
   of new HTTP verb registrations — borderline syntactic/semantic).

3. **reconstruction_ambiguous case exercise** — no edge cases encountered.
   Before v0.2 claims improved ambiguity handling, at least one edge case
   (overnight continuation, timezone, weekend carryover) should be tested.
