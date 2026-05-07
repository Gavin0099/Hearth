# AB v1.2 Run Ledger — Hearth

Purpose: run-level capture under frozen `v1.2` for `hearth` repo.

Rules:
- New session per run.
- Same baseline commit for A/B pair when comparing.
- Do not change spec during observation window.

---

## Quick Log Table

| run_id | arm | task_id | closeout_status | hard_failure | anchoring_fail | disposition | accepted_change_count | runtime_gov_ratio |
|---|---|---|---|---|---|---|---:|---:|
| 2026-05-07-hgfu-single-arm | single-arm | hearth-governance-framework-upgrade | n/a | false | false | merge | 3 | 0 |

---

## Run Entries

```yaml
run_id: "2026-05-07-hgfu-single-arm"
date_utc: "2026-05-07T12:00:00Z"
arm: "single-arm"
task_id: "hearth-governance-framework-upgrade"
task_type: "other"
baseline_commit: "a62a2b44df4a9c461cf929cdd05cb58dd12c4c6a"
spec_version: "v1.2"
new_session_confirmed: true

targets:
  primary_targets:
    - "ai-governance-framework"
    - "governance/framework.lock.json"
    - ".governance/baseline.yaml"
  out_of_scope_targets:
    - "apps/*"
    - "supabase/*"
    - "memory/*"
  first_modification_in_target: false

change_scope_metadata:
  modified_file_count: 3
  added_line_count: 5
  removed_line_count: 5
  doc_vs_code_ratio: "3:0"
  accepted_change_count: 3

metrics:
  revert_needed_after_fix: false
  unintended_change_count: 0
  semantic_consistency: 1
  coverage_completion: 1
  scope_violation_count: 0
  evidence_traceability: 1
  reviewer_edit_effort: 1
  claim_overreach_count: 0
  stalled_reasoning_count: 0
  repeated_boundary_warning_count: 0
  actionable_fix_latency_sec: 0
  tokens_per_reviewer_accepted_fix: 0
  modification_density: 1
  governance_signal_without_material_improvement: false

observability_only:
  runtime_governance_ratio: 0
  artifact_governance_ratio: 0
  governance_meta_lines_in_transcript: 0
  total_assistant_lines_in_transcript: 0
  governance_meta_lines_in_diff: 0
  total_added_lines_in_diff: 5
  review_navigation_burden: "low"

failure_flags:
  hard_failure: false
  attention_anchoring_failure: false
  under_commit_failure: false
  governance_drag: false

reviewer:
  disposition: "merge"
  one_line_note: "Submodule advanced from 78984f4 (v1.2.0) to c5152c1 (post-v1.2.0); adopt --refresh clean; drift 17/17 PASS including expansion_boundary."

artifacts:
  raw_prompt_path: ""
  raw_response_path: ""
  diff_path: ""
  scorecard_path: ""
```
