# Hearth Obligation Policy Decisions v0.1

Date: 2026-05-17
Status: frozen — policy inputs to MOB Verifier v0.1
Policy class: temporal_admissibility_semantics

These four decisions precede verifier implementation. They define the semantics
that the verifier must implement faithfully. The verifier cannot reinterpret them.

Anti-inversion rule: **policy governs verifier, not the reverse.**

If a future verifier implementation creates pressure to revise a decision here,
that is implementation gravity. Resolve it by revising the verifier, not this document.

---

## Decision 1 — MOB-04 Disambiguation (Governance Policy Mutation)

**Question**: Is there a structural convention that makes governance policy changes
syntactically inferrable?

**Decision**:

A governance policy mutation is recognized IF AND ONLY IF a semantic commit contains
a diff in a `governance/` file showing:

- A new H2-level section (`^## `) ADDED, OR
- An existing H2-level section REMOVED, OR
- A risk classification marker changed (e.g. `**HIGH**`, `**CRITICAL**`, `risk_level:`)

Paragraph rewording below H2 level is NOT a policy mutation trigger.

**Implementation constraint**: MOB-04 is NOT automated in v0.1.

The H2 rule is recorded as policy but deferred from machine check.

Rationale: mutation ontology is not yet defined. Automating MOB-04 before that ontology
is stable would let the detector retroactively define what counts as a policy change —
the exact implementation gravity failure mode this policy document is designed to prevent.

---

## Decision 2 — Verification Boundary

**Question**: Is `same-working-day` an acceptable proxy for "same semantic unit"?

**Decision**: `same-working-day` is adopted as the default `reconstruction_window`.

Formal definition:
> Trigger and obligation artifacts both have at least one commit whose timestamp,
> converted to Asia/Taipei (UTC+8) local date (YYYY-MM-DD), falls on the same date.

**Critical framing**: `same-working-day` is a **governance cadence proxy** —
a human-reconstructable continuity window. It is NOT a claim that 24 hours is
the correct causal boundary for all cases.

### Ambiguity cases

The following cases are classified as `reconstruction_ambiguous`, not as PASS or GAP.
`reconstruction_ambiguous` requires human review before gap classification.

| Case | Why ambiguous |
|---|---|
| Trigger in evening; obligation next morning (continuous work) | Causally continuous but crosses date boundary |
| Rapid micro-commits (> 10 auto: per hour) same-day | Same-day but semantically fragmented |
| Cross-timezone commits (different UTC offsets in same logical session) | Calendar date depends on reference timezone |
| Weekend carryover (trigger Friday; obligation Monday) | Cadence discontinuity without calendar gap |

`reconstruction_ambiguous` is an observation output — it does not constitute a gap.
Human review is required before upgrading to `gap_confirmed`.

**Rationale**: binding temporal governance to clock semantics creates brittleness.
The reconstruction window preserves human-reconstructable continuity — not a 24h rule.

---

## Decision 3 — Auto-Commit Exclusion from Trigger Authority

**Question**: Should `auto:` commits be excluded from obligation triggering?

**Decision**: Yes.

`auto:` commits (subject matching `^auto:\s`) are NOT authoritative trigger sources.

Rules:

1. A MOB trigger fires ONLY if the triggering file change appears in a **semantic commit**
   (subject does NOT match `^auto:\s`).

2. `auto:` commits CAN satisfy obligations — obligation artifacts appearing in auto: commits
   count as `observed` within the same-working-day window.

3. If a state transition lands only in an auto: commit (not in a semantic commit), the
   trigger does NOT fire — the transition is unobserved from a governance perspective.

**Causal self-contamination guard**:

An `auto:` commit that contains BOTH a trigger-eligible file AND an obligation artifact
creates a causal self-contamination scenario. Classification:
- Obligation: `observed` (artifact is present)
- Trigger: NOT fired (trigger authority remains non-authoritative)
- Causal assertion: prohibited (no causal claim made)

**Rationale**: trigger authority requires a human-intentional commit boundary.
Auto-commits are continuous checkpoints, not causal statements. Using them as triggers
would make obligation detection as noisy as the auto-commit stream itself.

This decision is consistent with `commit_class_auto_can_trigger_obligation: false`
established in the ai-governance-framework (2026-05-16 session memory).

---

## Decision 4 — Obligation Expiry

**Question**: How long before an unmet obligation becomes a governance gap vs. a valid deferral?

**Decision**:

If a trigger fires and the obligation artifact is NOT observed within the same-working-day
reconstruction window → classified as `gap_observed`.

`gap_observed` is an observation — NOT a causal assertion. It means: the expected artifact
pattern was not detected within the reconstruction window.

**Explicit deferral protocol**:

A deferred obligation must be recorded with an explicit carry-forward entry in
`memory/01_active_task.md`. Without an explicit carry-forward marker:
- Classification: `gap_observed`
- NOT automatically promoted to `gap_confirmed` (requires human review)

### Observation state vocabulary

| State | Meaning | Machine-checkable |
|---|---|---|
| `obligation_observed` | Artifact detected within reconstruction window | yes |
| `gap_observed` | Artifact not detected within window | yes |
| `reconstruction_ambiguous` | Window boundary condition applies (see Decision 2) | yes (case rules) |
| `gap_confirmed` | Human reviewed and confirmed gap | no |
| `deferred` | Explicit carry-forward entry exists | partially |

---

## Verifier v0.1 Scope Constraints

Derived from the four decisions above. These constraints bind the verifier implementation.

| Constraint | Rule |
|---|---|
| MOB coverage | MOB-01, MOB-02, MOB-05, MOB-06, MOB-08 only |
| MOB-03, 04, 07 | Not verified — output `deferred_from_v0.1` |
| Trigger authority | Semantic commits only (subject not matching `^auto:\s`) |
| Obligation satisfaction | Any commit (semantic or auto) within same-working-day |
| Reconstruction window | Same-working-day (UTC+8 local date) |
| Semantic inference | PROHIBITED |
| Causal assertion | PROHIBITED |
| Output claim ceiling | `bounded_reconstruction` |
| Prohibited claim | `temporal_integrity_verified` |

The verifier output is an **observation record**, not a governance verdict.

---

## Gap Consumption Boundary (forward constraint — binds all future versions)

This boundary is written before any batch scan or longitudinal accumulation feature exists.
It constrains how `gap_observed` records may be consumed by downstream systems.

**Permitted uses of gap_observed records:**

| Use | Allowed |
|---|---|
| Lineage reconstruction assistance (help reviewer find missing artifacts) | yes |
| Historical audit (understand when obligation patterns break down) | yes |
| Identifying systemic trigger conditions with low obligation follow-through | yes |
| Input to manual gap_confirmed classification | yes |

**Prohibited uses (regardless of technical feasibility):**

| Use | Prohibited | Reason |
|---|---|---|
| Contributor quality signal | prohibited | gap_observed is a system observation, not a human performance signal |
| Automatic trust downgrade | prohibited | gap_observed does not establish causal intent |
| Productivity or velocity scoring | prohibited | temporal governance is reconstructability aid, not throughput metric |
| Hidden ranking or comparative contributor scoring | prohibited | creates surveillance structure under a governance label |

**Rationale:**

`gap_observed` means: the expected artifact pattern was not detected within the
reconstruction window. It does NOT mean: the human responsible failed to do their job.

Causal continuity gaps emerge from:
- work that spans the reconstruction boundary (legitimate continuity)
- auto-commit stream fragmentation (system behavior, not human choice)
- reconstruction ambiguity cases (calendar semantics ≠ causal continuity)

Using gap counts as contributor signals would be a form of clock-semantics colonization —
importing a 24h boundary rule's artifacts back as human behavioral evidence.

**Drift signal**: if a future feature request includes phrases like "gap rate by author",
"obligation compliance per contributor", or "governance score trend", that request is
attempting to cross this boundary. Reject it at the design stage.

---

## Architectural framing note (2026-05-17)

This policy document marks a transition point.

The MOB Verifier is not doing **artifact governance** (did the artifact exist?).
It is doing **causal continuity governance** (can a future reviewer reconstruct
why this change happened?).

These are different governance objects:

| Artifact governance | Causal continuity governance |
|---|---|
| existence check | reconstructability check |
| pass / fail | observed / gap / ambiguous |
| point-in-time | spans time |
| machine-authoritative | human-review-required for confirmation |

The shift from `Did the artifact exist?` to `Can a future reviewer reconstruct why this
happened?` means the system is now governing **reconstructability under incomplete memory**
— not correctness of discrete artifacts.

This is the correct framing for long-horizon agent governance where no single agent
has complete context of the full causal chain.
