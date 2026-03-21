import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountRecord } from "@hearth/shared";
import { fetchAccounts } from "../lib/accounts";
import { importTransactionsCsv } from "../lib/imports";

type ImportPanelProps = {
  session: Session | null;
  onImported: () => void;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "success"; accounts: AccountRecord[] };

export function ImportPanel({ session, onImported }: ImportPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!session) {
      setState({ status: "idle" });
      setSelectedAccountId("");
      setSelectedFile(null);
      setMessage(null);
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
      setMessage("請先選擇 CSV 檔案。");
      return;
    }

    setIsSubmitting(true);
    const result = await importTransactionsCsv(selectedAccountId, selectedFile);
    setIsSubmitting(false);

    if (result.status === "error") {
      setMessage(`匯入失敗: ${result.error}`);
      return;
    }

    setMessage(
      `匯入完成：成功 ${result.imported} 筆，失敗 ${result.failed} 筆。`,
    );
    onImported();
  }

  return (
    <article className="panel">
      <h2>CSV 匯入</h2>
      {!session ? <p>登入後可以匯入標準化交易 CSV。</p> : null}
      {state.status === "loading" ? <p>正在載入可用帳戶...</p> : null}
      {state.status === "error" ? <p>匯入面板載入失敗: {state.message}</p> : null}
      {state.status === "success" ? (
        <>
          <p>CSV 欄位格式：`date,amount,currency,category,description`</p>
          <form className="account-form" onSubmit={handleSubmit}>
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
              CSV 檔案
              <input
                accept=".csv,text/csv"
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button className="action-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "匯入中..." : "匯入 CSV"}
            </button>
          </form>
          {message ? <p>{message}</p> : null}
        </>
      ) : null}
    </article>
  );
}
