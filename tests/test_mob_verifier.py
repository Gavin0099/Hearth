"""
MOB Verifier v0.2 — temporal applicability gate tests.

Three locked invariants:
  1. pre_convention_date_does_not_emit_gap_observed
  2. post_convention_date_still_emits_mob05_gap
  3. pre_convention_record_cannot_be_consumed_as_gap
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import mob_verifier  # noqa: E402


# ── Shared commit factories ──────────────────────────────────────────────────

def _commit(sha, subject, date_local, files_changed=None, files_added=None, is_auto=False):
    return mob_verifier.CommitInfo(
        sha=sha,
        subject=subject,
        date_local=date_local,
        is_auto=is_auto,
        files_added=files_added or [],
        files_changed=files_changed or [],
    )


def _submodule_bump_commit(date_local):
    return _commit(
        sha="aabbccdd",
        subject="chore: bump ai-governance-framework",
        date_local=date_local,
        files_changed=["ai-governance-framework"],
    )


# ── Test 1: pre-convention date does not emit gap_observed ───────────────────

def test_pre_convention_date_does_not_emit_gap_observed(monkeypatch):
    """
    A submodule bump on 2026-03-31 (before convention_start 2026-04-01) must
    produce pre_convention, not gap_observed.
    """
    target_date = "2026-03-31"
    monkeypatch.setattr(
        mob_verifier,
        "_get_commits_for_date",
        lambda d: [_submodule_bump_commit(d)],
    )

    records = mob_verifier.verify(target_date)

    statuses = [r.status for r in records]
    assert "gap_observed" not in statuses, (
        f"pre-convention date emitted gap_observed: {statuses}"
    )
    assert any(s == "pre_convention" for s in statuses), (
        f"expected at least one pre_convention record, got: {statuses}"
    )


# ── Test 2: post-convention date still emits MOB-05 gap ─────────────────────

def test_post_convention_date_still_emits_mob05_gap(monkeypatch):
    """
    A submodule bump on 2026-05-04 (after convention_start) without
    memory/02_project_facts.md must produce gap_observed for MOB-05.
    """
    target_date = "2026-05-04"
    monkeypatch.setattr(
        mob_verifier,
        "_get_commits_for_date",
        lambda d: [_submodule_bump_commit(d)],
    )

    records = mob_verifier.verify(target_date)

    mob05_records = [r for r in records if r.mob_id == "MOB-05"]
    assert mob05_records, "expected MOB-05 observation for post-convention date"
    assert mob05_records[0].status == "gap_observed", (
        f"expected gap_observed, got: {mob05_records[0].status}"
    )


# ── Test 3: pre_convention record cannot be consumed as gap ──────────────────

def test_pre_convention_record_cannot_be_consumed_as_gap(monkeypatch):
    """
    Any pre_convention record must have gap_claim_allowed=False.
    This structural invariant prevents downstream consumers from treating
    pre_convention records as gaps regardless of context.
    """
    target_date = "2026-03-15"
    monkeypatch.setattr(
        mob_verifier,
        "_get_commits_for_date",
        lambda d: [_submodule_bump_commit(d)],
    )

    records = mob_verifier.verify(target_date)

    pre_convention_records = [r for r in records if r.status == "pre_convention"]
    assert pre_convention_records, (
        f"expected pre_convention records for {target_date}"
    )
    for record in pre_convention_records:
        assert record.gap_claim_allowed is False, (
            f"pre_convention record has gap_claim_allowed=True: {record}"
        )
        assert record.status != "gap_observed", (
            "pre_convention record must not carry gap_observed status"
        )
