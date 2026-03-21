import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountRecord, RecurringImportCandidate } from "@hearth/shared";
import { fetchAccounts } from "../lib/accounts";
import {
  importExcelMonthly,
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
  const [importMode, setImportMode] = useState<"normalized" | "sinopac-tw" | "excel-monthly">("normalized");
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
        : importMode === "excel-monthly"
          ? await importExcelMonthly(selectedAccountId, selectedFile)
          : await importTransactionsCsv(selectedAccountId, selectedFile);
    setIsSubmitting(false);

    if (result.status === "error") {
      setLatestRecurringCandidates([]);
      setMessage(`匯入失敗: ${result.error}`);
      return;
    }

    setLatestRecurringCandidates(result.recurringCandidates ?? []);

    setMessage(
      [
        `匯入完成：成功 ${result.imported} 筆，跳過 ${result.skipped} 筆，失敗 ${result.failed} 筆。`,
        result.recurringCandidates?.length
          ? `辨識到 ${result.recurringCandidates.length} 筆週期/側欄候選。`
          : null,
        result.warnings?.length ? `提醒：${result.warnings.join("；")}` : null,
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
            {importMode === "normalized"
              ? "CSV 欄位格式：`date,amount,currency,category,description`"
              : importMode === "sinopac-tw"
                ? "永豐最小欄位格式：`日期,金額,摘要`，可選 `幣別` 與 `收支別`。"
                : "Excel 第一版格式：第一列放日期欄，左側欄位使用 `分類` / `項目`，每日金額填在日期欄下方。"}
          </p>
          <form className="account-form" onSubmit={handleSubmit}>
            <label>
              匯入模式
              <select
                value={importMode}
                onChange={(event) =>
                  setImportMode(event.target.value as "normalized" | "sinopac-tw" | "excel-monthly")
                }
              >
                <option value="normalized">Normalized CSV</option>
                <option value="sinopac-tw">Sinopac TW CSV</option>
                <option value="excel-monthly">Excel Monthly</option>
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
                    : ".csv,text/csv"
                }
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button className="action-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "匯入中..." : importMode === "excel-monthly" ? "匯入 Excel" : "匯入 CSV"}
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
