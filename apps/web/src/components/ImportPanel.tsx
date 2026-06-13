import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountRecord, RecurringImportCandidate } from "@hearth/shared";
import { Button } from "./ui/button";
import { fetchAccounts } from "../lib/accounts";
import {
  importCreditCardTransactionsCsv,
  importDividendsCsv,
  importExcelMonthly,
  importForeignStockCsv,
  importSinopacHoldingsXlsx,
  importSinopacStockCsv,
  importSinopacTransactionsCsv,
  importTransactionsCsv,
  previewImportFile,
} from "../lib/imports";
import { applyRecurringTemplates, createRecurringTemplatesFromCandidates } from "../lib/recurring";

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
    "normalized" | "sinopac-tw" | "credit-card-tw" | "excel-monthly" | "sinopac-stock" | "foreign-stock-csv" | "dividends-csv" | "sinopac-holdings-xlsx"
  >("normalized");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [latestRecurringCandidates, setLatestRecurringCandidates] = useState<RecurringImportCandidate[]>([]);
  const [isCreatingRecurring, setIsCreatingRecurring] = useState(false);
  const [isCreatingAndApplyingRecurring, setIsCreatingAndApplyingRecurring] = useState(false);

  type FilePreview = {
    name: string;
    sizeKb: number;
    headers: string[];
    sampleRows: string[][];
    estimatedDataRows: number;
    validRows: number;
    failedRows: number;
    skipped: number;
    warnings: string[];
    errors: string[];
    recurringCandidates: number;
  };
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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

  async function loadDryRunPreview(file: File | null, mode = importMode, accountId = selectedAccountId) {
    if (!file || !accountId) {
      setFilePreview(null);
      return;
    }

    // Holdings xlsx has no row-level preview — skip
    if (mode === "sinopac-holdings-xlsx") {
      setFilePreview(null);
      return;
    }

    setPreviewLoading(true);
    let preview;
    try {
      preview = await previewImportFile(
        mode as Exclude<typeof mode, "sinopac-holdings-xlsx">,
        accountId,
        file,
      );
    } catch (error) {
      setFilePreview(null);
      setMessage(error instanceof Error ? `預覽失敗: ${error.message}` : "預覽失敗。");
      return;
    } finally {
      setPreviewLoading(false);
    }

    if (preview.status === "error") {
      setFilePreview(null);
      setMessage(`預覽失敗: ${preview.error}`);
      return;
    }

    setFilePreview({
      name: file.name,
      sizeKb: Math.round(file.size / 1024),
      headers: preview.columns,
      sampleRows: preview.sampleRows,
      estimatedDataRows: preview.estimatedRows,
      validRows: preview.validRows,
      failedRows: preview.failedRows,
      skipped: preview.skipped,
      warnings: preview.warnings ?? [],
      errors: preview.errors,
      recurringCandidates: preview.recurringCandidates?.length ?? 0,
    });
  }

  async function handleFileChange(file: File | null) {
    setSelectedFile(file);
    setFilePreview(null);
    setMessage(null);
    if (!file) return;
    await loadDryRunPreview(file);
  }

  useEffect(() => {
    if (!selectedFile || !session || !selectedAccountId) return;
    void loadDryRunPreview(selectedFile, importMode, selectedAccountId);
  }, [importMode, selectedAccountId]);

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
        : importMode === "sinopac-holdings-xlsx"
          ? await importSinopacHoldingsXlsx(selectedAccountId, selectedFile)
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

    if (result.source === "sinopac-holdings-xlsx") {
      setMessage(
        `持倉更新完成：${result.imported} 檔更新，${result.skipped} 檔失敗，價格快照 ${result.prices_updated} 檔。` +
        (result.errors.length > 0 ? ` 錯誤：${result.errors.join("；")}` : ""),
      );
      onImported();
      return;
    }

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

  async function handleCreateAndApplyRecurringTemplates() {
    if (latestRecurringCandidates.length === 0) {
      return;
    }

    setIsCreatingAndApplyingRecurring(true);
    const createResult = await createRecurringTemplatesFromCandidates({
      account_id: selectedAccountId,
      candidates: latestRecurringCandidates,
    });

    if (createResult.status === "error") {
      setIsCreatingAndApplyingRecurring(false);
      setMessage(`建立週期模板失敗: ${createResult.error}`);
      return;
    }

    const now = new Date();
    const applyResult = await applyRecurringTemplates({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    });
    setIsCreatingAndApplyingRecurring(false);

    if (applyResult.status === "error") {
      setMessage(
        `已建立 ${createResult.count} 筆週期模板，但套用本月失敗: ${applyResult.error}`,
      );
      onRecurringTemplatesCreated();
      return;
    }

    setMessage(
      [
        `已建立 ${createResult.count} 筆週期模板（跳過 ${createResult.skipped ?? 0} 筆）。`,
        `本月新增 ${applyResult.count} 筆週期交易（跳過 ${applyResult.skipped} 筆既有資料）。`,
      ].join(" "),
    );
    setLatestRecurringCandidates([]);
    onRecurringTemplatesCreated();
    onImported();
  }

  return (
    <article className="panel import-panel">
      <h2>資料匯入</h2>
      {!session ? <p className="panel-copy">登入後可以匯入標準化交易 CSV。</p> : null}
      {state.status === "loading" ? <p className="panel-message panel-message--muted">正在載入可用帳戶...</p> : null}
      {state.status === "error" ? <p className="panel-message panel-message--error">匯入面板載入失敗: {state.message}</p> : null}
      {state.status === "success" ? (
        <>
          <p className="panel-copy">
            {importMode === "normalized" ? (
              <>CSV 欄位格式：<code className="panel-inline-code">date,amount,currency,category,description</code></>
            ) : importMode === "sinopac-tw" ? (
              <>永豐最小欄位格式：<code className="panel-inline-code">日期,金額,摘要</code>，可選 <code className="panel-inline-code">幣別</code> 與 <code className="panel-inline-code">收支別</code>。</>
            ) : importMode === "credit-card-tw" ? (
              <>信用卡最小欄位格式：<code className="panel-inline-code">交易日期,金額,摘要</code>，可選 <code className="panel-inline-code">幣別</code> 與 <code className="panel-inline-code">交易類型</code>。</>
            ) : importMode === "sinopac-stock" ? (
              <>永豐台股欄位：<code className="panel-inline-code">成交日期,股票代號,股票名稱,買賣別,成交股數,成交單價,手續費,交易稅</code>。匯入後自動重算持倉。</>
            ) : importMode === "foreign-stock-csv" ? (
              <>複委託 CSV 欄位：<code className="panel-inline-code">成交日期,股票代號,股票名稱,買賣別,成交股數,成交單價,手續費,交易稅,currency</code>。可匯入 USD 等外幣交易，匯入後同樣自動重算持倉。</>
            ) : importMode === "dividends-csv" ? (
              <>配息 CSV 欄位：<code className="panel-inline-code">ticker,pay_date,net_amount[,gross_amount][,tax_withheld][,currency]</code>。日期格式 YYYY-MM-DD。</>
            ) : (
              <>Excel 第一版格式：第一列放日期欄，左側欄位使用 <code className="panel-inline-code">分類</code> / <code className="panel-inline-code">項目</code>，每日金額填在日期欄下方。</>
            )}
          </p>
          <form className="account-form form-surface import-form" onSubmit={handleSubmit}>
            <label className="import-field">
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
                      | "dividends-csv"
                      | "sinopac-holdings-xlsx",
                  )
                }
              >
                <option value="normalized">標準化 CSV</option>
                <option value="sinopac-tw">永豐銀行 CSV</option>
                <option value="credit-card-tw">信用卡 CSV</option>
                <option value="excel-monthly">Excel 月帳本</option>
                <option value="sinopac-stock">永豐台股交易 CSV</option>
                <option value="sinopac-holdings-xlsx">永豐台股持倉 XLSX</option>
                <option value="dividends-csv">配息紀錄 CSV</option>
                <option value="foreign-stock-csv">複委託交易 CSV</option>
              </select>
            </label>
            <label className="import-field">
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
            <label className="import-field import-file-field">
              {importMode === "excel-monthly" || importMode === "sinopac-holdings-xlsx" ? "Excel 檔案" : "CSV 檔案"}
              <input
                className="import-file-input"
                accept={
                  importMode === "excel-monthly" || importMode === "sinopac-holdings-xlsx"
                    ? ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    : ".csv,text/csv,.txt"
                }
                type="file"
                onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)}
              />
            </label>
            {filePreview ? (
              <div className="import-preview">
                <div className="import-preview-meta">
                  <span className="import-preview-chip import-preview-chip--file">{filePreview.name}</span>
                  <span className="import-preview-chip">{filePreview.sizeKb} KB</span>
                  {filePreview.estimatedDataRows > 0 ? (
                    <span className="import-preview-chip import-preview-chip--info">約 {filePreview.estimatedDataRows} 筆資料列</span>
                  ) : null}
                  <span className="import-preview-chip import-preview-chip--success">可匯入 {filePreview.validRows} 筆</span>
                  {filePreview.failedRows > 0 ? <span className="import-preview-chip import-preview-chip--error">錯誤 {filePreview.failedRows} 筆</span> : null}
                  {filePreview.skipped > 0 ? <span className="import-preview-chip import-preview-chip--warning">略過 {filePreview.skipped} 筆</span> : null}
                  {filePreview.recurringCandidates > 0 ? (
                    <span className="import-preview-chip import-preview-chip--info">recurring 候選 {filePreview.recurringCandidates} 筆</span>
                  ) : null}
                </div>
                {filePreview.headers.length > 0 ? (
                  <div className="import-preview-table-wrap">
                    <table className="import-preview-table">
                      <thead>
                        <tr>
                          {filePreview.headers.slice(0, 6).map((h, i) => (
                            <th key={i}>{h || `欄 ${i + 1}`}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filePreview.sampleRows.map((row, ri) => (
                          <tr key={ri}>
                            {filePreview.headers.slice(0, 6).map((_, ci) => (
                              <td key={ci}>{row[ci] ?? ""}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {filePreview.warnings.length > 0 ? (
                  <p className="panel-message import-preview-warning-text">
                    warnings: {filePreview.warnings.join(" | ")}
                  </p>
                ) : null}
                {filePreview.errors.length > 0 ? (
                  <p className="panel-message panel-message--error import-preview-error-text">
                    errors: {filePreview.errors.slice(0, 3).join(" | ")}
                    {filePreview.errors.length > 3 ? ` | ...共 ${filePreview.errors.length} 筆` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
            {previewLoading ? <p className="panel-message panel-message--muted import-preview-loading">預覽解析中...</p> : null}
            <Button disabled={isSubmitting} loading={isSubmitting} type="submit">
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
            </Button>
          </form>
          {latestRecurringCandidates.length > 0 ? (
            <>
              <p className="panel-message panel-message--muted panel-status-message">
                可直接建立週期模板的候選: {latestRecurringCandidates.length} 筆。
              </p>
              <div className="recurring-actions">
                <Button
                  disabled={isCreatingRecurring || isCreatingAndApplyingRecurring}
                  loading={isCreatingRecurring}
                  onClick={() => void handleCreateRecurringTemplates()}
                  type="button"
                >
                  {isCreatingRecurring ? "建立模板中..." : "從候選建立週期模板"}
                </Button>
                <Button
                  disabled={isCreatingRecurring || isCreatingAndApplyingRecurring}
                  loading={isCreatingAndApplyingRecurring}
                  onClick={() => void handleCreateAndApplyRecurringTemplates()}
                  type="button"
                >
                  {isCreatingAndApplyingRecurring ? "建立並套用中..." : "建立模板並套用本月"}
                </Button>
              </div>
            </>
          ) : null}
          {message ? <p className="panel-message panel-status-message panel-status-message--done">{message}</p> : null}
        </>
      ) : null}
    </article>
  );
}
