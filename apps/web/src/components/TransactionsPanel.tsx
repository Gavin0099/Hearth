import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountRecord, CreateTransactionInput, TransactionRecord } from "@hearth/shared";
import { fetchAccounts } from "../lib/accounts";
import { createTransaction, fetchTransactions } from "../lib/transactions";

type TransactionsPanelProps = {
  session: Session | null;
  onTransactionCreated: () => void;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "success"; accounts: AccountRecord[]; transactions: TransactionRecord[] };

const today = new Date().toISOString().slice(0, 10);

export function TransactionsPanel({
  session,
  onTransactionCreated,
}: TransactionsPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<CreateTransactionInput>({
    account_id: "",
    date: today,
    amount: -100,
    currency: "TWD",
    category: "餐飲",
    description: "",
    source: "manual",
  });

  useEffect(() => {
    if (!session) {
      setState({ status: "idle" });
      setFormError(null);
      setFormSuccess(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      const [accountsResult, transactionsResult] = await Promise.all([
        fetchAccounts(),
        fetchTransactions(),
      ]);

      if (cancelled) {
        return;
      }

      if (accountsResult.status === "error") {
        setState({ status: "error", message: accountsResult.error });
        return;
      }

      if (transactionsResult.status === "error") {
        setState({ status: "error", message: transactionsResult.error });
        return;
      }

      const accounts = accountsResult.items;
      setState({
        status: "success",
        accounts,
        transactions: transactionsResult.items,
      });

      setForm((current) => ({
        ...current,
        account_id: current.account_id || accounts[0]?.id || "",
      }));
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const recentTransactions = useMemo(() => {
    if (state.status !== "success") {
      return [];
    }
    return state.transactions.slice(0, 5);
  }, [state]);

  function updateForm<K extends keyof CreateTransactionInput>(
    field: K,
    value: CreateTransactionInput[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!form.account_id) {
      setFormError("請先選擇帳戶。");
      return;
    }

    setIsSubmitting(true);
    const result = await createTransaction({
      ...form,
      amount: Number(form.amount),
    });
    setIsSubmitting(false);

    if (result.status === "error") {
      setFormError(result.error);
      return;
    }

    const created = result.items[0];
    setState((current) => {
      if (current.status !== "success" || !created) {
        return current;
      }
      return {
        ...current,
        transactions: [created, ...current.transactions],
      };
    });
    setFormSuccess("交易已建立，月報會在下一次讀取時反映。");
    setForm((current) => ({
      ...current,
      amount: -100,
      description: "",
    }));
    onTransactionCreated();
  }

  return (
    <article className="panel">
      <h2>手動交易</h2>
      {!session ? <p>登入後可以建立第一筆手動交易，直接餵給月報。</p> : null}
      {state.status === "loading" ? <p>正在載入帳戶與交易資料...</p> : null}
      {state.status === "error" ? <p>交易面板載入失敗: {state.message}</p> : null}
      {state.status === "success" ? (
        <>
          <form className="account-form" onSubmit={handleSubmit}>
            <label>
              帳戶
              <select
                value={form.account_id}
                onChange={(event) => updateForm("account_id", event.target.value)}
              >
                {state.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              日期
              <input
                type="date"
                value={form.date}
                onChange={(event) => updateForm("date", event.target.value)}
              />
            </label>
            <label>
              金額
              <input
                type="number"
                value={form.amount}
                onChange={(event) => updateForm("amount", Number(event.target.value))}
              />
            </label>
            <label>
              類別
              <input
                value={form.category ?? ""}
                onChange={(event) => updateForm("category", event.target.value)}
                placeholder="例如：餐飲"
              />
            </label>
            <label>
              說明
              <input
                value={form.description ?? ""}
                onChange={(event) => updateForm("description", event.target.value)}
                placeholder="例如：午餐"
              />
            </label>
            <button className="action-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "建立中..." : "新增交易"}
            </button>
            {formError ? <p>建立失敗: {formError}</p> : null}
            {formSuccess ? <p>{formSuccess}</p> : null}
          </form>

          {recentTransactions.length > 0 ? (
            <ul>
              {recentTransactions.map((transaction) => (
                <li key={transaction.id}>
                  {transaction.date} | {transaction.category ?? "未分類"} | NT${" "}
                  {Number(transaction.amount).toFixed(2)}
                </li>
              ))}
            </ul>
          ) : (
            <p>目前還沒有交易資料，先新增第一筆來驗證月報路徑。</p>
          )}
        </>
      ) : null}
    </article>
  );
}
