import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchBillEmails, downloadAttachment, type GmailBillEmail } from "../lib/gmail";
import { extractPdfText, parseSinopacPdfText, parseEsunPdfText } from "../lib/pdf-parser";
import { fetchUserSettings } from "../lib/user-settings";
import { saveUserSettings } from "../lib/user-settings";
import { importTransactionsCsv } from "../lib/imports";
import { fetchAccounts } from "../lib/accounts";

type GmailSyncPanelProps = {
  session: Session | null;
  onImported: () => void;
};

type SyncState =
  | { status: "idle" }
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

const BANK_NAME_KEYWORDS: Record<string, string[]> = {
  sinopac: ["永豐", "sinopac"],
  esun: ["玉山", "esun"],
};

function matchAccountForBank(bank: string, accounts: { id: string; name: string }[]) {
  const keywords = BANK_NAME_KEYWORDS[bank] ?? [];
  const matched = accounts.find((a) =>
    keywords.some((k) => a.name.toLowerCase().includes(k.toLowerCase())),
  );
  return matched?.id ?? accounts[0]?.id ?? "";
}

export function GmailSyncPanel({ session, onImported }: GmailSyncPanelProps) {
  const [state, setState] = useState<SyncState>({ status: "idle" });
  const [emails, setEmails] = useState<GmailBillEmail[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  // per-email account override: emailId → accountId
  const [emailAccountMap, setEmailAccountMap] = useState<Record<string, string>>({});

  function getAccountForEmail(email: GmailBillEmail) {
    return emailAccountMap[email.id] ?? matchAccountForBank(email.bank, accounts);
  }

  async function handleConnect() {
    setState({ status: "loading", message: "載入帳戶資料..." });
    const result = await fetchAccounts();
    if (result.status === "error") {
      setState({ status: "error", message: result.error });
      return;
    }
    setAccounts(result.items);
    setState({ status: "loading", message: "搜尋 Gmail 帳單信件..." });

    const accessToken = session?.provider_token;
    if (!accessToken) {
      setState({ status: "error", message: "找不到 Gmail 存取權杖，請重新登入。" });
      return;
    }

    try {
      const [sinopacEmails, esunEmails] = await Promise.all([
        fetchBillEmails(accessToken, "sinopac"),
        fetchBillEmails(accessToken, "esun"),
      ]);
      const all = [...sinopacEmails, ...esunEmails];
      setEmails(all);
      setState({ status: "idle" });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "搜尋失敗" });
    }
  }

  async function handleSync(email: GmailBillEmail) {
    const accessToken = session?.provider_token;
    if (!accessToken) {
      setState({ status: "error", message: "找不到 Gmail 存取權杖，請重新登入。" });
      return;
    }

    const accountId = getAccountForEmail(email);
    if (!accountId) {
      setState({ status: "error", message: "找不到對應帳戶，請先在「帳戶」區塊建立帳戶。" });
      return;
    }

    setState({ status: "loading", message: `下載 ${email.subject} 的附件...` });

    try {
      const settings = await fetchUserSettings();
      const password = email.bank === "sinopac"
        ? settings.sinopac_pdf_password ?? ""
        : settings.esun_pdf_password ?? "";

      const pdfAttachment = email.attachments.find((a) =>
        a.mimeType === "application/pdf" || a.filename.endsWith(".pdf"),
      );

      if (!pdfAttachment) {
        setState({ status: "error", message: "找不到 PDF 附件。" });
        return;
      }

      setState({ status: "loading", message: "解密並解析 PDF..." });
      const bytes = await downloadAttachment(email.id, pdfAttachment.id, accessToken);
      const text = await extractPdfText(bytes, password || undefined);

      const parsed = email.bank === "sinopac"
        ? parseSinopacPdfText(text)
        : parseEsunPdfText(text);

      if (parsed.length === 0) {
        setState({ status: "error", message: "PDF 解析後找不到任何交易資料，格式可能需要調整。" });
        return;
      }

      setState({ status: "loading", message: `匯入 ${parsed.length} 筆交易...` });

      const csvLines = [
        "date,amount,currency,category,description",
        ...parsed.map((t) =>
          `${t.date},${t.amount},${t.currency},,${t.description.replace(/,/g, " ")}`,
        ),
      ].join("\n");

      const csvFile = new File([csvLines], "gmail-import.csv", { type: "text/csv" });
      const result = await importTransactionsCsv(accountId, csvFile);

      await saveUserSettings({ gmail_last_sync_at: new Date().toISOString() });

      if (result.status === "error") {
        setState({ status: "error", message: result.error });
        return;
      }

      setState({
        status: "done",
        message: `匯入完成：成功 ${result.imported} 筆，跳過 ${result.skipped} 筆。`,
      });
      onImported();
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "同步失敗" });
    }
  }

  if (!session) return null;

  return (
    <article className="panel">
      <h2>Gmail 帳單同步</h2>
      <p>自動從 Gmail 抓取永豐、玉山信用卡帳單並匯入交易。</p>

      <button
        className="action-button"
        onClick={() => void handleConnect()}
        disabled={state.status === "loading"}
      >
        {state.status === "loading" ? "處理中..." : "搜尋帳單信件"}
      </button>

      {state.status === "loading" && <p>{state.message}</p>}
      {state.status === "error" && <p>錯誤：{state.message}</p>}
      {state.status === "done" && <p>{state.message}</p>}

      {emails.length > 0 && (
        <>
          <p>找到 {emails.length} 封帳單信件：</p>
          <ul className="gmail-email-list">
            {emails.map((email) => (
              <li key={email.id} className="gmail-email-item">
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                  <span>{email.bank === "sinopac" ? "永豐" : "玉山"} — {email.subject}</span>
                  {accounts.length > 1 && (
                    <select
                      style={{ fontSize: "0.82rem", padding: "2px 6px", borderRadius: "8px", border: "1px solid rgba(91,66,44,0.18)", background: "#fffdf9" }}
                      value={getAccountForEmail(email)}
                      onChange={(e) => setEmailAccountMap((m) => ({ ...m, [email.id]: e.target.value }))}
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <button
                  className="action-button secondary"
                  onClick={() => void handleSync(email)}
                  disabled={state.status === "loading"}
                >
                  匯入
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
