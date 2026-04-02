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

type JobRunSummaryResponse =
  | {
      job_name: string;
      limit: number;
      verdict: "healthy" | "warning" | "critical";
      reasons: string[];
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
  | {
      code: "unauthorized" | "database_error";
      error: string;
      status: "error";
    };

export const opsRoutes = new Hono<ApiEnv>();

function countLeadingMatches<T>(items: T[], predicate: (item: T) => boolean) {
  let count = 0;
  for (const item of items) {
    if (!predicate(item)) break;
    count += 1;
  }
  return count;
}

async function resolveOpsContext(c: any) {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return {
      errorResponse: c.json(
        { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" },
        401,
      ),
      supabase: null,
    };
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  return {
    errorResponse: null,
    supabase: createSupabaseAdminClient(c.env),
  };
}

opsRoutes.get("/job-runs/latest", async (c) => {
  const { errorResponse, supabase } = await resolveOpsContext(c);
  if (errorResponse || !supabase) {
    return errorResponse as Response;
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

opsRoutes.get("/job-runs/summary", async (c) => {
  const { errorResponse, supabase } = await resolveOpsContext(c);
  if (errorResponse || !supabase) {
    return errorResponse as Response;
  }

  const jobName = String(c.req.query("job_name") ?? "daily-update").trim() || "daily-update";
  const limitRaw = String(c.req.query("limit") ?? "").trim();
  const requestedLimit =
    limitRaw && Number.isFinite(Number(limitRaw)) && Number(limitRaw) > 0 ? Number(limitRaw) : 10;
  const limit = Math.min(50, Math.max(1, Math.floor(requestedLimit)));
  const maxAgeMinutesRaw = String(c.req.query("max_age_minutes") ?? "").trim();
  const maxAgeMinutes =
    maxAgeMinutesRaw && Number.isFinite(Number(maxAgeMinutesRaw)) && Number(maxAgeMinutesRaw) > 0
      ? Math.floor(Number(maxAgeMinutesRaw))
      : null;
  const consecutiveFailureThresholdRaw = String(c.req.query("consecutive_failure_threshold") ?? "").trim();
  const consecutiveFailureThreshold =
    consecutiveFailureThresholdRaw && Number.isFinite(Number(consecutiveFailureThresholdRaw)) && Number(consecutiveFailureThresholdRaw) > 0
      ? Math.floor(Number(consecutiveFailureThresholdRaw))
      : 2;
  const consecutiveReportErrorThresholdRaw = String(c.req.query("consecutive_report_error_threshold") ?? "").trim();
  const consecutiveReportErrorThreshold =
    consecutiveReportErrorThresholdRaw && Number.isFinite(Number(consecutiveReportErrorThresholdRaw)) && Number(consecutiveReportErrorThresholdRaw) > 0
      ? Math.floor(Number(consecutiveReportErrorThresholdRaw))
      : 2;

  const { data, error } = await supabase
    .from("job_runs")
    .select("id, job_name, run_started_at, run_finished_at, status, report, created_at")
    .eq("job_name", jobName)
    .order("run_finished_at", { ascending: false })
    .limit(limit);

  if (error) {
    return c.json<JobRunSummaryResponse>(
      { code: "database_error", error: error.message, status: "error" },
      500,
    );
  }

  const items = (data ?? []) as JobRunRecord[];
  const latest = items[0] ?? null;
  const latestReportErrorSections = latest ? collectReportErrorSections(latest.report) : [];
  const latestFinishedAt = latest ? Date.parse(latest.run_finished_at) : Number.NaN;
  const latestAgeMinutes =
    latest && !Number.isNaN(latestFinishedAt)
      ? Math.max(0, Math.floor((Date.now() - latestFinishedAt) / 60_000))
      : null;
  const consecutiveStatusErrors = countLeadingMatches(items, (item) => item.status === "error");
  const consecutiveReportErrorRuns = countLeadingMatches(
    items,
    (item) => collectReportErrorSections(item.report).length > 0,
  );
  const totals = items.reduce(
    (acc, item) => {
      acc.runs += 1;
      if (item.status === "ok") {
        acc.ok += 1;
      } else if (item.status === "error") {
        acc.error += 1;
      }
      if (collectReportErrorSections(item.report).length > 0) {
        acc.with_report_errors += 1;
      }
      return acc;
    },
    {
      runs: 0,
      ok: 0,
      error: 0,
      with_report_errors: 0,
      consecutive_status_errors: consecutiveStatusErrors,
      consecutive_report_error_runs: consecutiveReportErrorRuns,
    },
  );

  const reasons: string[] = [];
  let verdict: "healthy" | "warning" | "critical" = "healthy";

  if (!latest) {
    verdict = "critical";
    reasons.push("no matching job run found");
  } else {
    if (latest.status !== "ok") {
      verdict = "warning";
      reasons.push(`latest status is ${latest.status}`);
    }

    if (latestReportErrorSections.length > 0) {
      verdict = "warning";
      reasons.push(`latest report has section errors: ${latestReportErrorSections.join(",")}`);
    }

    if (maxAgeMinutes !== null && latestAgeMinutes !== null && latestAgeMinutes > maxAgeMinutes) {
      verdict = "critical";
      reasons.push(`latest run is older than ${maxAgeMinutes} minute(s)`);
    }

    if (consecutiveStatusErrors >= consecutiveFailureThreshold) {
      verdict = "critical";
      reasons.push(`latest ${consecutiveStatusErrors} run(s) ended with status=error`);
    }

    if (consecutiveReportErrorRuns >= consecutiveReportErrorThreshold) {
      verdict = "critical";
      reasons.push(`latest ${consecutiveReportErrorRuns} run(s) contain report section errors`);
    }
  }

  return c.json<JobRunSummaryResponse>({
    job_name: jobName,
    limit,
    verdict,
    reasons,
    latest: latest
      ? {
          id: latest.id,
          status: latest.status,
          run_finished_at: latest.run_finished_at,
          report_error_sections: latestReportErrorSections,
          age_minutes: latestAgeMinutes,
        }
      : null,
    totals,
    status: "ok",
  });
});
