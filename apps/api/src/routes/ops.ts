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

type JobRunLatestResponse =
  | {
      item: JobRunRecord | null;
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

  return c.json<JobRunLatestResponse>({
    item: ((data ?? [])[0] ?? null) as JobRunRecord | null,
    status: "ok",
  });
});
