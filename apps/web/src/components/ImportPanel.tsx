import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountRecord, RecurringImportCandidate } from "@hearth/shared";
import { fetchAccounts } from "../lib/accounts";
import {
  importCreditCardTransactionsCsv,
  importDividendsCsv,
  importExcelMonthly,
  importForeignStockCsv,
  importSinopacStockCsv,
  importSinopacTransactionsCsv,
  importTransactionsCsv,
} from "../lib/imports";
import { createRecurringTemplatesFromCandidates } from "../lib/recurring";

type ImportPanelProps = {
  session: Session | null;
  onImported: () => void;
  onRecurringTemplatesCreated: () => void;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "success"; accounts: AccountRecord[] };

export function ImportPanel({
  session,
  onImported,
  onRecurringTemplatesCreated,
}: ImportPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<
    "normalized" | "sinopac-tw" | "credit-card-tw" | "excel-monthly" | "sinopac-stock" | "foreign-stock-csv" | "dividends-csv"
  >("normalized");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [latestRecurringCandidates, setLatestRecurringCandidates] = useState<RecurringImportCandidate[]>([]);
  const [isCreatingRecurring, setIsCreatingRecurring] = useState(false);

  useEffect(() => {
    if (!session) {
      setState({ status: "idle" });
      setSelectedAccountId("");
      setSelectedFile(null);
      setMessage(null);
      setLatestRecurringCandidates([]);
      return;
    }

    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      const result = await fetchAccounts();
      if (cancelled) {
        return;
      }

      if (result.status === "error") {
        setState({ status: "error", message: result.error });
        return;
      }

      setState({ status: "success", accounts: result.items });
      setSelectedAccountId((current) => current || result.items[0]?.id || "");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!selectedAccountId) {
      setMessage("請先選擇帳戶。");
      return;
    }

    if (!selectedFile) {
      setMessage(importMode === "excel-monthly" ? "請先選擇 Excel 檔案。" : "請先選擇 CSV 檔案。");
      return;
    }

    setIsSubmitting(true);
    const result =
      importMode === "sinopac-tw"
        ? await importSinopacTransactionsCsv(selectedAccountId, selectedFile)
        : importMode === "credit-card-tw"
          ? await importCreditCardTransactionsCsv(selectedAccountId, selectedFile)
        : importMode === "excel-monthly"
          ? await importExcelMonthly(selectedAccountId, selectedFile)
        : importMode === "sinopac-stock"
          ? await importSinopacStockCsv(selectedAccountId, selectedFile)
        : importMode === "foreign-stock-csv"
          ? await importForeignStockCsv(selectedAccountId, selectedFile)
        : importMode === "dividends-csv"
          ? await importDividendsCsv(selectedAccountId, selectedFile)
          : await importTransactionsCsv(selectedAccountId, selectedFile);
    setIsSubmitting(false);

    if (result.status === "error") {
      setLatestRecurringCandidates([]);
      setMessage(`匯入失敗: ${result.error}`);
      return;
    }

    setLatestRecurringCandidates(
      "recurringCandidates" in result ? (result.recurringCandidates ?? []) : [],
    );

    const extraInfo =
      result.source === "sinopac-stock" || result.source === "foreign-stock-csv"
        ? `持倉更新：${result.holdingsRecalculated} 檔。`
        : result.source === "dividends-csv"
          ? ""
          : [
            "recurringCandidates" in result && result.recurringCandidates?.length
              ? `辨識到 ${result.recurringCandidates.length} 筆週期/側欄候選。`
              : null,
            "warnings" in result && result.warnings?.length
              ? `提醒：${result.warnings.join("；")}`
              : null,
          ].filter(Boolean).join(" ");

    setMessage(
      [
        `匯入完成：成功 ${result.imported} 筆，跳過 ${result.skipped} 筆，失敗 ${result.failed} 筆。`,
        extraInfo || null,
      ].filter(Boolean).join(" "),
    );
    onImported();
  }

  async function handleCreateRecurringTemplates() {
    if (latestRecurringCandidates.length === 0) {
      return;
    }

    setIsCreatingRecurring(true);
    const result = await createRecurringTemplatesFromCandidates({
      account_id: selectedAccountId,
      candidates: latestRecurringCandidates,
    });
    setIsCreatingRecurring(false);

    if (result.status === "error") {
      setMessage(`建立週期模板失敗: ${result.error}`);
      return;
    }

    setMessage(
      `已建立 ${result.count} 筆週期模板，跳過 ${result.skipped ?? 0} 筆已存在或無效候選。`,
    );
    setLatestRecurringCandidates([]);
    onRecurringTemplatesCreated();
  }

  return (
    <article className="panel">
      <h2>資料匯入</h2>
      {!session ? <p>登入後可以匯入標準化交易 CSV。</p> : null}
      {state.status === "loading" ? <p>正在載入可用帳戶...</p> : null}
      {state.status === "error" ? <p>匯入面板載入失敗: {state.message}</p> : null}
      {state.status === "success" ? (
        <>
          <p>
            {importMode === "normalized" ? (
              <>CSV 欄位格式：<code>date,amount,currency,category,description</code></>
            ) : importMode === "sinopac-tw" ? (
              <>永豐最小欄位格式：<code>日期,金額,摘要</code>，可選 <code>幣別</code> 與 <code>收支別</code>。</>
            ) : importMode === "credit-card-tw" ? (
              <>信用卡最小欄位格式：<code>交易日期,金額,摘要</code>，可選 <code>幣別</code> 與 <code>交易類型</code>。</>
            ) : importMode === "sinopac-stock" ? (
              <>永豐台股欄位：<code>成交日期,股票代號,股票名稱,買賣別,成交股數,成交單價,手續費,交易稅</code>。匯入後自動重算持倉。</>
            ) : importMode === "foreign-stock-csv" ? (
              <>複委託 CSV 欄位：<code>成交日期,股票代號,股票名稱,買賣別,成交股數,成交單價,手續費,交易稅,currency</code>。可匯入 USD 等外幣交易，匯入後同樣自動重算持倉。</>
            ) : importMode === "dividends-csv" ? (
              <>配息 CSV 欄位：<code>ticker,pay_date,net_amount[,gross_amount][,tax_withheld][,currency]</code>。日期格式 YYYY-MM-DD。</>
            ) : (
              <>Excel 第一版格式：第一列放日期欄，左側欄位使用 <code>分類</code> / <code>項目</code>，每日金額填在日期欄下方。</>
            )}
          </p>
          <form className="account-form" onSubmit={handleSubmit}>
            <label>
              匯入模式
              <select
                value={importMode}
                onChange={(event) =>
                  setImportMode(
                    event.target.value as
                      | "normalized"
                      | "sinopac-tw"
                      | "credit-card-tw"
                      | "excel-monthly"
                      | "sinopac-stock"
                      | "foreign-stock-csv"
                      | "dividends-csv",
                  )
                }
              >
                <option value="normalized">標準化 CSV</option>
                <option value="sinopac-tw">永豐銀行 CSV</option>
                <option value="credit-card-tw">信用卡 CSV</option>
                <option value="excel-monthly">Excel 月帳本</option>
                <option value="sinopac-stock">永豐台股交易 CSV</option>
                <option value="dividends-csv">配息紀錄 CSV</option>
                <option value="foreign-stock-csv">複委託交易 CSV</option>
              </select>
            </label>
            <label>
              匯入目標帳戶
              <select
                value={selectedAccountId}
                onChange={(event) => setSelectedAccountId(event.target.value)}
              >
                {state.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {importMode === "excel-monthly" ? "Excel 檔案" : "CSV 檔案"}
              <input
                accept={
                  importMode === "excel-monthly"
                    ? ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    : ".csv,text/csv,.txt"
                }
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button className="action-button" disabled={isSubmitting} type="submit">
              {isSubmitting
                ? "匯入中..."
                : importMode === "excel-monthly"
                  ? "匯入 Excel"
                  : importMode === "sinopac-stock"
                    ? "匯入台股交易"
                    : importMode === "foreign-stock-csv"
                      ? "匯入複委託交易"
                    : importMode === "dividends-csv"
                      ? "匯入配息"
                      : "匯入 CSV"}
            </button>
          </form>
          {latestRecurringCandidates.length > 0 ? (
            <>
              <p>可直接建立週期模板的候選: {latestRecurringCandidates.length} 筆。</p>
              <button
                className="action-button"
                disabled={isCreatingRecurring}
                onClick={() => void handleCreateRecurringTemplates()}
                type="button"
              >
                {isCreatingRecurring ? "建立模板中..." : "從候選建立週期模板"}
              </button>
            </>
          ) : null}
          {message ? <p>{message}</p> : null}
        </>
      ) : null}
    </article>
  );
}
