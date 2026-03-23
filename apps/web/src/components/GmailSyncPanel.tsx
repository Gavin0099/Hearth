import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountRecord } from "@hearth/shared";
import {
  downloadAttachment,
  fetchBillEmails,
  type GmailBillEmail,
} from "../lib/gmail";
import { fetchAccounts } from "../lib/accounts";
import { importTransactionsCsv } from "../lib/imports";
import { extractPdfText, parseEsunPdfText, parseSinopacPdfText } from "../lib/pdf-parser";
import { fetchUserSettings, saveUserSettings } from "../lib/user-settings";

type GmailSyncPanelProps = {
  session: Session | null;
  onImported: () => void;
};

type SyncState =
  | { status: "idle" }
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

const BANK_NAME_KEYWORDS: Record<"sinopac" | "esun", string[]> = {
  sinopac: ["永豐", "sinopac"],
  esun: ["玉山", "esun"],
};

function resolveImportAccountId(
  bank: "sinopac" | "esun",
  accounts: AccountRecord[],
) {
  const creditAccounts = accounts.filter((account) => account.type === "cash_credit");
  if (creditAccounts.length === 0) {
    return "";
  }

  const matched = creditAccounts.find((account) =>
    BANK_NAME_KEYWORDS[bank].some((keyword) =>
      account.name.toLowerCase().includes(keyword.toLowerCase()),
    ),
  );

  return matched?.id ?? creditAccounts[0]?.id ?? "";
}

export function GmailSyncPanel({ session, onImported }: GmailSyncPanelProps) {
  const [state, setState] = useState<SyncState>({ status: "idle" });
  const [emails, setEmails] = useState<GmailBillEmail[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);

  async function handleConnect() {
    setState({ status: "loading", message: "載入信用卡帳戶中..." });

    const accountsResult = await fetchAccounts();
    if (accountsResult.status === "error") {
      setState({ status: "error", message: accountsResult.error });
      return;
    }

    const creditAccounts = accountsResult.items.filter((account) => account.type === "cash_credit");
    if (creditAccounts.length === 0) {
      setState({
        status: "error",
        message: "請先建立至少一個信用卡帳戶，Gmail 帳單同步才能寫入交易資料。",
      });
      return;
    }

    setAccounts(accountsResult.items);
    setState({ status: "loading", message: "連線 Gmail 並搜尋帳單中..." });

    const accessToken = session?.provider_token;
    if (!accessToken) {
      setState({ status: "error", message: "目前沒有 Gmail 存取權杖，請重新登入後再試。" });
      return;
    }

    try {
      const [sinopacEmails, esunEmails] = await Promise.all([
        fetchBillEmails(accessToken, "sinopac"),
        fetchBillEmails(accessToken, "esun"),
      ]);

      setEmails([...sinopacEmails, ...esunEmails]);
      setState({ status: "idle" });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Gmail 同步失敗。",
      });
    }
  }

  async function handleSync(email: GmailBillEmail) {
    const accessToken = session?.provider_token;
    if (!accessToken) {
      setState({ status: "error", message: "目前沒有 Gmail 存取權杖，請重新登入後再試。" });
      return;
    }

    const accountId = resolveImportAccountId(email.bank, accounts);
    if (!accountId) {
      setState({
        status: "error",
        message: "找不到可用的信用卡帳戶。請先建立至少一個 `信用卡` 類型帳戶。",
      });
      return;
    }

    setState({ status: "loading", message: `解析 ${email.subject} 中...` });

    try {
      const settings = await fetchUserSettings();
      const password =
        email.bank === "sinopac"
          ? settings.sinopac_pdf_password ?? ""
          : settings.esun_pdf_password ?? "";

      const pdfAttachment = email.attachments.find(
        (attachment) =>
          attachment.mimeType === "application/pdf" || attachment.filename.endsWith(".pdf"),
      );

      if (!pdfAttachment) {
        setState({ status: "error", message: "這封信找不到 PDF 附件。" });
        return;
      }

      setState({ status: "loading", message: "下載並解析 PDF 中..." });
      const bytes = await downloadAttachment(email.id, pdfAttachment.id, accessToken);
      const text = await extractPdfText(bytes, password || undefined);

      const parsed =
        email.bank === "sinopac" ? parseSinopacPdfText(text) : parseEsunPdfText(text);

      if (parsed.length === 0) {
        setState({
          status: "error",
          message: "PDF 已讀取，但沒有解析出交易。可能是版面差異或密碼錯誤。",
        });
        return;
      }

      setState({ status: "loading", message: `匯入 ${parsed.length} 筆交易中...` });

      const csvLines = [
        "date,amount,currency,category,description",
        ...parsed.map(
          (transaction) =>
            `${transaction.date},${transaction.amount},${transaction.currency},,${transaction.description.replace(/,/g, " ")}`,
        ),
      ].join("\n");

      const csvFile = new File([csvLines], "gmail-import.csv", { type: "text/csv" });
      const result = await importTransactionsCsv(
        accountId,
        csvFile,
        email.bank === "sinopac" ? "gmail_pdf_sinopac" : "gmail_pdf_esun",
      );

      await saveUserSettings({ gmail_last_sync_at: new Date().toISOString() });

      if (result.status === "error") {
        setState({ status: "error", message: result.error });
        return;
      }

      setState({
        status: "done",
        message: `匯入完成：新增 ${result.imported} 筆，略過 ${result.skipped} 筆。`,
      });
      onImported();
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "帳單匯入失敗。",
      });
    }
  }

  if (!session) return null;

  return (
    <article className="panel">
      <h2>Gmail 帳單同步</h2>
      <p>自動抓取永豐與玉山信用卡帳單，匯入後以銀行標籤區分，不需要逐封指定帳戶。</p>

      <button
        className="action-button"
        onClick={() => void handleConnect()}
        disabled={state.status === "loading"}
        type="button"
      >
        {state.status === "loading" ? "處理中..." : "連線並抓取帳單"}
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
                  <span>{email.bank === "sinopac" ? "永豐" : "玉山"} - {email.subject}</span>
                </div>
                <button
                  className="action-button secondary"
                  onClick={() => void handleSync(email)}
                  disabled={state.status === "loading"}
                  type="button"
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
