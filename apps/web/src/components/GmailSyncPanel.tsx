import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountRecord } from "@hearth/shared";
import {
  downloadAttachment,
  fetchBillEmails,
  type BankKey,
  type GmailBillEmail,
} from "../lib/gmail";
import { fetchAccounts } from "../lib/accounts";
import { importTransactionsCsv } from "../lib/imports";
import {
  extractPdfText,
  parseCathayPdfText,
  parseCtbcPdfText,
  parseEsunBankPdfText,
  parseEsunLoanSection,
  type PdfTextExtractionSource,
  parseEsunPdfText,
  parseMegaPdfText,
  parseSinopacBankPdfText,
  parseSinopacPdfText,
  parseSinopacLoanSection,
  parseSinopacInsuranceSection,
  parseTaishinPdfText,
  type ParsedTransaction,
} from "../lib/pdf-parser";
import { fetchUserSettings } from "../lib/user-settings";
import { saveBankSnapshot } from "../lib/bank-snapshots";

type GmailSyncPanelProps = {
  session: Session | null;
  onImported: () => void;
};

type SyncState =
  | { status: "idle" }
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

const GMAIL_ENABLED_BANKS = ["sinopac", "esun", "cathay", "taishin", "ctbc", "mega"] as const satisfies BankKey[];

const BANK_DISPLAY_NAMES: Record<BankKey, string> = {
  sinopac: "永豐",
  esun: "玉山",
  cathay: "國泰",
  taishin: "台新",
  ctbc: "中信",
  mega: "兆豐",
};

const BANK_NAME_KEYWORDS: Record<BankKey, string[]> = {
  sinopac: ["永豐", "sinopac"],
  esun: ["玉山", "esun"],
  cathay: ["國泰", "cathay"],
  taishin: ["台新", "taishin"],
  ctbc: ["中信", "ctbc"],
  mega: ["兆豐", "mega", "megabank"],
};

const BANK_PARSERS: Record<BankKey, (text: string) => ParsedTransaction[]> = {
  sinopac: parseSinopacPdfText,
  esun: parseEsunPdfText,
  cathay: parseCathayPdfText,
  taishin: parseTaishinPdfText,
  ctbc: parseCtbcPdfText,
  mega: parseMegaPdfText,
};

const BANK_STATEMENT_PARSERS: Record<BankKey, (text: string) => ParsedTransaction[]> = {
  sinopac: parseSinopacBankPdfText,
  esun: parseEsunBankPdfText,
  cathay: parseSinopacBankPdfText,
  taishin: parseSinopacBankPdfText,
  ctbc: parseSinopacBankPdfText,
  mega: parseSinopacBankPdfText,
};

const LOAN_SECTION_PARSERS: Partial<Record<BankKey, (text: string) => ReturnType<typeof parseSinopacLoanSection>>> = {
  sinopac: parseSinopacLoanSection,
  esun: parseEsunLoanSection,
};

function resolveImportAccountId(
  bank: BankKey,
  accounts: AccountRecord[],
  currency?: string,
  subAccount?: string,
) {
  const keywords = BANK_NAME_KEYWORDS[bank];

  const bankMatches = accounts.filter((account) =>
    keywords.some((kw) => account.name.toLowerCase().includes(kw.toLowerCase())),
  );

  // 若有子帳號末碼，優先找名稱含該末碼的帳戶
  if (subAccount) {
    const subMatch = bankMatches.find((account) => account.name.includes(subAccount));
    if (subMatch) return subMatch.id;
  }

  // 依貨幣匹配
  if (currency && currency !== "TWD") {
    const currencyHints: Record<string, string[]> = {
      USD: ["美元", "美金", "usd"],
      JPY: ["日幣", "日圓", "jpy"],
      EUR: ["歐元", "eur"],
    };
    const hints = currencyHints[currency] ?? [currency.toLowerCase()];
    const currencyMatch = bankMatches.find((account) =>
      hints.some((h) => account.name.toLowerCase().includes(h)),
    );
    if (currencyMatch) return currencyMatch.id;
  }

  // 退而求其次：同銀行第一個帳戶，或任意帳戶
  return bankMatches[0]?.id ?? accounts[0]?.id ?? "";
}

function extractPreviewLines(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const candidateLines = lines.filter((line) =>
    /\d{2,4}\/\d{1,2}/.test(line) || /\b\d{4}\b/.test(line),
  );

  return (candidateLines.length > 0 ? candidateLines : lines).slice(0, 6);
}

function looksLikeMissingTransactionText(bank: BankKey, lines: string[]) {
  if (bank !== "ctbc") {
    return false;
  }

  const joined = lines.join(" ");
  const hasTransactionHeader =
    joined.includes("消費日") ||
    joined.includes("入帳起息日") ||
    joined.includes("卡號末四碼") ||
    joined.includes("消費暨收費摘要表");
  const hasCoverSummaryToken =
    /0800-024365|0800-899-399|\bi APP\b|\b7\.7\b|300,000/.test(joined);
  const transactionLikeLineCount = lines.filter((line) => {
    const hasDate = /\d{2,4}\/\d{1,2}(?:\/\d{1,2})?/.test(line);
    const hasAmount = /-?\d[\d,]*(?:\.\d+)?/.test(line);
    const hasDescription = /[A-Za-z]{3,}|[\u4e00-\u9fff]{2,}/.test(line);

    return hasDate && hasAmount && hasDescription;
  }).length;

  return hasCoverSummaryToken || (!hasTransactionHeader && transactionLikeLineCount === 0);
}

function buildParseFailureMessage(bank: BankKey, text: string) {
  const previewLines = extractPreviewLines(text);
  const preview = previewLines.join(" | ").slice(0, 280);

  if (looksLikeMissingTransactionText(bank, previewLines)) {
    return `${BANK_DISPLAY_NAMES[bank]} PDF 已讀取，但目前只抽到首頁摘要或客服資訊，沒有抓到可用的交易文字層。這不是單純密碼錯誤，現有文字 parser 無法直接匯入這份 PDF。前幾行內容：${preview || "（空白）"}`;
  }

  return `${BANK_DISPLAY_NAMES[bank]} PDF 已讀取，但目前 parser 沒抓到交易。前幾行內容：${preview || "（空白）"}`;
}

function buildOcrDebugSuffix(
  candidates?: Array<{ page: number; preview: string; score: number; tag: string }>,
) {
  if (!candidates || candidates.length === 0) {
    return "";
  }

  const top = candidates
    .slice(0, 2)
    .map((candidate) => `p${candidate.page}/${candidate.tag}: ${candidate.preview || "（空白）"}`)
    .join(" | ");

  return top ? ` OCR 候選：${top}` : "";
}

function buildEmptyExtractionMessage(
  bank: BankKey,
  source: PdfTextExtractionSource,
  attemptedOcr: boolean,
) {
  if (attemptedOcr || source === "ocr_fallback") {
    return `${BANK_DISPLAY_NAMES[bank]} PDF 已改用 OCR 辨識，但仍沒有讀到可用文字。這份帳單很可能是影像品質不足、掃描對比太低，或 OCR 尚無法穩定辨識這個版型。`;
  }

  return `${BANK_DISPLAY_NAMES[bank]} PDF 沒有可用文字層，系統也還沒有成功辨識出 OCR 文字。`;
}

function resolveStatementDate(text: string, emailDateHeader: string) {
  const statementDateMatch = text.match(/對帳單期間[：:]\s*(\d{4})\/(\d{2})\/\d{2}/);
  if (statementDateMatch) {
    return `${statementDateMatch[1]}-${statementDateMatch[2]}-01`;
  }

  const parsedHeaderDate = emailDateHeader ? new Date(emailDateHeader) : null;
  if (parsedHeaderDate && !Number.isNaN(parsedHeaderDate.getTime())) {
    const year = parsedHeaderDate.getFullYear();
    const month = String(parsedHeaderDate.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}-01`;
  }

  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function buildEsunLoanDebugSuffix(
  bank: BankKey,
  loanRecordsCount: number,
  text: string,
  isBankStatement: boolean,
  saveError?: string | null,
  candidates?: Array<{ page: number; preview: string; score: number; tag: string }>,
) {
  if (bank !== "esun") {
    return "";
  }

  if (loanRecordsCount > 0) {
    return ` 玉山貸款偵測：parser=${loanRecordsCount} 筆${saveError ? `；snapshot寫入失敗=${saveError}` : "；snapshot寫入成功"}`;
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const rawHints = lines.filter((line) =>
    /貸款|保險|資料日期|\*{3}|個人擔保貸款|保單|被保險人/.test(line),
  );
  const rawPreview = rawHints.slice(0, 3).join(" | ").slice(0, 220);

  const assetCandidates = (candidates ?? []).filter((candidate) =>
    candidate.tag.includes("asset_probe") ||
    /貸款|保險|個人擔保貸款|\*{3}/.test(candidate.preview),
  );
  if (assetCandidates.length === 0) {
    return ` 玉山貸款偵測：0 筆。bankStatement=${isBankStatement ? "yes" : "no"}；原文線索=${rawPreview || "無"}；OCR線索=無。`;
  }

  const preview = assetCandidates
    .slice(0, 2)
    .map((candidate) => `p${candidate.page}: ${candidate.preview || "（空白）"}`)
    .join(" | ")
    .slice(0, 280);

  return ` 玉山貸款偵測：0 筆。bankStatement=${isBankStatement ? "yes" : "no"}；原文線索=${rawPreview || "無"}；OCR線索=${preview}`;
}

export function GmailSyncPanel({ session, onImported }: GmailSyncPanelProps) {
  const [state, setState] = useState<SyncState>({ status: "idle" });
  const [emails, setEmails] = useState<GmailBillEmail[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);

  async function handleConnect() {
    setState({ status: "loading", message: "載入帳戶中..." });

    const accountsResult = await fetchAccounts();
    if (accountsResult.status === "error") {
      setState({ status: "error", message: accountsResult.error });
      return;
    }

    setAccounts(accountsResult.items);
    setState({ status: "loading", message: "搜尋 Gmail 帳單中..." });

    const accessToken = session?.provider_token;
    if (!accessToken) {
      setState({ status: "error", message: "目前沒有 Gmail 授權，請重新登入後再試。" });
      return;
    }

    const results = await Promise.all(
      GMAIL_ENABLED_BANKS.map(async (bank) => {
        try {
          return {
            bank,
            emails: await fetchBillEmails(accessToken, bank),
            error: null,
          };
        } catch (error) {
          return {
            bank,
            emails: [] as GmailBillEmail[],
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      }),
    );

    const loadedEmails = results.flatMap((result) => result.emails);
    const failedBanks = results
      .filter((result) => result.error)
      .map((result) => result.bank);

    setEmails(loadedEmails);

    if (loadedEmails.length === 0 && failedBanks.length > 0) {
      setState({
        status: "error",
        message: `Gmail 帳單載入逾時或失敗：${failedBanks.map((bank) => BANK_DISPLAY_NAMES[bank]).join("、")}`,
      });
      return;
    }

    if (failedBanks.length > 0) {
      setState({
        status: "done",
        message: `已載入 ${loadedEmails.length} 封帳單，但部分銀行逾時：${failedBanks.map((bank) => BANK_DISPLAY_NAMES[bank]).join("、")}`,
      });
      return;
    }

    setState({ status: "idle" });
  }

  async function handleSync(email: GmailBillEmail) {
    const accessToken = session?.provider_token;
    if (!accessToken) {
      setState({ status: "error", message: "目前沒有 Gmail 授權，請重新登入後再試。" });
      return;
    }

    const isBankStatement =
      email.subject.includes("綜合對帳單") ||
      email.subject.includes("存款對帳單") ||
      email.attachments.some(
        (a) => a.filename.includes("綜合對帳單") || a.filename.toLowerCase().includes("statement"),
      );

    // Always fetch accounts fresh
    const accountsResult = await fetchAccounts();
    if (accountsResult.status === "error") {
      setState({ status: "error", message: accountsResult.error });
      return;
    }
    const freshAccounts = accountsResult.items;
    setAccounts(freshAccounts);

    setState({ status: "loading", message: `下載 ${email.subject} 中...` });

    try {
      const settings = await fetchUserSettings();
      const defaultPw = settings.default_pdf_password ?? "";
      const password =
        email.bank === "sinopac"
          ? (settings.sinopac_pdf_password ?? defaultPw)
          : email.bank === "esun"
            ? (settings.esun_pdf_password ?? defaultPw)
            : email.bank === "taishin"
              ? (settings.taishin_pdf_password ?? defaultPw)
              : defaultPw;

      if (!password.trim()) {
        setState({
          status: "error",
          message:
            email.bank === "taishin"
              ? "尚未讀到台新 PDF 密碼。請先在設定頁儲存台新密碼；如果剛新增欄位卻存不進去，代表資料庫 schema 還沒套用。"
              : "尚未讀到 PDF 密碼。請先在設定頁儲存對應銀行密碼。",
        });
        return;
      }

      const pdfAttachment = email.attachments.find(
        (attachment) =>
          attachment.mimeType === "application/pdf" || attachment.filename.endsWith(".pdf"),
      );

      if (!pdfAttachment) {
        setState({ status: "error", message: "這封信找不到 PDF 附件。" });
        return;
      }

      setState({ status: "loading", message: "讀取 PDF 中..." });
      const bytes = await downloadAttachment(email.id, pdfAttachment.id, accessToken);
      const extraction = await extractPdfText(bytes, password, email.bank);
      const text = extraction.text;

      if (extraction.source === "ocr_fallback") {
        setState({ status: "loading", message: "PDF 無文字層，改用 OCR 辨識中..." });
      }

      if (!text.trim()) {
        setState({
          status: "error",
          message:
            buildEmptyExtractionMessage(email.bank, extraction.source, extraction.attemptedOcr) +
            buildOcrDebugSuffix(extraction.debug?.ocrCandidates),
        });
        return;
      }

      const statementDate = resolveStatementDate(text, email.date);
      const loanRecords = LOAN_SECTION_PARSERS[email.bank]?.(text) ?? [];
      const insuranceRecords = email.bank === "sinopac" ? parseSinopacInsuranceSection(text) : [];
      let loanSaveError: string | null = null;

      const parsed = isBankStatement
        ? BANK_STATEMENT_PARSERS[email.bank](text)
        : BANK_PARSERS[email.bank](text);

      if (parsed.length === 0 && loanRecords.length === 0 && insuranceRecords.length === 0) {
        setState({
          status: "error",
          message:
            buildParseFailureMessage(email.bank, text) +
            (extraction.attemptedOcr
              ? buildOcrDebugSuffix(extraction.debug?.ocrCandidates)
              : ""),
        });
        return;
      }

      if (isBankStatement) {
        // Group by (currency, subAccount) — each distinct sub-account gets its own import
        const bySection = new Map<string, typeof parsed>();
        for (const tx of parsed) {
          const key = `${tx.currency ?? "TWD"}__${tx.subAccount ?? ""}`;
          if (!bySection.has(key)) bySection.set(key, []);
          bySection.get(key)!.push(tx);
        }

        let totalImported = 0;
        let totalSkipped = 0;
        const warnings: string[] = [];

        for (const txList of bySection.values()) {
          const currency = txList[0].currency ?? "TWD";
          const subAccount = txList[0].subAccount;
          const targetAccountId = resolveImportAccountId(email.bank, freshAccounts, currency, subAccount);
          if (!targetAccountId) {
            warnings.push(`找不到 ${currency}${subAccount ? `(..${subAccount})` : ""} 帳戶，略過 ${txList.length} 筆`);
            continue;
          }

          const label = `${currency}${subAccount ? `(..${subAccount})` : ""}`;
          setState({ status: "loading", message: `匯入 ${label} 共 ${txList.length} 筆...` });

          const csvLines = [
            "date,amount,currency,category,description",
            ...txList.map(
              (tx) => `${tx.date},${tx.amount},${tx.currency},,${tx.description.replace(/,/g, " ")}`,
            ),
          ].join("\n");

          const csvFile = new File([csvLines], `gmail-bank-${currency}.csv`, { type: "text/csv" });
          const result = await importTransactionsCsv(
            targetAccountId,
            csvFile,
            `gmail_bank_${email.bank}` as Parameters<typeof importTransactionsCsv>[2],
          );

          if (result.status === "error") {
            setState({ status: "error", message: result.error });
            return;
          }

          totalImported += result.imported;
          totalSkipped += result.skipped;
        }

        const warnStr = warnings.length > 0 ? `（${warnings.join("；")}）` : "";
        let savedLoanCount = 0;
        let savedInsuranceCount = 0;
        try {
          if (loanRecords.length > 0) {
            await saveBankSnapshot(email.bank, 'loan', statementDate, loanRecords);
            savedLoanCount = loanRecords.length;
          }
        } catch (error) {
          loanSaveError = error instanceof Error ? error.message : "unknown";
        }

        try {
          if (insuranceRecords.length > 0) {
            await saveBankSnapshot(email.bank, 'insurance', statementDate, insuranceRecords);
            savedInsuranceCount = insuranceRecords.length;
          }
        } catch {
          // non-fatal: skip insurance snapshot
        }

        const snapshotParts: string[] = [];
        if (savedLoanCount > 0) snapshotParts.push(`貸款快照 ${savedLoanCount} 筆`);
        if (savedInsuranceCount > 0) snapshotParts.push(`保險快照 ${savedInsuranceCount} 筆`);
        const snapshotSummary = snapshotParts.length > 0 ? ` 並更新${snapshotParts.join("、")}。` : "";
        const esunLoanDebug = buildEsunLoanDebugSuffix(
          email.bank,
          loanRecords.length,
          text,
          isBankStatement,
          loanSaveError,
          extraction.debug?.ocrCandidates,
        );

        setState({
          status: "done",
          message: `${BANK_DISPLAY_NAMES[email.bank]}｜${email.subject}｜匯入完成，新增 ${totalImported} 筆，略過 ${totalSkipped} 筆。${warnStr}${snapshotSummary}${esunLoanDebug}`,
        });
      } else {
        if (loanRecords.length > 0) {
          try {
            await saveBankSnapshot(email.bank, "loan", statementDate, loanRecords);
          } catch (error) {
            loanSaveError = error instanceof Error ? error.message : "unknown";
          }
        }

        if (insuranceRecords.length > 0) {
          try {
            await saveBankSnapshot(email.bank, "insurance", statementDate, insuranceRecords);
          } catch {
            // non-fatal: keep transaction import path working
          }
        }

        // Credit card: single account import
        if (parsed.length === 0) {
          const snapshotParts: string[] = [];
          if (loanRecords.length > 0) snapshotParts.push(`貸款快照 ${loanRecords.length} 筆`);
          if (insuranceRecords.length > 0) snapshotParts.push(`保險快照 ${insuranceRecords.length} 筆`);

          setState({
            status: "done",
            message: `${BANK_DISPLAY_NAMES[email.bank]}｜${email.subject}｜這封帳單沒有匯入交易，但已更新${snapshotParts.join("、")}。`,
          });
          onImported();
          return;
        }

        const accountId = resolveImportAccountId(email.bank, freshAccounts);
        if (!accountId) {
          setState({ status: "error", message: "找不到對應帳戶。" });
          return;
        }

        setState({ status: "loading", message: `準備匯入 ${parsed.length} 筆交易...` });

        const csvLines = [
          "date,amount,currency,category,description",
          ...parsed.map(
            (tx) => `${tx.date},${tx.amount},${tx.currency},,${tx.description.replace(/,/g, " ")}`,
          ),
        ].join("\n");

        const csvFile = new File([csvLines], "gmail-import.csv", { type: "text/csv" });
        const result = await importTransactionsCsv(
          accountId,
          csvFile,
          `gmail_pdf_${email.bank}` as Parameters<typeof importTransactionsCsv>[2],
        );

        if (result.status === "error") {
          setState({ status: "error", message: result.error });
          return;
        }

        setState({
          status: "done",
          message: `${BANK_DISPLAY_NAMES[email.bank]}｜${email.subject}｜匯入完成，新增 ${result.imported} 筆，略過 ${result.skipped} 筆。${
            loanRecords.length > 0 ? ` 並更新貸款快照 ${loanRecords.length} 筆。` : ""
          }${
            insuranceRecords.length > 0 ? ` 並更新保險快照 ${insuranceRecords.length} 筆。` : ""
          }${buildEsunLoanDebugSuffix(email.bank, loanRecords.length, text, isBankStatement, loanSaveError, extraction.debug?.ocrCandidates)}`,
        });
      }

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
      <p>自動抓取永豐、玉山、國泰、台新、中信、兆豐帳單（信用卡＋綜合對帳單），匯入後以銀行標籤區分，不需要逐封指定帳戶。</p>

      <button
        className="action-button"
        onClick={() => void handleConnect()}
        disabled={state.status === "loading"}
        type="button"
      >
        {state.status === "loading" ? "載入中..." : "搜尋 Gmail 帳單"}
      </button>

      {state.status === "loading" && <p>{state.message}</p>}
      {state.status === "error" && <p>錯誤：{state.message}</p>}
      {state.status === "done" && <p>{state.message}</p>}

      {emails.length > 0 && (
        <>
          <p>找到 {emails.length} 封帳單。</p>
          <ul className="gmail-email-list">
            {emails.map((email) => (
              <li key={email.id} className="gmail-email-item">
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                  <span>{BANK_DISPLAY_NAMES[email.bank]} - {email.subject}</span>
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
