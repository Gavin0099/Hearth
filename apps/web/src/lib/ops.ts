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

export type JobRunLatestResponse =
  | {
      item: {
        id: string;
        job_name: string;
        run_started_at: string;
        run_finished_at: string;
        status: string;
        report: unknown;
        created_at: string;
      } | null;
      healthy: boolean;
      reason: string;
      checked_at: string;
      status: "ok";
    }
  | { code: string; error: string; status: "error" };

export type DailySectionReport = {
  attempted: number;
  upserted: number;
  skipped: number;
  errors: string[];
};

export type DailyUpdateReport = {
  priceSnapshots: DailySectionReport;
  fxRates: DailySectionReport;
};

export type TriggerDailyUpdateResponse =
  | { report: DailyUpdateReport; status: "ok" }
  | { code: string; error: string; status: "error" };

export async function fetchLatestJobRun(jobName = "daily-update"): Promise<JobRunLatestResponse> {
  const params = new URLSearchParams({ job_name: jobName });
  const response = await apiFetch(`/api/ops/job-runs/latest?${params.toString()}`);
  return (await response.json()) as JobRunLatestResponse;
}

export async function triggerDailyUpdate(): Promise<TriggerDailyUpdateResponse> {
  const response = await apiFetch("/api/ops/trigger-daily-update", { method: "POST" });
  return (await response.json()) as TriggerDailyUpdateResponse;
}
