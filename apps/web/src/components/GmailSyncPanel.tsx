import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountRecord, ParsedPdfTransaction } from "@hearth/shared";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  downloadAttachment,
  fetchBillEmails,
  type BankKey,
  type GmailBillEmail,
} from "../lib/gmail";
import { fetchAccounts } from "../lib/accounts";
import { importTransactionsCsv } from "../lib/imports";
import type { PdfTextExtractionSource } from "../lib/pdf-parser";
import { fetchUserSettingsSecrets } from "../lib/user-settings";
import { saveBankSnapshot } from "../lib/bank-snapshots";
import { getSupabaseBrowserClient } from "../lib/supabase";
import {
  fetchImportJobs,
  updateImportJob,
  fetchBankAccountMappings,
  type ImportJobRecord,
  type BankAccountMappingRecord,
} from "../lib/import-jobs";

type GmailSyncPanelProps = {
  session: Session | null;
  onImported: () => void;
  refreshKey?: number;
  background?: boolean;
};

type SyncState =
  | { status: "idle" }
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

type QueueItem = ImportJobRecord;

const GMAIL_ENABLED_BANKS = ["sinopac", "esun", "cathay", "taishin", "ctbc", "mega"] as const satisfies BankKey[];

const JOB_STATUS_PRIORITY: Record<string, number> = {
  imported: 6,
  parsed: 5,
  pending_parse: 4,
  needs_review: 3,
  failed: 2,
  auth_required: 1,
};

function buildJobStatusMap(jobs: ImportJobRecord[]) {
  const map = new Map<string, ImportJobRecord>();
  for (const job of jobs) {
    const existing = map.get(job.gmail_message_id);
    if (!existing || (JOB_STATUS_PRIORITY[job.status] ?? 0) > (JOB_STATUS_PRIORITY[existing.status] ?? 0)) {
      map.set(job.gmail_message_id, job);
    }
  }
  return map;
}

function getJobStatusView(status?: ImportJobRecord["status"]): {
  label: string;
  variant: "default" | "success" | "warning" | "error" | "info";
  buttonLabel: string;
} {
  switch (status) {
    case "imported":
      return { label: "已匯入", variant: "success", buttonLabel: "重新匯入" };
    case "parsed":
      return { label: "已解析", variant: "info", buttonLabel: "匯入" };
    case "pending_parse":
      return { label: "待解析", variant: "info", buttonLabel: "匯入" };
    case "needs_review":
      return { label: "需設定帳戶", variant: "warning", buttonLabel: "匯入" };
    case "failed":
      return { label: "解析失敗", variant: "error", buttonLabel: "重試" };
    case "auth_required":
      return { label: "需重新授權", variant: "warning", buttonLabel: "匯入" };
    default:
      return { label: "未處理", variant: "default", buttonLabel: "匯入" };
  }
}

function getSearchResultStatusView(status?: ImportJobRecord["status"]): {
  label: string;
  variant: "default" | "success" | "warning" | "error" | "info";
  buttonLabel: string;
} {
  if (status) return getJobStatusView(status);
  return { label: "本次找到", variant: "info", buttonLabel: "匯入" };
}

const BANK_DISPLAY_NAMES: Record<BankKey, string> = {
  sinopac: "永豐",
  esun: "玉山",
  cathay: "國泰",
  taishin: "台新",
  ctbc: "中信",
  mega: "兆豐",
};

const REVIEW_REASON_LABELS: Record<string, string> = {
  missing_mapping: "尚未設定帳戶對應",
  parse_error: "帳單解析失敗，需人工確認",
  unknown_bank: "無法辨識銀行來源",
  account_mapping_invalid: "帳戶對應已失效，請重新設定",
};

const BANK_NAME_KEYWORDS: Record<BankKey, string[]> = {
  sinopac: ["永豐", "sinopac"],
  esun: ["玉山", "esun"],
  cathay: ["國泰", "cathay"],
  taishin: ["台新", "taishin"],
  ctbc: ["中信", "ctbc"],
  mega: ["兆豐", "mega", "megabank"],
};

type ParsedTransaction = ParsedPdfTransaction;
type PdfParserModule = typeof import("../lib/pdf-parser");

async function loadPdfParser() {
  return import("../lib/pdf-parser");
}

async function extractPdfTextWithOptionalBlankFallback(
  pdfParser: PdfParserModule,
  bytes: Uint8Array,
  password: string,
  bank: BankKey,
  options?: { probeEsunAssets?: boolean },
) {
  const cloneBytes = () => new Uint8Array(bytes);

  try {
    return await pdfParser.extractPdfText(cloneBytes(), password, bank, options);
  } catch (error) {
    if (!password.trim()) {
      throw error;
    }

    // Some statements are unencrypted. Retry with blank password if passworded open fails.
    return pdfParser.extractPdfText(cloneBytes(), "", bank, options);
  }
}

function parseCreditCardTransactions(
  pdfParser: PdfParserModule,
  bank: BankKey,
  text: string,
): ParsedTransaction[] {
  const parsers: Record<BankKey, (input: string) => ParsedTransaction[]> = {
    sinopac: pdfParser.parseSinopacPdfText,
    esun: pdfParser.parseEsunPdfText,
    cathay: pdfParser.parseCathayPdfText,
    taishin: pdfParser.parseTaishinPdfText,
    ctbc: pdfParser.parseCtbcPdfText,
    mega: pdfParser.parseMegaPdfText,
  };

  return parsers[bank](text);
}

function parseBankStatementTransactions(
  pdfParser: PdfParserModule,
  bank: BankKey,
  text: string,
): ParsedTransaction[] {
  const parsers: Record<BankKey, (input: string) => ParsedTransaction[]> = {
    sinopac: pdfParser.parseSinopacBankPdfText,
    esun: pdfParser.parseEsunBankPdfText,
    cathay: pdfParser.parseSinopacBankPdfText,
    taishin: pdfParser.parseSinopacBankPdfText,
    ctbc: pdfParser.parseSinopacBankPdfText,
    mega: pdfParser.parseSinopacBankPdfText,
  };

  return parsers[bank](text);
}

function parseLoanSection(
  pdfParser: PdfParserModule,
  bank: BankKey,
  text: string,
) {
  const parsers = {
    sinopac: pdfParser.parseSinopacLoanSection,
    esun: pdfParser.parseEsunLoanSection,
  } as const;

  if (bank !== "sinopac" && bank !== "esun") {
    return [];
  }

  return parsers[bank](text);
}

function parseInsuranceSection(
  pdfParser: PdfParserModule,
  bank: BankKey,
  text: string,
) {
  return bank === "sinopac" ? pdfParser.parseSinopacInsuranceSection(text) : [];
}

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

// 已驗證格式的銀行帳戶（活存）對帳單
const VERIFIED_BANK_STATEMENT_PARSERS: BankKey[] = ["sinopac", "esun"];

function buildParseFailureMessage(bank: BankKey, text: string, isBankStatement = false) {
  const previewLines = extractPreviewLines(text);
  const preview = previewLines.join(" | ").slice(0, 280);

  if (isBankStatement && !VERIFIED_BANK_STATEMENT_PARSERS.includes(bank)) {
    return `${BANK_DISPLAY_NAMES[bank]} 銀行帳戶對帳單格式尚未驗證（目前只確認永豐、玉山格式相容）。若有 PDF 樣本請提供以新增支援。前幾行內容：${preview || "（空白）"}`;
  }

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

export function GmailSyncPanel({ session, onImported, refreshKey, background = false }: GmailSyncPanelProps) {
  const [state, setState] = useState<SyncState>({ status: "idle" });
  const [emails, setEmails] = useState<GmailBillEmail[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [pendingQueue, setPendingQueue] = useState<QueueItem[]>([]);
  const [needsReviewQueue, setNeedsReviewQueue] = useState<QueueItem[]>([]);
  const [failedQueue, setFailedQueue] = useState<QueueItem[]>([]);
  const [allJobs, setAllJobs] = useState<ImportJobRecord[]>([]);
  const [queueRunning, setQueueRunning] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [jobsByMsgId, setJobsByMsgId] = useState<Map<string, ImportJobRecord>>(new Map());
  const autoProcessFired = useRef(false);

  const loadQueues = useCallback(async () => {
    const [pending, review, failed, all] = await Promise.all([
      fetchImportJobs("pending_parse"),
      fetchImportJobs("needs_review"),
      fetchImportJobs("failed"),
      fetchImportJobs(),
    ]);

    if (pending.status === "ok") setPendingQueue(pending.items);
    if (review.status === "ok") setNeedsReviewQueue(review.items);
    if (failed.status === "ok") setFailedQueue(failed.items);
    if (all.status === "ok") {
      setAllJobs(all.items);
      setJobsByMsgId(buildJobStatusMap(all.items));
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setPendingQueue([]);
      setNeedsReviewQueue([]);
      setFailedQueue([]);
      setAllJobs([]);
      setJobsByMsgId(new Map());
      autoProcessFired.current = false;
      return;
    }

    void loadQueues();
  }, [session, refreshKey, loadQueues]);

  // Reset auto-process guard on re-login so pending jobs are processed again with new token
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        autoProcessFired.current = false;
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Auto-process pending_parse jobs when provider_token is available
  useEffect(() => {
    if (!session?.provider_token || pendingQueue.length === 0 || autoProcessFired.current) return;
    autoProcessFired.current = true;
    void handleProcessQueue();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.provider_token, pendingQueue.length]);

  async function handleProcessQueue() {
    const accessToken = session?.provider_token;
    if (!accessToken) {
      // Token 過期，不是 parser 失敗，保留 pending_parse 讓使用者重新登入後再觸發
      setState({
        status: "error",
        message: `有 ${pendingQueue.length} 封帳單待匯入，但 Gmail 授權已過期，請重新登入後會自動繼續。`,
      });
      setQueueRunning(false);
      return;
    }
    setQueueRunning(true);
    let importedTotal = 0;
    let skippedTotal = 0;

    const pdfParser = await loadPdfParser();
    const settings = await fetchUserSettingsSecrets();

    // Resolve bank_account_mapping fresh — never rely on stored mapped_account_id
    const mappingsRes = await fetchBankAccountMappings();
    const freshMappingIndex: Record<string, string> = {};
    if (mappingsRes.status === "ok") {
      for (const m of mappingsRes.items as BankAccountMappingRecord[]) {
        if (m.enabled) {
          freshMappingIndex[`${m.bank_key}:${m.source_type}`] = m.account_id;
        }
      }
    }

    for (const item of pendingQueue) {
      const bank = item.bank_key as BankKey;
      const isBankStatement = item.source_type === "bank_account";
      setState({ status: "loading", message: `處理 ${BANK_DISPLAY_NAMES[bank] ?? bank}｜${item.email_subject}...` });

      // Re-resolve account from fresh mapping — never trust stored mapped_account_id
      const resolvedAccountId = freshMappingIndex[`${bank}:${item.source_type}`] ?? null;
      if (!resolvedAccountId) {
        await updateImportJob(item.id, {
          status: "needs_review",
          review_reason: "missing_mapping",
          error_code: "no_account_mapping",
        });
        continue;
      }

      try {
        const defaultPw = settings.default_pdf_password ?? "";
        const password =
          bank === "sinopac" ? (settings.sinopac_pdf_password ?? defaultPw)
          : bank === "esun" ? (settings.esun_pdf_password ?? defaultPw)
          : bank === "taishin" ? (settings.taishin_pdf_password ?? defaultPw)
          : defaultPw;

        const bytes = await downloadAttachment(item.gmail_message_id, item.attachment_id, accessToken);
        const extraction = await extractPdfTextWithOptionalBlankFallback(
          pdfParser,
          bytes,
          password,
          bank,
          { probeEsunAssets: isBankStatement },
        );
        const text = extraction.text;

        if (!text.trim()) {
          await updateImportJob(item.id, {
            status: "failed",
            review_reason: "parse_error",
            error_code: "empty_text",
            error_message: "PDF 無可用文字",
          });
          continue;
        }

        const parsed = isBankStatement
          ? parseBankStatementTransactions(pdfParser, bank, text)
          : parseCreditCardTransactions(pdfParser, bank, text);

        if (parsed.length === 0) {
          await updateImportJob(item.id, {
            status: "failed",
            review_reason: "parse_error",
            error_code: "no_transactions",
            error_message: "解析後無交易資料",
          });
          continue;
        }

        let jobImported = 0;
        let jobSkipped = 0;

        if (isBankStatement) {
          const csvLines = [
            "date,amount,currency,category,description",
            ...parsed.map((tx) => `${tx.date},${tx.amount},${tx.currency ?? "TWD"},,${tx.description.replace(/,/g, " ")}`),
          ].join("\n");
          const result = await importTransactionsCsv(
            resolvedAccountId,
            new File([csvLines], `queue-bank.csv`, { type: "text/csv" }),
            `gmail_bank_${bank}` as Parameters<typeof importTransactionsCsv>[2],
          );
          if (result.status === "ok") { jobImported = result.imported; jobSkipped = result.skipped; }
        } else {
          const emailSendDate = item.email_date ? new Date(item.email_date) : new Date();
          const billingMonth = `${emailSendDate.getFullYear()}-${String(emailSendDate.getMonth() + 1).padStart(2, "0")}-01`;
          const billedParsed = parsed.map((tx) => ({ ...tx, date: billingMonth }));
          const csvLines = [
            "date,amount,currency,category,description",
            ...billedParsed.map((tx) => `${tx.date},${tx.amount},${tx.currency ?? "TWD"},,${tx.description.replace(/,/g, " ")}`),
          ].join("\n");
          const result = await importTransactionsCsv(
            resolvedAccountId,
            new File([csvLines], "queue-import.csv", { type: "text/csv" }),
            `gmail_pdf_${bank}` as Parameters<typeof importTransactionsCsv>[2],
          );
          if (result.status === "ok") { jobImported = result.imported; jobSkipped = result.skipped; }
        }

        await updateImportJob(item.id, { status: "imported", imported_count: jobImported, skipped_count: jobSkipped });
        importedTotal += jobImported;
        skippedTotal += jobSkipped;
      } catch (err) {
        await updateImportJob(item.id, {
          status: "failed",
          review_reason: "parse_error",
          error_code: "parse_error",
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    setPendingQueue([]);
    setQueueRunning(false);
    setState({ status: "done", message: `佇列處理完成，新增 ${importedTotal} 筆，略過 ${skippedTotal} 筆。` });
    await loadQueues();
    onImported();
  }

  async function handleRetry(item: QueueItem) {
    setRetryingJobId(item.id);
    try {
      await updateImportJob(item.id, {
        status: "pending_parse",
        error_code: null,
        error_message: null,
        review_reason: null,
      });
      setFailedQueue((prev) => prev.filter((j) => j.id !== item.id));
      setNeedsReviewQueue((prev) => prev.filter((j) => j.id !== item.id));
      setPendingQueue((prev) => [
        { ...item, status: "pending_parse", error_code: null, error_message: null, review_reason: null },
        ...prev,
      ]);
      autoProcessFired.current = false;
    } catch {
      setState({ status: "error", message: `重試失敗：${item.email_subject}` });
    } finally {
      setRetryingJobId(null);
    }
  }

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

    // Load all import_jobs to show per-email status flags
    void fetchImportJobs().then((res) => {
      if (res.status === "ok") {
        setAllJobs(res.items);
        setJobsByMsgId(buildJobStatusMap(res.items));
      }
    });

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
      const pdfParser = await loadPdfParser();
      const settings = await fetchUserSettingsSecrets();
      const defaultPw = settings.default_pdf_password ?? "";
      const password =
        email.bank === "sinopac"
          ? (settings.sinopac_pdf_password ?? defaultPw)
          : email.bank === "esun"
            ? (settings.esun_pdf_password ?? defaultPw)
            : email.bank === "taishin"
              ? (settings.taishin_pdf_password ?? defaultPw)
              : defaultPw;

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
      const extraction = await extractPdfTextWithOptionalBlankFallback(
        pdfParser,
        bytes,
        password,
        email.bank,
        { probeEsunAssets: isBankStatement },
      );
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
      const loanRecords = parseLoanSection(pdfParser, email.bank, text);
      const insuranceRecords = parseInsuranceSection(pdfParser, email.bank, text);
      let loanSaveError: string | null = null;

      const parsed = isBankStatement
        ? parseBankStatementTransactions(pdfParser, email.bank, text)
        : parseCreditCardTransactions(pdfParser, email.bank, text);

      if (parsed.length === 0 && loanRecords.length === 0 && insuranceRecords.length === 0) {
        setState({
          status: "error",
          message:
            buildParseFailureMessage(email.bank, text, isBankStatement) +
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

        // Override posted dates → billing month (email 寄出月 = 繳款月)
        const emailSendDate = email.date ? new Date(email.date) : new Date();
        const billingMonth = `${emailSendDate.getFullYear()}-${String(emailSendDate.getMonth() + 1).padStart(2, "0")}-01`;
        const billedParsed = parsed.map((tx) => ({ ...tx, date: billingMonth }));

        setState({ status: "loading", message: `準備匯入 ${billedParsed.length} 筆交易...` });

        const csvLines = [
          "date,amount,currency,category,description",
          ...billedParsed.map(
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

  if (!session || background) return null;

  return (
    <article className="panel gmail-sync-panel">
      <h2>Gmail 帳單同步</h2>
      <p className="panel-copy">
        自動抓取永豐、玉山、國泰、台新、中信、兆豐帳單（信用卡＋綜合對帳單），匯入後以銀行標籤區分，不需要逐封指定帳戶。
      </p>

      {(pendingQueue.length > 0 || queueRunning) && (
        <div className="queue-notice gmail-queue">
          <span className="queue-notice-count">
            {queueRunning
              ? "自動匯入進行中..."
              : <>伺服器偵測到 <strong>{pendingQueue.length}</strong> 封待處理帳單（已設定帳戶對應）</>
            }
          </span>
          {!queueRunning && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleProcessQueue()}
              disabled={state.status === "loading"}
              type="button"
            >
              立即匯入
            </Button>
          )}
        </div>
      )}

      {needsReviewQueue.length > 0 && (
        <div className="queue-notice gmail-queue queue-notice--review">
          <span className="queue-notice-count">
            <strong>{needsReviewQueue.length}</strong> 封帳單需要人工確認（詳見下方原因）
          </span>
          <ul className="gmail-review-list">
            {needsReviewQueue.map((item) => {
              const reasonLabel = item.review_reason
                ? (REVIEW_REASON_LABELS[item.review_reason] ?? item.review_reason)
                : "原因不明";
              const canRetry = item.review_reason === "parse_error";
              const needsMapping = item.review_reason === "missing_mapping";
              return (
                <li key={item.id} className="panel-copy panel-copy--tight gmail-review-item">
                  <div className="gmail-review-item-meta">
                    <span className="gmail-email-bank">
                      {BANK_DISPLAY_NAMES[item.bank_key as BankKey] ?? item.bank_key}
                    </span>
                    {" — "}
                    {item.email_subject}
                    <span className="gmail-review-reason"> [{reasonLabel}]</span>
                  </div>
                  {canRetry && (
                    <button
                      className="action-button"
                      type="button"
                      disabled={retryingJobId === item.id}
                      onClick={() => void handleRetry(item)}
                    >
                      {retryingJobId === item.id ? "重試中..." : "重試"}
                    </button>
                  )}
                  {needsMapping && (
                    <span className="panel-copy--tight gmail-review-hint">請先至設定頁配置帳戶對應</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {failedQueue.length > 0 && (
        <div className="queue-notice gmail-queue queue-notice--failed">
          <span className="queue-notice-count">
            <strong>{failedQueue.length}</strong> 封帳單匯入失敗
          </span>
          <ul className="gmail-review-list">
            {failedQueue.map((item) => {
              const warningNote =
                item.error_code === "empty_text" ? "（PDF 無文字層，重試後可能仍失敗）"
                : item.error_code === "no_transactions" ? "（重試後可能仍無資料）"
                : "";
              return (
                <li key={item.id} className="panel-copy panel-copy--tight gmail-review-item">
                  <div className="gmail-review-item-meta">
                    <span className="gmail-email-bank">
                      {BANK_DISPLAY_NAMES[item.bank_key as BankKey] ?? item.bank_key}
                    </span>
                    {" — "}
                    {item.email_subject}
                    {warningNote && (
                      <span className="gmail-review-reason"> {warningNote}</span>
                    )}
                  </div>
                  <button
                    className="action-button"
                    type="button"
                    disabled={retryingJobId === item.id}
                    onClick={() => void handleRetry(item)}
                  >
                    {retryingJobId === item.id ? "重試中..." : "重試"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="panel-action-row">
        <Button
          onClick={() => void handleConnect()}
          disabled={state.status === "loading"}
          loading={state.status === "loading"}
          type="button"
        >
          {state.status === "loading" ? "載入中..." : "搜尋 Gmail 帳單"}
        </Button>
      </div>

      {state.status === "loading" && <p className="panel-message panel-message--muted panel-status-message">{state.message}</p>}
      {state.status === "error" && <p className="panel-message panel-message--error panel-status-message">錯誤：{state.message}</p>}
      {state.status === "done" && <p className="panel-message panel-status-message panel-status-message--done">{state.message}</p>}

      {allJobs.length > 0 && (
        <div className="queue-notice gmail-queue">
          <span className="queue-notice-count">
            已偵測 / 已處理 <strong>{allJobs.length}</strong> 份 Gmail 帳單
            （顯示最新 {Math.min(allJobs.length, 20)} 筆）
          </span>
          <ul className="gmail-review-list">
            {allJobs.slice(0, 20).map((job) => {
              const view = getJobStatusView(job.status);
              const reasonLabel = job.review_reason
                ? (REVIEW_REASON_LABELS[job.review_reason] ?? job.review_reason)
                : null;
              return (
                <li key={job.id} className="panel-copy panel-copy--tight gmail-review-item">
                  <div className="gmail-review-item-meta">
                    <span className="gmail-email-bank">
                      {BANK_DISPLAY_NAMES[job.bank_key as BankKey] ?? job.bank_key}
                    </span>
                    {" - "}
                    {job.email_subject}
                    <Badge variant={view.variant}>{view.label}</Badge>
                    {reasonLabel && <span className="gmail-review-reason"> [{reasonLabel}]</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {emails.length > 0 && (
        <>
          <p className="panel-copy panel-copy--tight">找到 {emails.length} 封帳單。</p>
          <ul className="gmail-email-list">
            {emails.map((email) => {
              const hasPdf = email.attachments.some(
                (a) => a.mimeType === "application/pdf" || a.filename.endsWith(".pdf"),
              );
              const job = jobsByMsgId.get(email.id);
              const jobStatus = job?.status;
              const jobView = getSearchResultStatusView(jobStatus);
              return (
                <li key={email.id} className="gmail-email-item panel-row-item">
                  <div className="gmail-email-meta">
                    <span className="gmail-email-bank">{BANK_DISPLAY_NAMES[email.bank]}</span>
                    <span className="gmail-email-subject">{email.subject}</span>
                    <Badge variant={jobView.variant}>{jobView.label}</Badge>
                    {!hasPdf && (
                      <Badge variant="warning">通知信，無 PDF 附件</Badge>
                    )}
                  </div>
                  <div className="gmail-email-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleSync(email)}
                      disabled={state.status === "loading" || !hasPdf}
                      type="button"
                      title={!hasPdf ? "此信無 PDF 附件，無法匯入" : undefined}
                    >
                      {jobView.buttonLabel}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </article>
  );
}
