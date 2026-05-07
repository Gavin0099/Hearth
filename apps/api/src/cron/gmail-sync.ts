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
    if (lower.includes(sender.toLowerCase())) {
      return bank;
    }
  }
  return null;
}

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
  if (!response.ok) {
    throw new Error(`Gmail API ${response.status}: ${path}`);
  }
  return response.json();
}

async function syncUserGmail(
  userId: string,
  encryptedRefreshToken: string,
  env: WorkerBindings,
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  afterDate: string,
): Promise<{ queued: number; errors: string[] }> {
  const errors: string[] = [];
  let queued = 0;

  const refreshToken = await decryptSecretValue(encryptedRefreshToken, env);
  if (!refreshToken) {
    return { queued: 0, errors: ["failed to decrypt refresh token"] };
  }

  const accessToken = await exchangeRefreshToken(
    refreshToken,
    env.GOOGLE_CLIENT_ID!,
    env.GOOGLE_CLIENT_SECRET!,
  );
  if (!accessToken) {
    return { queued: 0, errors: ["failed to exchange refresh token"] };
  }

  const allSenders = Object.values(BANK_SENDERS);
  const senderQuery = allSenders.map((s) => `from:${s}`).join(" OR ");
  const query = `(${senderQuery}) after:${afterDate} has:attachment filename:pdf`;

  let messages: { id: string }[] = [];
  try {
    const list = (await gmailGet(
      `/messages?${new URLSearchParams({ q: query, maxResults: "50" })}`,
      accessToken,
    )) as { messages?: { id: string }[] };
    messages = list.messages ?? [];
  } catch (err) {
    return { queued: 0, errors: [err instanceof Error ? err.message : String(err)] };
  }

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

      const bank = identifyBank(from);
      if (!bank) continue;

      const attachments = extractPdfAttachments(detail.payload as MsgPart);
      for (const att of attachments) {
        const { error } = await supabase.from("gmail_sync_queue").upsert(
          {
            user_id: userId,
            bank,
            email_id: msg.id,
            email_subject: subject,
            email_date: date,
            attachment_id: att.attachmentId,
            attachment_filename: att.filename,
            status: "pending",
          },
          { onConflict: "user_id,email_id,attachment_id", ignoreDuplicates: true },
        );
        if (!error) queued++;
      }
    } catch (err) {
      errors.push(`msg ${msg.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await supabase
    .from("user_settings")
    .upsert(
      { user_id: userId, gmail_last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  return { queued, errors };
}

export async function runGmailSync(env: WorkerBindings): Promise<void> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    console.log("[gmail-sync] Skipped: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured.");
    return;
  }

  const supabase = createSupabaseAdminClient(env);
  const startedAt = new Date().toISOString();

  const since = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
  const afterDate = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, "0")}/${String(since.getDate()).padStart(2, "0")}`;

  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select("user_id, gmail_refresh_token")
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

  let totalQueued = 0;
  const allErrors: string[] = [];

  for (const row of settings ?? []) {
    if (!row.gmail_refresh_token) continue;
    const { queued, errors } = await syncUserGmail(
      row.user_id,
      row.gmail_refresh_token,
      env,
      supabase,
      afterDate,
    );
    totalQueued += queued;
    for (const e of errors) {
      allErrors.push(`[${row.user_id}] ${e}`);
    }
  }

  const finishedAt = new Date().toISOString();
  await supabase.from("job_runs").insert({
    job_name: "gmail-sync",
    run_started_at: startedAt,
    run_finished_at: finishedAt,
    status: allErrors.length > 0 ? "error" : "ok",
    report: {
      users_processed: (settings ?? []).length,
      emails_queued: totalQueued,
      errors: allErrors,
    },
  });

  console.log(
    `[gmail-sync] Done. users=${(settings ?? []).length} queued=${totalQueued} errors=${allErrors.length}`,
  );
}
