import { Hono } from "hono";
import type { ApiEnv } from "../types";

type JobRunRecord = {
  id: string;
  job_name: string;
  run_started_at: string;
  run_finished_at: string;
  status: string;
  report: unknown;
  created_at: string;
};

type SectionErrorReport = {
  errors?: unknown;
};

function collectReportErrorSections(report: unknown): string[] {
  if (!report || typeof report !== "object") {
    return [];
  }

  return Object.entries(report as Record<string, SectionErrorReport>)
    .filter(([, value]) => Array.isArray(value?.errors) && value.errors.length > 0)
    .map(([key]) => key);
}

type JobRunLatestResponse =
  | {
      item: JobRunRecord | null;
      healthy: boolean;
      reason: string;
      checked_at: string;
      status: "ok";
    }
  | {
      code: "unauthorized" | "database_error";
      error: string;
      status: "error";
    };

export const opsRoutes = new Hono<ApiEnv>();

opsRoutes.get("/job-runs/latest", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<JobRunLatestResponse>(
      { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" },
      401,
    );
  }

  const jobName = String(c.req.query("job_name") ?? "daily-update").trim() || "daily-update";
  const requiredStatus = String(c.req.query("require_status") ?? "").trim();
  const maxAgeMinutesRaw = String(c.req.query("max_age_minutes") ?? "").trim();
  const requireZeroErrors =
    String(c.req.query("require_zero_errors") ?? "").trim().toLowerCase() === "true";
  const maxAgeMinutes =
    maxAgeMinutesRaw && Number.isFinite(Number(maxAgeMinutesRaw)) && Number(maxAgeMinutesRaw) > 0
      ? Number(maxAgeMinutesRaw)
      : null;
  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  const { data, error } = await supabase
    .from("job_runs")
    .select("id, job_name, run_started_at, run_finished_at, status, report, created_at")
    .eq("job_name", jobName)
    .order("run_finished_at", { ascending: false })
    .limit(1);

  if (error) {
    return c.json<JobRunLatestResponse>(
      { code: "database_error", error: error.message, status: "error" },
      500,
    );
  }

  const item = ((data ?? [])[0] ?? null) as JobRunRecord | null;
  const checkedAt = new Date().toISOString();

  let healthy = true;
  let reason = "latest job run is acceptable";

  if (!item) {
    healthy = false;
    reason = "no matching job run found";
  } else {
    if (requiredStatus && item.status !== requiredStatus) {
      healthy = false;
      reason = `latest job run status mismatch. expected=${requiredStatus} actual=${item.status}`;
    }

    if (healthy && requireZeroErrors) {
      const errorSections = collectReportErrorSections(item.report);
      if (errorSections.length > 0) {
        healthy = false;
        reason = `latest job run report contains section errors: ${errorSections.join(",")}`;
      }
    }

    if (healthy && maxAgeMinutes !== null) {
      const finishedAt = Date.parse(item.run_finished_at);
      const ageMs = Date.now() - finishedAt;
      if (Number.isNaN(finishedAt)) {
        healthy = false;
        reason = "latest job run has invalid run_finished_at";
      } else if (ageMs > maxAgeMinutes * 60 * 1000) {
        healthy = false;
        reason = `latest job run is older than ${maxAgeMinutes} minute(s)`;
      }
    }
  }

  return c.json<JobRunLatestResponse>({
    item,
    healthy,
    reason,
    checked_at: checkedAt,
    status: "ok",
  });
});
