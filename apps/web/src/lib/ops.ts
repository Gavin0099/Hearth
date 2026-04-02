import { apiFetch } from "./api";

export type JobRunSummaryResponse =
  | {
      job_name: string;
      limit: number;
      verdict: "healthy" | "warning" | "critical";
      reasons: string[];
      thresholds: {
        max_age_minutes: number | null;
        consecutive_failure_threshold: number;
        consecutive_report_error_threshold: number;
      };
      latest: {
        id: string;
        status: string;
        run_finished_at: string;
        report_error_sections: string[];
        age_minutes: number | null;
      } | null;
      totals: {
        runs: number;
        ok: number;
        error: number;
        with_report_errors: number;
        consecutive_status_errors: number;
        consecutive_report_error_runs: number;
      };
      status: "ok";
    }
  | { code: string; error: string; status: "error" };

export async function fetchOpsSummary(
  jobName = "daily-update",
  limit = 10,
): Promise<JobRunSummaryResponse> {
  const params = new URLSearchParams({ job_name: jobName, limit: String(limit) });
  const response = await apiFetch(`/api/ops/job-runs/summary?${params.toString()}`);
  return (await response.json()) as JobRunSummaryResponse;
}
