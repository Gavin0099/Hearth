import { Hono } from "hono";
import type { ApiEnv } from "../types";

export type ImportJobRecord = {
  id: string;
  gmail_message_id: string;
  attachment_id: string;
  email_subject: string;
  email_date: string;
  filename: string;
  bank_key: string;
  source_type: "credit_card" | "bank_account";
  mapped_account_id: string | null;
  status: "pending_parse" | "parsed" | "imported" | "failed" | "needs_review" | "auth_required";
  error_code: string | null;
  error_message: string | null;
  imported_count: number | null;
  skipped_count: number | null;
  created_at: string;
  updated_at: string;
};

export const importJobsRoutes = new Hono<ApiEnv>();

// GET /api/import-jobs — list jobs for current user
importJobsRoutes.get("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "unauthorized", status: "error" }, 401);

  const status = c.req.query("status");
  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  let query = supabase
    .from("import_jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return c.json({ error: error.message, status: "error" }, 500);
  return c.json({ items: data ?? [], status: "ok" });
});

// PATCH /api/import-jobs/:id — update status after browser-side parse/import
importJobsRoutes.patch("/:id", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "unauthorized", status: "error" }, 401);

  const id = c.req.param("id");
  const body = await c.req.json<{
    status: "parsed" | "imported" | "failed" | "needs_review";
    imported_count?: number;
    skipped_count?: number;
    error_code?: string;
    error_message?: string;
  }>();

  const allowed = ["parsed", "imported", "failed", "needs_review", "auth_required", "pending_parse"];
  if (!allowed.includes(body.status)) {
    return c.json({ error: "invalid status", status: "error" }, 400);
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  const { error } = await supabase
    .from("import_jobs")
    .update({
      status: body.status,
      imported_count: body.imported_count ?? null,
      skipped_count: body.skipped_count ?? null,
      error_code: body.error_code ?? null,
      error_message: body.error_message ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return c.json({ error: error.message, status: "error" }, 500);
  return c.json({ status: "ok" });
});
