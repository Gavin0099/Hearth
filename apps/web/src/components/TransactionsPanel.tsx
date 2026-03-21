import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type {
  AccountRecord,
  CreateTransactionInput,
  TransactionRecord,
  TransactionsQuery,
  UpdateTransactionInput,
} from "@hearth/shared";
import { fetchAccounts } from "../lib/accounts";
import {
  createTransaction,
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
} from "../lib/transactions";

type TransactionsPanelProps = {
  session: Session | null;
  onTransactionCreated: () => void;
  refreshKey?: number;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "success"; accounts: AccountRecord[]; transactions: TransactionRecord[] };

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;

export function TransactionsPanel({
  session,
  onTransactionCreated,
  refreshKey = 0,
}: TransactionsPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UpdateTransactionInput>({
    date: today,
    amount: -100,
    category: "",
    description: "",
  });
  const [filters, setFilters] = useState<TransactionsQuery>({
    date_from: monthStart,
    date_to: today,
  });
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
      const accountsResult = await fetchAccounts();

      if (cancelled) {
        return;
      }

      if (accountsResult.status === "error") {
        setState({ status: "error", message: accountsResult.error });
        return;
      }

      const accounts = accountsResult.items;
      const resolvedFilters: TransactionsQuery = {
        ...filters,
        account_id: filters.account_id || accounts[0]?.id || undefined,
      };

      const transactionsResult = await fetchTransactions(resolvedFilters);
      if (cancelled) {
        return;
      }

      if (transactionsResult.status === "error") {
        setState({ status: "error", message: transactionsResult.error });
        return;
      }

      setState({
        status: "success",
        accounts,
        transactions: transactionsResult.items,
      });

      setForm((current) => ({
        ...current,
        account_id: current.account_id || accounts[0]?.id || "",
      }));
      if (!filters.account_id && accounts[0]?.id) {
        setFilters((current) => ({
          ...current,
          account_id: current.account_id || accounts[0]?.id,
        }));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [session, refreshKey, filters.account_id, filters.category, filters.date_from, filters.date_to, filters.q]);

  const visibleTransactions = useMemo(() => {
    if (state.status !== "success") {
      return [];
    }
    return state.transactions.slice(0, 20);
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

  function updateFilters<K extends keyof TransactionsQuery>(
    key: K,
    value: TransactionsQuery[K],
  ) {
    setFilters((current) => ({
      ...current,
      [key]: value,
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

  async function handleDeleteTransaction(transactionId: string) {
    setFormError(null);
    setFormSuccess(null);
    setDeletingTransactionId(transactionId);
    const result = await deleteTransaction(transactionId);
    setDeletingTransactionId(null);

    if (result.status === "error") {
      setFormError(result.error);
      return;
    }

    setState((current) => {
      if (current.status !== "success") {
        return current;
      }

      return {
        ...current,
        transactions: current.transactions.filter((transaction) => transaction.id !== transactionId),
      };
    });
    setFormSuccess("交易已刪除，月報會在下一次讀取時反映。");
    onTransactionCreated();
  }

  function startEdit(transaction: TransactionRecord) {
    setFormError(null);
    setFormSuccess(null);
    setEditingTransactionId(transaction.id);
    setEditForm({
      date: transaction.date,
      amount: Number(transaction.amount),
      currency: transaction.currency,
      category: transaction.category ?? "",
      description: transaction.description ?? "",
    });
  }

  function cancelEdit() {
    setEditingTransactionId(null);
  }

  async function saveEdit(transactionId: string) {
    setFormError(null);
    setFormSuccess(null);

    const result = await updateTransaction(transactionId, {
      date: editForm.date,
      amount: Number(editForm.amount),
      currency: editForm.currency,
      category: editForm.category ?? null,
      description: editForm.description ?? null,
    });

    if (result.status === "error") {
      setFormError(result.error);
      return;
    }

    const updated = result.items[0];
    if (updated) {
      setState((current) => {
        if (current.status !== "success") {
          return current;
        }

        return {
          ...current,
          transactions: current.transactions.map((transaction) =>
            transaction.id === transactionId ? updated : transaction,
          ),
        };
      });
    }

    setEditingTransactionId(null);
    setFormSuccess("交易已更新。");
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

          <form className="account-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              檢視帳戶
              <select
                value={filters.account_id ?? ""}
                onChange={(event) => updateFilters("account_id", event.target.value || undefined)}
              >
                {state.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              起始日
              <input
                type="date"
                value={filters.date_from ?? ""}
                onChange={(event) => updateFilters("date_from", event.target.value || undefined)}
              />
            </label>
            <label>
              結束日
              <input
                type="date"
                value={filters.date_to ?? ""}
                onChange={(event) => updateFilters("date_to", event.target.value || undefined)}
              />
            </label>
            <label>
              類別
              <input
                placeholder="例如：餐飲"
                value={filters.category ?? ""}
                onChange={(event) => updateFilters("category", event.target.value || undefined)}
              />
            </label>
            <label>
              關鍵字
              <input
                placeholder="描述關鍵字"
                value={filters.q ?? ""}
                onChange={(event) => updateFilters("q", event.target.value || undefined)}
              />
            </label>
          </form>

          {visibleTransactions.length > 0 ? (
            <ul>
              {visibleTransactions.map((transaction) => (
                <li key={transaction.id}>
                  {editingTransactionId === transaction.id ? (
                    <>
                      <input
                        type="date"
                        value={editForm.date ?? ""}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            date: event.target.value,
                          }))
                        }
                      />{" "}
                      <input
                        type="number"
                        value={editForm.amount ?? 0}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            amount: Number(event.target.value),
                          }))
                        }
                      />{" "}
                      <input
                        value={editForm.category ?? ""}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            category: event.target.value,
                          }))
                        }
                      />{" "}
                      <input
                        value={editForm.description ?? ""}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                      />{" "}
                      <button
                        className="action-button"
                        onClick={() => void saveEdit(transaction.id)}
                        type="button"
                      >
                        儲存
                      </button>{" "}
                      <button className="action-button" onClick={cancelEdit} type="button">
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      {transaction.date} | {transaction.category ?? "未分類"} | NT${" "}
                      {Number(transaction.amount).toFixed(2)}{" "}
                      <button
                        className="action-button"
                        onClick={() => startEdit(transaction)}
                        type="button"
                      >
                        編輯
                      </button>{" "}
                      <button
                        className="action-button"
                        disabled={deletingTransactionId === transaction.id}
                        onClick={() => void handleDeleteTransaction(transaction.id)}
                        type="button"
                      >
                        {deletingTransactionId === transaction.id ? "刪除中..." : "刪除"}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>目前找不到符合篩選條件的交易。</p>
          )}
        </>
      ) : null}
    </article>
  );
}
