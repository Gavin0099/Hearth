import { createSupabaseAdminClient } from "../lib/supabase";
import { decryptSecretValue } from "../lib/secrets";
import type { WorkerBindings } from "../types";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const BANK_SENDERS: Record<string, string> = {
  sinopac: "ebillservice@newebill.banksinopac.com.tw",
  esun: "estatement@esunbank.com",
  cathay: "service@pxbillrc01.cathaybk.com.tw",
  taishin: "webmaster@bhurecv.taishinbank.com.tw",
  ctbc: "ebill@estats.ctbcbank.com",
  mega: "billhunter@billhunter.megabank.com.tw",
};

const BANK_ACCOUNT_KEYWORDS = [
  "綜合對帳單", "存款對帳單", "活期對帳", "銀行對帳", "帳戶對帳",
];

// ── Subrequest budget ────────────────────────────────────────────────────────
// Cloudflare Workers free plan: 50 external subrequests / invocation.
// Budget breakdown per user:
//   FIXED  : 1 OAuth exchange + 1 mapping SELECT + 1 Gmail list + 1 settings upsert = 4
//   PER MSG: 1 Gmail message GET + 1 import_jobs INSERT/UPDATE = 2
//   GLOBAL : 1 job_runs INSERT
// computeSafeMaxResults ensures we don't exceed the budget across all users.
// On paid/Standard plan you can raise SUBREQUEST_BUDGET to 950+ and relax the cap.
const SUBREQUEST_BUDGET = 45;          // headroom below free-plan 50
const SUBREQUEST_FIXED_GLOBAL = 1;     // job_runs insert
const SUBREQUEST_FIXED_PER_USER = 4;
const SUBREQUEST_PER_MESSAGE = 2;
const SUBREQUEST_MAX_RESULTS_CAP = 50; // never request more than this regardless of plan

function computeSafeMaxResults(userCount: number): number {
  if (userCount === 0) return SUBREQUEST_MAX_RESULTS_CAP;
  const available = SUBREQUEST_BUDGET - SUBREQUEST_FIXED_GLOBAL;
  const perUserBudget = Math.floor(available / userCount) - SUBREQUEST_FIXED_PER_USER;
  return Math.max(1, Math.min(SUBREQUEST_MAX_RESULTS_CAP, Math.floor(perUserBudget / SUBREQUEST_PER_MESSAGE)));
}

// ── Scan window ──────────────────────────────────────────────────────────────
// Uses last_successful_scan_at - overlap if available; falls back to 35 days for first run.
const SCAN_OVERLAP_DAYS = 2;
const INITIAL_SCAN_DAYS = 180; // first-ever scan: look back 6 months

function computeAfterDate(lastSuccessfulScanAt: string | null): string {
  const since = lastSuccessfulScanAt
    ? new Date(new Date(lastSuccessfulScanAt).getTime() - SCAN_OVERLAP_DAYS * 24 * 60 * 60 * 1000)
    : new Date(Date.now() - INITIAL_SCAN_DAYS * 24 * 60 * 60 * 1000);
  return `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, "0")}/${String(since.getDate()).padStart(2, "0")}`;
}

// ── Types ────────────────────────────────────────────────────────────────────

type MsgPart = {
  filename?: string;
  mimeType: string;
  body: { attachmentId?: string; size?: number };
  parts?: MsgPart[];
};

function extractPdfAttachments(part: MsgPart): { attachmentId: string; filename: string }[] {
  const results: { attachmentId: string; filename: string }[] = [];
  if (part.mimeType === "application/pdf" && part.filename && part.body.attachmentId) {
    results.push({ attachmentId: part.body.attachmentId, filename: part.filename });
  }
  for (const child of part.parts ?? []) {
    results.push(...extractPdfAttachments(child));
  }
  return results;
}

function identifyBank(fromHeader: string): string | null {
  const lower = fromHeader.toLowerCase();
  for (const [bank, sender] of Object.entries(BANK_SENDERS)) {
    if (lower.includes(sender.toLowerCase())) return bank;
  }
  return null;
}

function detectSourceType(subject: string): "credit_card" | "bank_account" {
  const lower = subject.toLowerCase();
  for (const keyword of BANK_ACCOUNT_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) return "bank_account";
  }
  return "credit_card";
}

// ── OAuth ────────────────────────────────────────────────────────────────────

async function exchangeRefreshToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function gmailGet(path: string, accessToken: string): Promise<unknown> {
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Gmail API ${response.status}: ${path}`);
  return response.json();
}

// ── Per-user sync ────────────────────────────────────────────────────────────

async function syncUserGmail(
  userId: string,
  encryptedRefreshToken: string,
  env: WorkerBindings,
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  afterDate: string,
  maxResults: number,
): Promise<{ queued: number; messagesFetched: number; errors: string[]; scanSucceeded: boolean }> {
  const errors: string[] = [];
  let queued = 0;
  let messagesFetched = 0;

  const refreshToken = await decryptSecretValue(encryptedRefreshToken, env);
  if (!refreshToken) {
    return { queued: 0, messagesFetched: 0, errors: ["failed to decrypt refresh token"], scanSucceeded: false };
  }

  const accessToken = await exchangeRefreshToken(refreshToken, env.GOOGLE_CLIENT_ID!, env.GOOGLE_CLIENT_SECRET!);
  if (!accessToken) {
    return { queued: 0, messagesFetched: 0, errors: ["failed to exchange refresh token"], scanSucceeded: false };
  }

  const { data: mappings } = await supabase
    .from("bank_account_mapping")
    .select("bank_key, source_type, account_id")
    .eq("user_id", userId)
    .eq("enabled", true);

  const mappingIndex: Record<string, string> = {};
  for (const m of mappings ?? []) {
    mappingIndex[`${m.bank_key}:${m.source_type}`] = m.account_id;
  }

  const allSenders = Object.values(BANK_SENDERS);
  const senderQuery = allSenders.map((s) => `from:${s}`).join(" OR ");
  const query = `(${senderQuery}) after:${afterDate} has:attachment filename:pdf`;

  let messages: { id: string }[] = [];
  try {
    const list = (await gmailGet(
      `/messages?${new URLSearchParams({ q: query, maxResults: String(maxResults) })}`,
      accessToken,
    )) as { messages?: { id: string }[] };
    messages = list.messages ?? [];
    messagesFetched = messages.length;
  } catch (err) {
    return {
      queued: 0,
      messagesFetched: 0,
      errors: [err instanceof Error ? err.message : String(err)],
      scanSucceeded: false,
    };
  }

  // Gmail list fetch succeeded — individual message errors do not block timestamp update
  for (const msg of messages) {
    try {
      const detail = (await gmailGet(`/messages/${msg.id}?format=full`, accessToken)) as {
        payload: {
          headers: { name: string; value: string }[];
          parts?: MsgPart[];
          mimeType?: string;
          filename?: string;
          body?: { attachmentId?: string; size?: number };
        };
      };

      const headers = detail.payload.headers;
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
      const from = headers.find((h) => h.name === "From")?.value ?? "";
      const date = headers.find((h) => h.name === "Date")?.value ?? "";

      const bankKey = identifyBank(from);
      if (!bankKey) continue;

      const sourceType = detectSourceType(subject);
      const mappedAccountId = mappingIndex[`${bankKey}:${sourceType}`] ?? null;
      const status = mappedAccountId ? "pending_parse" : "needs_review";

      const attachments = extractPdfAttachments(detail.payload as MsgPart);
      for (const att of attachments) {
        const { error: insertError } = await supabase.from("import_jobs").insert({
          user_id: userId,
          gmail_message_id: msg.id,
          attachment_id: att.attachmentId,
          email_subject: subject,
          email_date: date,
          filename: att.filename,
          bank_key: bankKey,
          source_type: sourceType,
          mapped_account_id: mappedAccountId,
          status,
          review_reason: mappedAccountId ? null : "missing_mapping",
          updated_at: new Date().toISOString(),
        });

        if (insertError?.code === "23505") {
          // Job already exists. Upgrade only if: needs_review + missing_mapping AND now has mapping.
          if (mappedAccountId) {
            await supabase
              .from("import_jobs")
              .update({
                status: "pending_parse",
                mapped_account_id: mappedAccountId,
                review_reason: null,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId)
              .eq("gmail_message_id", msg.id)
              .eq("attachment_id", att.attachmentId)
              .eq("status", "needs_review")
              .eq("review_reason", "missing_mapping");
            queued++;
          }
        } else if (!insertError) {
          queued++;
        }
      }
    } catch (err) {
      errors.push(`msg ${msg.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { queued, messagesFetched, errors, scanSucceeded: true };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runGmailSync(env: WorkerBindings): Promise<void> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    console.log("[gmail-sync] Skipped: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured.");
    return;
  }

  const supabase = createSupabaseAdminClient(env);
  const startedAt = new Date().toISOString();

  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select("user_id, gmail_refresh_token, gmail_last_successful_scan_at")
    .not("gmail_refresh_token", "is", null);

  if (settingsError) {
    await supabase.from("job_runs").insert({
      job_name: "gmail-sync",
      run_started_at: startedAt,
      run_finished_at: new Date().toISOString(),
      status: "error",
      report: { error: settingsError.message },
    });
    return;
  }

  const userCount = (settings ?? []).length;
  const requestedMaxResults = 50;
  const effectiveMaxResults = computeSafeMaxResults(userCount);

  let totalQueued = 0;
  const allErrors: string[] = [];
  const userReports: Array<{
    user_id: string;
    afterDate: string;
    messagesFetched: number;
    queued: number;
    scanSucceeded: boolean;
  }> = [];

  for (const row of settings ?? []) {
    if (!row.gmail_refresh_token) continue;

    const lastSuccessfulScanAt =
      (row as Record<string, unknown>).gmail_last_successful_scan_at as string | null ?? null;
    const afterDate = computeAfterDate(lastSuccessfulScanAt);

    const { queued, messagesFetched, errors, scanSucceeded } = await syncUserGmail(
      row.user_id,
      row.gmail_refresh_token,
      env,
      supabase,
      afterDate,
      effectiveMaxResults,
    );

    totalQueued += queued;
    for (const e of errors) allErrors.push(`[${row.user_id}] ${e}`);
    userReports.push({ user_id: row.user_id, afterDate, messagesFetched, queued, scanSucceeded });

    const now = new Date().toISOString();
    await supabase.from("user_settings").upsert(
      {
        user_id: row.user_id,
        gmail_last_sync_at: now,
        ...(scanSucceeded ? { gmail_last_successful_scan_at: now } : {}),
        updated_at: now,
      },
      { onConflict: "user_id" },
    );
  }

  const finishedAt = new Date().toISOString();
  await supabase.from("job_runs").insert({
    job_name: "gmail-sync",
    run_started_at: startedAt,
    run_finished_at: finishedAt,
    status: allErrors.length > 0 ? "error" : "ok",
    report: {
      users_processed: userCount,
      jobs_created: totalQueued,
      subrequest_budget: SUBREQUEST_BUDGET,
      requested_max_results: requestedMaxResults,
      effective_max_results: effectiveMaxResults,
      scan_windows: userReports.map((r) => ({
        user_id: r.user_id,
        after_date: r.afterDate,
        messages_fetched: r.messagesFetched,
        queued: r.queued,
        scan_succeeded: r.scanSucceeded,
      })),
      errors: allErrors,
    },
  });

  console.log(
    `[gmail-sync] Done. users=${userCount} effective_max=${effectiveMaxResults} jobs_created=${totalQueued} errors=${allErrors.length}`,
  );
}
