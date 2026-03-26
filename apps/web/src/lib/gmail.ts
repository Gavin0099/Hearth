const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_FETCH_TIMEOUT_MS = 12000;

const BANK_SENDERS = {
  sinopac: "ebillservice@newebill.banksinopac.com.tw",
  esun: "estatement@esunbank.com",
  cathay: "service@pxbillrc01.cathaybk.com.tw",
  taishin: "webmaster@bhurecv.taishinbank.com.tw",
  ctbc: "ebill@estats.ctbcbank.com",
  mega: "billhunter@billhunter.megabank.com.tw",
};

export type BankKey = keyof typeof BANK_SENDERS;

async function gmailFetch(path: string, accessToken: string) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), GMAIL_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${GMAIL_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Gmail API timeout after ${GMAIL_FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

type MsgPart = {
  filename?: string;
  mimeType: string;
  body: { attachmentId?: string; size?: number };
  parts?: MsgPart[];
};

function extractAttachments(part: MsgPart): { id: string; filename: string; mimeType: string }[] {
  const results: { id: string; filename: string; mimeType: string }[] = [];
  if (part.filename && part.body.attachmentId) {
    results.push({ id: part.body.attachmentId, filename: part.filename, mimeType: part.mimeType });
  }
  for (const child of part.parts ?? []) {
    results.push(...extractAttachments(child));
  }
  return results;
}

export type GmailBillEmail = {
  id: string;
  subject: string;
  date: string;
  bank: BankKey;
  attachments: { id: string; filename: string; mimeType: string }[];
};

export async function fetchBillEmails(
  accessToken: string,
  bank: BankKey,
  maxResults = 4,
): Promise<GmailBillEmail[]> {
  const sender = BANK_SENDERS[bank];
  const query = encodeURIComponent(`from:${sender} has:attachment`);
  const list = await gmailFetch(
    `/messages?q=${query}&maxResults=${maxResults}`,
    accessToken,
  ) as { messages?: { id: string }[] };

  if (!list.messages?.length) return [];

  const settled = await Promise.allSettled(
    list.messages.map(async ({ id }) => {
      const msg = await gmailFetch(`/messages/${id}?format=full`, accessToken) as {
        payload: {
          headers: { name: string; value: string }[];
          parts?: MsgPart[];
          body?: { attachmentId?: string; size?: number };
          filename?: string;
          mimeType?: string;
        };
      };

      const headers = msg.payload.headers;
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
      const date = headers.find((h) => h.name === "Date")?.value ?? "";
      const attachments = extractAttachments(msg.payload as MsgPart);

      return { id, subject, date, bank, attachments } satisfies GmailBillEmail;
    }),
  );

  const emails = settled
    .filter((result): result is PromiseFulfilledResult<GmailBillEmail> => result.status === "fulfilled")
    .map((result) => result.value);

  if (emails.length > 0) {
    return emails;
  }

  const firstFailure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (firstFailure) {
    throw firstFailure.reason instanceof Error ? firstFailure.reason : new Error(String(firstFailure.reason));
  }

  return [];
}

export async function downloadAttachment(
  messageId: string,
  attachmentId: string,
  accessToken: string,
): Promise<Uint8Array> {
  const data = await gmailFetch(
    `/messages/${messageId}/attachments/${attachmentId}`,
    accessToken,
  ) as { data: string };

  const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
