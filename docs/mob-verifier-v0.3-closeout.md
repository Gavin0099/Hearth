# MOB Verifier v0.3 — Closeout Freeze

Date: 2026-05-20
Status: **frozen** — v0.3 core path complete; consequence eligibility NOT opened
Verifier versions covered: v0.3 + v0.3.1
Freeze authority: human reviewer decision (not machine-derived)

---

## v0.3 Core Path — Completion Status

The three-layer MOB Verifier v0.3 architecture is complete and end-to-end verified.

| Layer | Component | Status |
|-------|-----------|--------|
| Layer 1 | `mob_verifier.py` — observed_gap_id + record_type alias | **complete** |
| Layer 2 | `artifacts/review/mob-gap-disposition.yaml` — human annotation schema | **complete** |
| Layer 3 | `gap_disposition_reader.py` — consequence eligibility derivation | **complete** |
| Contract | Layer 1 → Layer 3 format reconciliation (v0.3.1) | **complete** |

End-to-end artifact evidence:

- `artifacts/observations/2026-05-07.ndjson` — Layer 1 observation (MOB-05, native mob_verifier format)
- `artifacts/review/mob-gap-disposition.yaml` — Layer 2 human annotation (confirmed, consequence_eligible=false)
- `artifacts/review/gap_status_report.json` — Layer 3 derived output (confirmed-but-not-eligible)

---

## v0.3.1 Contract Reconciliation

**Problem fixed**: `mob_verifier.py` emitted `type: "observation"` + `status: "gap_observed"`,
but `gap_disposition_reader.load_observations()` filtered on `record_type == "gap_observed"`.
Native mob_verifier output would have been silently dropped by the Layer 3 consumer.

**Fix applied** (Option A — Layer 1 side, backward compatible):
`mob_verifier.py` now emits `record_type: obs.status` alongside `type` and `status`.
No changes to the Layer 3 consumer filter logic; Layer 2 YAML is unaffected.

**Invariants locked** (test_mob_verifier.py):
- Invariant 9: `record_type` field present in all observation ndjson dicts
- Invariant 10: `record_type == status` for all observation records
- Round-trip: mob_verifier output → `load_observations()` yields correct count with correct fields

All 14 tests pass. Round-trip verified without hand-editing ndjson.

---

## Baseline Case — confirmed-but-not-eligible

The following case is locked as the v0.3 baseline:

```
observed_gap_id:    hearth::2026-05-07::MOB-05::ai-governance-framework
mob_id:             MOB-05
disposition:        confirmed
consequence_eligible: false
reviewer:           human
```

**What this establishes:**

1. The review mechanism works end-to-end (Layer 2 → Layer 3 derivation).
2. `disposition: confirmed` is reachable without opening consequence authorization.
3. `consequence_eligible: false` is independently stable from `disposition` value.
4. The safety path `confirmed + not eligible` is structurally distinct from both
   `needs_more_evidence` (review not complete) and `confirmed + eligible` (not yet authorized).

**What this does NOT establish:**

- It does NOT prove MOB-05 on 2026-05-07 has no governance consequences.
- It does NOT establish consequence eligibility criteria (deferred to v0.4).
- It does NOT authorize any downstream enforcement action.

---

## Freeze Constraint — consequence_eligible=false is hard

**RULE**: A gap record where `consequence_eligible=false` MUST NOT trigger any
governance consequence, enforcement action, or contributor attribution, regardless
of `disposition` value.

This is NOT a soft default. It is a structural invariant.

Rationale: the human reviewer who wrote `consequence_eligible: false` made an explicit
decision to withhold authorization. The system cannot override that decision by
treating `confirmed` as sufficient authorization. `confirmed` describes the gap;
`consequence_eligible` authorizes the consequence. These are independent gates.

**Permitted actions when consequence_eligible=false:**

| Action | Permitted |
|--------|-----------|
| Record gap in audit log | yes |
| Show in status dashboard | yes |
| Use as input to future human review | yes |
| Trigger any enforcement action | **NO** |
| Attribute to a contributor | **NO** |
| Upgrade to eligible without human re-annotation | **NO** |

---

## v0.4 Boundary — what is NOT inherited

v0.3 closeout does NOT open any of the following:

1. **Consequence eligibility criteria** — v0.4 must define what conditions allow
   a human reviewer to set `consequence_eligible: true`. This definition does not
   exist yet. Any v0.4 design that assumes criteria from v0.3 is out of scope.

2. **Multi-gap review workflow** — only one gap has been annotated. Batch review
   semantics (ordering, precedence, expiry) are undefined.

3. **Automatic eligibility derivation** — `consequence_eligible` must remain a
   human-written field in Layer 2 YAML. Machine-derived eligibility is prohibited
   in v0.3 and carries forward as a constraint into v0.4.

4. **Gap Consumption Boundary violations** — the prohibition on using gap records
   as contributor performance signals (defined in `hearth-obligation-policy-v0.1.md`)
   binds all future versions. v0.4 may not introduce per-contributor gap aggregation.

---

## Test coverage at closeout

| Test file | Tests | Status |
|-----------|-------|--------|
| `tests/test_mob_verifier.py` | 14 | pass |
| `tests/test_mob_v03_gap_disposition_reader.py` (ai-governance-framework) | 15 | pass |
| Round-trip integration | 1 (within test_mob_verifier.py) | pass |

Total locked invariants: v0.2 (3) + v0.3 (8) + v0.3.1 (2) + FM-01..05 (15) = 28

---

## Capability vs. Authorization — mandatory distinction

**Eligibility derivation capability exists in v0.3,
but eligibility authorization policy is intentionally absent.**

These are not the same thing. They must never be conflated.

| Dimension | v0.3 state |
|-----------|------------|
| Layer 3 can technically derive `consequence_eligible=true` | **yes** |
| System governance defines admissible conditions for `consequence_eligible=true` | **no** |
| Any gap record in v0.3 is authorized to trigger a consequence | **no** |

**The failure mode this prevents:**

> "Since `gap_disposition_reader.py` already supports `consequence_eligible=true`,
> the system must already allow consequences."

This reasoning is incorrect. The reader's technical capability to emit `eligible=true`
does not constitute authorization. Technical capability and governance authorization
are different layers. The absence of authorization policy is not an implementation gap —
it is a deliberate design position. v0.3 closes with zero consequence-eligible records
by construction, not by accident.

---

## Architectural note — escalation model shift

v0.3 establishes that:

> A gap can be confirmed without being consequence-eligible.

This separation is the safety mechanism. Without it, `confirmed` would automatically
authorize enforcement — making the review step purely ceremonial. The three-layer
architecture enforces the separation structurally: Layer 2 writes both fields
independently; Layer 3 only derives, never escalates.

**The deeper architectural shift:**

v0.3 moves governance escalation from **runtime inference** to
**explicit authorization artifact**.

Before this architecture, a system could infer consequence from signal strength:
> high-severity gap → probably important → probably actionable → auto-consequence

After this architecture, consequence requires an explicit artifact:
> gap_observed (Layer 1) → human review (Layer 2) → consequence_eligible=true
> → authorization policy satisfied (v0.4, not yet defined) → enforcement

The word "probably" is removed from the escalation path. Every step requires
a durable artifact, not a reasoning chain.

This is why the v0.4 decision to open consequence eligibility is not a technical
decision — it is a governance boundary decision that requires a separate human
authorization event and a new policy document, not a code change.
