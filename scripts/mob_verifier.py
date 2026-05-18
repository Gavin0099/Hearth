#!/usr/bin/env python3
"""
Hearth MOB Verifier v0.2

Syntax-inferable obligation observer for the Hearth repository.

Coverage  : MOB-01, MOB-02, MOB-05, MOB-06, MOB-08
Deferred  : MOB-03, MOB-04, MOB-07 (semantic inference required — not in v0.1/v0.2)
Claim ceiling : bounded_reconstruction with temporal applicability filtering
              (NOT temporal_integrity_verified)
Policy ref    : docs/hearth-obligation-policy-v0.1.md

v0.2 addition — temporal applicability gate
-------------------------------------------
    Dates before convention_start are classified as pre_convention.
    pre_convention records are informational only:
      - obligation_state = not_applicable
      - gap_claim_allowed = false
      - No gap_observed emitted for pre-convention dates.

Usage
-----
    python scripts/mob_verifier.py [YYYY-MM-DD]

    If the date argument is omitted, today's date in Asia/Taipei (UTC+8) is used.

Output
------
    ndjson to stdout. First line: verifier header.
    Subsequent lines: one ObservationRecord per detected trigger.
    Final line: summary.

Design constraints (from policy v0.1)
--------------------------------------
    - Trigger authority : semantic commits only (subject not matching ^auto:\\s)
    - Obligation check  : any commit (semantic or auto) within same-working-day window
    - Reconstruction    : same-working-day in UTC+8
    - Semantic inference: PROHIBITED — file-name patterns and literal diff strings only
    - Causal assertion  : PROHIBITED — output is observation only
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parent.parent

_TZ_CST = timezone(timedelta(hours=8))  # Asia/Taipei UTC+8

# ── Temporal applicability gate ──────────────────────────────────────────────
#
# convention_start: earliest date for which a MOB rule can produce gap_observed.
# Dates before this are pre_convention — obligation files did not exist yet.
# Policy: docs/hearth-obligation-policy-v0.1.md § "Convention Effective Dates"
#
# v0.2 uses a single global gate (2026-04-01). Per-MOB gates are future work.

_GLOBAL_CONVENTION_START = "2026-04-01"

# ── Commit classification ────────────────────────────────────────────────────

_AUTO_RE = re.compile(r"^auto:\s")


# ── MOB trigger patterns (syntactic only) ───────────────────────────────────

_MOB01_MIGRATION_RE = re.compile(r"^supabase/migrations/.+\.sql$")
_MOB02_PLAN_PATH = "PLAN.md"
_MOB05_SUBMODULE_PATH = "ai-governance-framework"
_MOB06_ROUTE_RE = re.compile(r"^apps/api/src/routes/.+\.ts$")
_MOB08_VALIDATION_LOG = "memory/04_validation_log.md"

# Obligation artifact sentinel: any daily log file
_DAILY_LOG_RE = re.compile(r"^memory/\d{4}-\d{2}-\d{2}\.md$")


# ── Data types ───────────────────────────────────────────────────────────────

@dataclass
class CommitInfo:
    sha: str
    subject: str
    date_local: str   # YYYY-MM-DD (UTC+8)
    is_auto: bool
    files_added: list[str] = field(default_factory=list)
    files_changed: list[str] = field(default_factory=list)  # added + modified


@dataclass
class ObservationRecord:
    mob_id: str
    trigger_commit: str        # short sha
    trigger_file: str
    obligation_required: list[str]
    status: str                # obligation_observed | gap_observed | reconstruction_ambiguous | pre_convention
    obligation_found: list[str]
    claim_ceiling: str = "bounded_reconstruction"
    semantic_inference: str = "prohibited"
    gap_claim_allowed: bool = True   # False when status == pre_convention
    note: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# ── Git helpers ──────────────────────────────────────────────────────────────

def _git(args: list[str]) -> str:
    result = subprocess.run(
        ["git"] + args,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    return result.stdout.strip()


def _get_commits_for_date(target_date: str) -> list[CommitInfo]:
    """
    Return all commits whose UTC+8 calendar date equals target_date.

    Uses unix timestamps to avoid git date-parsing timezone ambiguity.
    Scans all commits and filters by UTC+8 date locally.
    """
    raw = _git(["log", "--format=%H\t%s\t%ct", "--no-merges"])
    if not raw:
        return []

    commits: list[CommitInfo] = []
    for line in raw.splitlines():
        parts = line.split("\t", 2)
        if len(parts) != 3:
            continue
        sha, subject, ts_str = parts
        try:
            ts = datetime.fromtimestamp(int(ts_str), tz=_TZ_CST)
        except (ValueError, OSError):
            continue

        date_local = ts.strftime("%Y-%m-%d")
        if date_local != target_date:
            continue

        is_auto = bool(_AUTO_RE.match(subject))
        files_added, files_changed = _get_commit_files(sha)
        commits.append(CommitInfo(
            sha=sha,
            subject=subject,
            date_local=date_local,
            is_auto=is_auto,
            files_added=files_added,
            files_changed=files_changed,
        ))
    return commits


def _get_commit_files(sha: str) -> tuple[list[str], list[str]]:
    """Return (added_files, all_changed_files) for a commit."""
    added_raw = _git(["show", "--diff-filter=A", "--name-only", "--format=", sha])
    added = [f for f in added_raw.splitlines() if f]

    all_raw = _git(["show", "--name-only", "--format=", sha])
    all_changed = [f for f in all_raw.splitlines() if f]

    return added, all_changed


def _get_commit_diff(sha: str, path: str) -> str:
    """Return the unified diff for one file in a commit."""
    return _git(["show", sha, "--", path])


# ── MOB trigger detectors ────────────────────────────────────────────────────

def _detect_mob01(commit: CommitInfo) -> list[str]:
    """MOB-01: New .sql file added in supabase/migrations/."""
    return [f for f in commit.files_added if _MOB01_MIGRATION_RE.match(f)]


def _detect_mob02(commit: CommitInfo) -> bool:
    """
    MOB-02: PLAN.md shows a checkbox transition (- [ ] removed, - [x] added).

    Syntactic approximation: looks for literal diff markers.
    Does NOT infer whether the item is a top-level obligation vs. sub-item.
    Policy: obligation fires on ANY checkbox transition in PLAN.md from a semantic commit.
    Sub-item disambiguation is deferred to MOB-02 refinement in a later version.
    """
    if _MOB02_PLAN_PATH not in commit.files_changed:
        return False
    diff = _get_commit_diff(commit.sha, _MOB02_PLAN_PATH)
    removed_unchecked = bool(re.search(r"^-.*- \[ \]", diff, re.MULTILINE))
    added_checked = bool(re.search(r"^\+.*- \[x\]", diff, re.MULTILINE))
    return removed_unchecked and added_checked


def _detect_mob05(commit: CommitInfo) -> bool:
    """MOB-05: ai-governance-framework submodule pointer changed."""
    return _MOB05_SUBMODULE_PATH in commit.files_changed


def _detect_mob06(commit: CommitInfo) -> list[str]:
    """MOB-06: A route handler file in apps/api/src/routes/ was changed."""
    return [f for f in commit.files_changed if _MOB06_ROUTE_RE.match(f)]


def _detect_mob08(commit: CommitInfo) -> bool:
    """
    MOB-08: memory/04_validation_log.md shows a count-line change.

    Syntactic: detects diff lines matching a numeric count pattern (e.g. 173/173).
    Does NOT distinguish advance from regression — that requires content analysis.
    """
    if _MOB08_VALIDATION_LOG not in commit.files_changed:
        return False
    diff = _get_commit_diff(commit.sha, _MOB08_VALIDATION_LOG)
    return bool(re.search(r"^[+-].*\d+/\d+", diff, re.MULTILINE))


# ── Obligation checker ───────────────────────────────────────────────────────

def _check_obligation(
    mob_id: str,
    trigger_commit: str,
    trigger_file: str,
    required_paths: list[str],
    all_files_changed: set[str],
    target_date: str,
) -> ObservationRecord:
    """
    Check whether obligation artifacts appear in the same-working-day window.

    required_paths may include the sentinel "DAILY_LOG" meaning any
    memory/YYYY-MM-DD.md file qualifies.

    Output status:
      obligation_observed — all required artifacts found
      gap_observed        — at least one required artifact missing
    """
    found: list[str] = []
    missing: list[str] = []

    for req in required_paths:
        if req == "DAILY_LOG":
            if any(_DAILY_LOG_RE.match(f) for f in all_files_changed):
                found.append(req)
            else:
                missing.append(req)
        else:
            if req in all_files_changed:
                found.append(req)
            else:
                missing.append(req)

    if missing:
        status = "gap_observed"
        note = f"missing: {', '.join(missing)}"
    else:
        status = "obligation_observed"
        note = ""

    return ObservationRecord(
        mob_id=mob_id,
        trigger_commit=trigger_commit,
        trigger_file=trigger_file,
        obligation_required=required_paths,
        status=status,
        obligation_found=found,
        note=note,
    )


def _pre_convention_record(
    mob_id: str,
    trigger_commit: str,
    trigger_file: str,
    required_paths: list[str],
    target_date: str,
) -> ObservationRecord:
    return ObservationRecord(
        mob_id=mob_id,
        trigger_commit=trigger_commit,
        trigger_file=trigger_file,
        obligation_required=required_paths,
        status="pre_convention",
        obligation_found=[],
        gap_claim_allowed=False,
        note=(
            f"scan_date={target_date} < convention_start={_GLOBAL_CONVENTION_START}. "
            "Obligation files did not exist. No gap classification permitted."
        ),
    )


# ── Main verifier ────────────────────────────────────────────────────────────

def verify(target_date: str) -> list[ObservationRecord]:
    """
    Run all syntax-inferable MOB checks for target_date.

    Returns a list of ObservationRecord (one per trigger detected).
    Empty list means no triggers were observed — NOT a clean bill of health.

    Dates before _GLOBAL_CONVENTION_START produce pre_convention records only —
    no gap_observed is emitted.
    """
    commits = _get_commits_for_date(target_date)
    if not commits:
        return []

    is_pre_convention = target_date < _GLOBAL_CONVENTION_START

    semantic_commits = [c for c in commits if not c.is_auto]
    all_files_changed: set[str] = {f for c in commits for f in c.files_changed}

    observations: list[ObservationRecord] = []

    for commit in semantic_commits:
        # MOB-01: new migration file
        for f in _detect_mob01(commit):
            req = ["memory/04_validation_log.md", "DAILY_LOG"]
            if is_pre_convention:
                observations.append(_pre_convention_record("MOB-01", commit.sha[:8], f, req, target_date))
            else:
                observations.append(_check_obligation(
                    mob_id="MOB-01",
                    trigger_commit=commit.sha[:8],
                    trigger_file=f,
                    required_paths=req,
                    all_files_changed=all_files_changed,
                    target_date=target_date,
                ))

        # MOB-02: PLAN.md checkbox transition
        if _detect_mob02(commit):
            req = ["memory/01_active_task.md", "DAILY_LOG"]
            if is_pre_convention:
                observations.append(_pre_convention_record("MOB-02", commit.sha[:8], _MOB02_PLAN_PATH, req, target_date))
            else:
                observations.append(_check_obligation(
                    mob_id="MOB-02",
                    trigger_commit=commit.sha[:8],
                    trigger_file=_MOB02_PLAN_PATH,
                    required_paths=req,
                    all_files_changed=all_files_changed,
                    target_date=target_date,
                ))

        # MOB-05: submodule bump
        if _detect_mob05(commit):
            req = ["memory/02_project_facts.md"]
            if is_pre_convention:
                observations.append(_pre_convention_record("MOB-05", commit.sha[:8], _MOB05_SUBMODULE_PATH, req, target_date))
            else:
                observations.append(_check_obligation(
                    mob_id="MOB-05",
                    trigger_commit=commit.sha[:8],
                    trigger_file=_MOB05_SUBMODULE_PATH,
                    required_paths=req,
                    all_files_changed=all_files_changed,
                    target_date=target_date,
                ))

        # MOB-06: route handler changed
        for f in _detect_mob06(commit):
            req = ["memory/04_validation_log.md"]
            if is_pre_convention:
                observations.append(_pre_convention_record("MOB-06", commit.sha[:8], f, req, target_date))
            else:
                observations.append(_check_obligation(
                    mob_id="MOB-06",
                    trigger_commit=commit.sha[:8],
                    trigger_file=f,
                    required_paths=req,
                    all_files_changed=all_files_changed,
                    target_date=target_date,
                ))

        # MOB-08: validation count changed
        if _detect_mob08(commit):
            req = ["DAILY_LOG"]
            if is_pre_convention:
                observations.append(_pre_convention_record("MOB-08", commit.sha[:8], _MOB08_VALIDATION_LOG, req, target_date))
            else:
                observations.append(_check_obligation(
                    mob_id="MOB-08",
                    trigger_commit=commit.sha[:8],
                    trigger_file=_MOB08_VALIDATION_LOG,
                    required_paths=req,
                    all_files_changed=all_files_changed,
                    target_date=target_date,
                ))

    return observations


def main() -> None:
    if len(sys.argv) > 1:
        target_date = sys.argv[1]
    else:
        target_date = datetime.now(tz=_TZ_CST).strftime("%Y-%m-%d")

    header = {
        "type": "header",
        "verifier": "mob_verifier",
        "version": "0.2",
        "target_date": target_date,
        "claim_ceiling": "bounded_reconstruction",
        "temporal_applicability_gate": True,
        "convention_start": _GLOBAL_CONVENTION_START,
        "mob_coverage": ["MOB-01", "MOB-02", "MOB-05", "MOB-06", "MOB-08"],
        "deferred": ["MOB-03", "MOB-04", "MOB-07"],
        "semantic_inference": "prohibited",
        "causal_assertion": "prohibited",
    }
    print(json.dumps(header))

    observations = verify(target_date)

    if not observations:
        print(json.dumps({
            "type": "summary",
            "target_date": target_date,
            "triggers_detected": 0,
            "note": (
                "No syntax-inferable triggers observed for this date. "
                "This is an observation — not a governance clean-bill."
            ),
        }))
        return

    for obs in observations:
        print(json.dumps({"type": "observation", **obs.to_dict()}))

    gap_count = sum(1 for o in observations if o.status == "gap_observed")
    observed_count = sum(1 for o in observations if o.status == "obligation_observed")
    ambiguous_count = sum(1 for o in observations if o.status == "reconstruction_ambiguous")
    pre_convention_count = sum(1 for o in observations if o.status == "pre_convention")

    print(json.dumps({
        "type": "summary",
        "target_date": target_date,
        "triggers_detected": len(observations),
        "obligation_observed": observed_count,
        "gap_observed": gap_count,
        "reconstruction_ambiguous": ambiguous_count,
        "pre_convention": pre_convention_count,
        "claim_ceiling": "bounded_reconstruction",
        "note": (
            "gap_observed requires human review before gap_confirmed. "
            "reconstruction_ambiguous requires human review before any classification. "
            "pre_convention records are informational only — no gap classification permitted."
        ),
    }))


if __name__ == "__main__":
    main()
