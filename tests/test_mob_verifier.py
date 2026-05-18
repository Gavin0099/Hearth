"""
MOB Verifier v0.3 — temporal applicability gate tests + observed_gap_id tests.

Locked invariants from v0.2:
  1. pre_convention_date_does_not_emit_gap_observed
  2. post_convention_date_still_emits_mob05_gap
  3. pre_convention_record_cannot_be_consumed_as_gap

New invariants for v0.3 (observed_gap_id):
  4. gap_observed records carry a non-empty observed_gap_id
  5. observed_gap_id format is {repo_id}::{date}::{mob_id}::{trigger_path}
  6. observed_gap_id is stable (deterministic) across two runs of same input
  7. trigger_path in observed_gap_id is normalized (lowercase, no leading slash)
  8. gap_observed count is unchanged from v0.2 (regression guard)
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


# ── v0.3: observed_gap_id invariants ─────────────────────────────────────────

def test_gap_observed_records_carry_observed_gap_id(monkeypatch):
    """Invariant 4: every gap_observed record has a non-empty observed_gap_id."""
    target_date = "2026-05-04"
    monkeypatch.setattr(
        mob_verifier,
        "_get_commits_for_date",
        lambda d: [_submodule_bump_commit(d)],
    )
    records = mob_verifier.verify(target_date)
    gap_records = [r for r in records if r.status == "gap_observed"]
    assert gap_records, "expected at least one gap_observed record"
    for rec in gap_records:
        assert rec.observed_gap_id, (
            f"gap_observed record missing observed_gap_id: {rec}"
        )


def test_observed_gap_id_format(monkeypatch):
    """Invariant 5: observed_gap_id follows {repo_id}::{date}::{mob_id}::{trigger_path}."""
    target_date = "2026-05-04"
    monkeypatch.setattr(
        mob_verifier,
        "_get_commits_for_date",
        lambda d: [_submodule_bump_commit(d)],
    )
    records = mob_verifier.verify(target_date)
    mob05 = next((r for r in records if r.mob_id == "MOB-05" and r.status == "gap_observed"), None)
    assert mob05 is not None
    parts = mob05.observed_gap_id.split("::")
    assert len(parts) == 4, f"expected 4 parts in observed_gap_id, got: {mob05.observed_gap_id!r}"
    repo_id, date_part, mob_id_part, trigger_path = parts
    assert repo_id == mob_verifier.REPO_ID
    assert date_part == target_date
    assert mob_id_part == "MOB-05"
    assert trigger_path == mob_verifier._normalize_trigger_path("ai-governance-framework")


def test_observed_gap_id_is_deterministic(monkeypatch):
    """Invariant 6: same inputs always produce the same observed_gap_id."""
    target_date = "2026-05-04"
    monkeypatch.setattr(
        mob_verifier,
        "_get_commits_for_date",
        lambda d: [_submodule_bump_commit(d)],
    )
    records_a = mob_verifier.verify(target_date)
    records_b = mob_verifier.verify(target_date)
    ids_a = [r.observed_gap_id for r in records_a]
    ids_b = [r.observed_gap_id for r in records_b]
    assert ids_a == ids_b, "observed_gap_id must be stable across two runs of same input"


def test_observed_gap_id_trigger_path_normalized(monkeypatch):
    """Invariant 7: trigger_path in observed_gap_id is lowercase, no leading slash."""
    target_date = "2026-05-04"
    # Simulate a migration file trigger for MOB-01
    migration_commit = _commit(
        sha="deadbeef",
        subject="feat: add migration",
        date_local=target_date,
        files_added=["supabase/migrations/20260504_add_users.sql"],
        files_changed=["supabase/migrations/20260504_add_users.sql"],
    )
    monkeypatch.setattr(
        mob_verifier,
        "_get_commits_for_date",
        lambda d: [migration_commit],
    )
    records = mob_verifier.verify(target_date)
    mob01 = next((r for r in records if r.mob_id == "MOB-01"), None)
    assert mob01 is not None
    trigger_part = mob01.observed_gap_id.split("::")[-1]
    assert trigger_part == trigger_part.lower(), "trigger_path in ID must be lowercase"
    assert not trigger_part.startswith("/"), "trigger_path in ID must not start with slash"


def test_gap_observed_count_regression(monkeypatch):
    """Invariant 8: v0.3 produces same gap_observed count as v0.2 for same input."""
    target_date = "2026-05-04"
    monkeypatch.setattr(
        mob_verifier,
        "_get_commits_for_date",
        lambda d: [_submodule_bump_commit(d)],
    )
    records = mob_verifier.verify(target_date)
    # v0.2 baseline: 1 gap_observed for MOB-05 (no memory/02_project_facts.md)
    gap_count = sum(1 for r in records if r.status == "gap_observed")
    assert gap_count == 1, (
        f"gap_observed count regression: expected 1, got {gap_count}. "
        "v0.3 must not change the count of gap_observed records."
    )


# ── normalize helper ──────────────────────────────────────────────────────────

def test_normalize_trigger_path_strips_and_lowercases():
    assert mob_verifier._normalize_trigger_path("  Supabase/Migrations/Foo.sql  ") == "supabase/migrations/foo.sql"

def test_normalize_trigger_path_strips_leading_slash():
    assert mob_verifier._normalize_trigger_path("/pkg/supabase") == "pkg/supabase"

def test_normalize_trigger_path_converts_backslash():
    assert mob_verifier._normalize_trigger_path("apps\\api\\src\\routes\\user.ts") == "apps/api/src/routes/user.ts"
