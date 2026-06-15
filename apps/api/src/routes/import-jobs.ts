import { Hono } from "hono";
import { runGmailSyncForUser } from "../cron/gmail-sync";
import { buildGmailAccountMappingIndex } from "../lib/gmail-account-resolver";
import type { ApiEnv } from "../types";

const BANK_ACCOUNT_KEYWORDS = [
  "綜合對帳單", "存款對帳單", "活期對帳", "銀行對帳", "帳戶對帳",
];

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
  review_reason: string | null;
  error_code: string | null;
  error_message: string | null;
  imported_count: number | null;
  skipped_count: number | null;
  created_at: string;
  updated_at: string;
};

export const importJobsRoutes = new Hono<ApiEnv>();

function detectSourceType(subject: string): "credit_card" | "bank_account" {
  const lower = subject.toLowerCase();
  for (const keyword of BANK_ACCOUNT_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) return "bank_account";
  }
  return "credit_card";
}

function isSupportedBank(value: unknown): value is ImportJobRecord["bank_key"] {
  return typeof value === "string" && ["sinopac", "esun", "cathay", "taishin", "ctbc", "mega"].includes(value);
}

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

// POST /api/import-jobs/sync-now - scan Gmail for the current user before browser-side parsing.
importJobsRoutes.post("/sync-now", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "unauthorized", status: "error" }, 401);

  try {
    const report = await runGmailSyncForUser(c.env, user.id);
    return c.json({ report, status: "ok" });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : String(error),
      status: "error",
    }, 500);
  }
});

// POST /api/import-jobs/from-gmail-search - persist browser Gmail search results as user-owned jobs.
importJobsRoutes.post("/from-gmail-search", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "unauthorized", status: "error" }, 401);

  const body = await c.req.json<{
    emails?: Array<{
      id?: string;
      subject?: string;
      date?: string;
      bank?: string;
      attachments?: Array<{ id?: string; filename?: string; mimeType?: string }>;
    }>;
  }>();

  const emails = Array.isArray(body.emails) ? body.emails : [];
  if (emails.length > 100) {
    return c.json({ error: "too many emails", status: "error" }, 400);
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  const { data: mappings, error: mappingError } = await supabase
    .from("bank_account_mapping")
    .select("bank_key, source_type, account_id")
    .eq("user_id", user.id)
    .eq("enabled", true);

  if (mappingError) return c.json({ error: mappingError.message, status: "error" }, 500);

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, type, broker")
    .eq("user_id", user.id);

  if (accountsError) return c.json({ error: accountsError.message, status: "error" }, 500);

  const mappingIndex = buildGmailAccountMappingIndex(mappings, accounts);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const email of emails) {
    if (!email.id || !email.subject || !isSupportedBank(email.bank)) {
      skipped += 1;
      continue;
    }

    const sourceType = detectSourceType(email.subject);
    const mappedAccountId = mappingIndex[`${email.bank}:${sourceType}`] ?? null;
    const status = mappedAccountId ? "pending_parse" : "needs_review";
    const pdfAttachments = (email.attachments ?? []).filter((attachment) =>
      attachment.id &&
      attachment.filename &&
      (attachment.mimeType === "application/pdf" || attachment.filename.toLowerCase().endsWith(".pdf"))
    );

    for (const attachment of pdfAttachments) {
      const { error: insertError } = await supabase.from("import_jobs").insert({
        user_id: user.id,
        gmail_message_id: email.id,
        attachment_id: attachment.id,
        email_subject: email.subject,
        email_date: email.date ?? "",
        filename: attachment.filename,
        bank_key: email.bank,
        source_type: sourceType,
        mapped_account_id: mappedAccountId,
        status,
        review_reason: mappedAccountId ? null : "missing_mapping",
        updated_at: new Date().toISOString(),
      });

      if (!insertError) {
        created += 1;
        continue;
      }

      if (insertError.code !== "23505") {
        return c.json({ error: insertError.message, status: "error" }, 500);
      }

      if (!mappedAccountId) {
        skipped += 1;
        continue;
      }

      const { data: updateData, error: updateError } = await supabase
        .from("import_jobs")
        .update({
          status: "pending_parse",
          mapped_account_id: mappedAccountId,
          review_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("gmail_message_id", email.id)
        .eq("attachment_id", attachment.id)
        .eq("status", "needs_review")
        .eq("review_reason", "missing_mapping")
        .select("id");

      if (updateError) return c.json({ error: updateError.message, status: "error" }, 500);
      const updatedCount = Array.isArray(updateData) ? updateData.length : 0;
      updated += updatedCount;
      if (updatedCount === 0) skipped += 1;
    }
  }

  return c.json({ created, updated, skipped, status: "ok" });
});

// PATCH /api/import-jobs/:id — update status after browser-side parse/import
importJobsRoutes.patch("/:id", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "unauthorized", status: "error" }, 401);

  const id = c.req.param("id");
  const body = await c.req.json<{
    status: "parsed" | "imported" | "failed" | "needs_review" | "auth_required" | "pending_parse";
    review_reason?: string | null;
    imported_count?: number;
    skipped_count?: number;
    error_code?: string | null;
    error_message?: string | null;
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
      review_reason: body.review_reason !== undefined ? body.review_reason : null,
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
