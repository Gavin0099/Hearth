import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountRecord, TransactionRecord } from "@hearth/shared";
import { transactionCategories } from "@hearth/shared";
import { fetchAccounts } from "../lib/accounts";
import {
  clearTransactions,
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
} from "../lib/transactions";

const CATEGORY_LABELS = transactionCategories.map((c) => c.label);
const PAGE_SIZE = 50;

const GMAIL_SOURCE_LABELS: Record<string, string> = {
  gmail_pdf_sinopac: "永豐",
  gmail_pdf_esun: "玉山",
  gmail_pdf_cathay: "國泰",
  gmail_pdf_taishin: "台新",
  gmail_pdf_ctbc: "中信",
  gmail_pdf_mega: "兆豐",
};

function resolveTransactionLabel(
  transaction: TransactionRecord,
  accountName: string | undefined,
) {
  if (transaction.source && transaction.source in GMAIL_SOURCE_LABELS) {
    return GMAIL_SOURCE_LABELS[transaction.source];
  }
  return accountName ?? "未知";
}

export function CreditCardLedgerPanel({ session }: { session: Session | null }) {
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterBank, setFilterBank] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState("");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);

  const creditAccounts = accounts.filter((account) => account.type === "cash_credit");
  const accountNameMap = new Map(creditAccounts.map((account) => [account.id, account.name]));

  useEffect(() => {
    if (!session) return;
    void fetchAccounts().then((result) => {
      if (result.status === "error") return;
      setAccounts(result.items);
    });
  }, [session]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);
    setVisibleCount(PAGE_SIZE);
    void fetchTransactions().then((result) => {
      setLoading(false);
      if (result.status === "error") {
        setLoadError(result.error);
        return;
      }
      setTransactions(result.items);
    });
  }, [session]);

  const availableMonths = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort().reverse();
  const availableBanks = [...new Set(
    transactions.map((t) => resolveTransactionLabel(t, accountNameMap.get(t.account_id)))
  )].sort();

  const filtered = transactions.filter((transaction) => {
    const accountName = accountNameMap.get(transaction.account_id);
    if (filterMonth && !transaction.date.startsWith(filterMonth)) return false;
    if (filterBank && resolveTransactionLabel(transaction, accountName) !== filterBank) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (transaction.description ?? "").toLowerCase().includes(query) ||
      (transaction.category ?? "").toLowerCase().includes(query) ||
      (accountName ?? "").toLowerCase().includes(query) ||
      resolveTransactionLabel(transaction, accountName).toLowerCase().includes(query)
    );
  });

  const visible = filtered.slice(0, visibleCount);
  const totalExpense = filtered
    .filter((transaction) => transaction.amount < 0)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0);

  function startEdit(transaction: TransactionRecord) {
    setEditingId(transaction.id);
    setEditingCategory(transaction.category ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveCategory(id: string) {
    setEditingId(null);
    setSavingIds((current) => new Set([...current, id]));
    const result = await updateTransaction(id, {
      category: editingCategory.trim() || null,
    });
    setSavingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });

    if (result.status !== "error" && result.items[0]) {
      const updated = result.items[0];
      setTransactions((current) =>
        current.map((transaction) =>
          transaction.id === id ? { ...transaction, category: updated.category } : transaction,
        ),
      );
    }
  }

  async function handleDelete(id: string) {
    setDeletingIds((current) => new Set([...current, id]));
    await deleteTransaction(id);
    setDeletingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setTransactions((current) => current.filter((transaction) => transaction.id !== id));
  }

  async function handleClearAll() {
    if (creditAccounts.length === 0 || transactions.length === 0) {
      return;
    }

    if (!window.confirm(`確定要清空全部信用卡交易嗎？目前共有 ${transactions.length} 筆，這個動作無法復原。`)) {
      return;
    }

    setClearing(true);
    for (const account of creditAccounts) {
      await clearTransactions(account.id);
    }
    setTransactions([]);
    setClearing(false);
  }

  if (!session) return null;

  return (
    <article className="panel ledger-panel">
      <h2>信用卡消費明細</h2>

      <div className="ledger-toolbar">
        <label className="ledger-toolbar-field">
          <span>搜尋</span>
          <input
            placeholder="輸入說明、分類或銀行..."
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          />
        </label>
        <label className="ledger-toolbar-field">
          <span>月份</span>
          <select
            value={filterMonth}
            onChange={(event) => {
              setFilterMonth(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            <option value="">全部</option>
            {availableMonths.map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
        </label>
        <label className="ledger-toolbar-field">
          <span>銀行</span>
          <select
            value={filterBank}
            onChange={(event) => {
              setFilterBank(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            <option value="">全部</option>
            {availableBanks.map((bank) => (
              <option key={bank} value={bank}>{bank}</option>
            ))}
          </select>
        </label>
        {transactions.length > 0 && (
          <div className="ledger-toolbar-field" style={{ justifyContent: "flex-end" }}>
            <span style={{ visibility: "hidden" }}>操作</span>
            <button
              className="action-button secondary"
              style={{ fontSize: "0.85rem", padding: "8px 14px", color: "#b83232" }}
              onClick={() => void handleClearAll()}
              disabled={clearing}
              type="button"
            >
              {clearing ? "清除中..." : "清空全部信用卡交易"}
            </button>
          </div>
        )}
      </div>

      {loading && <p>載入中...</p>}
      {loadError && <p>載入失敗：{loadError}</p>}

      {!loading && transactions.length > 0 && (
        <p className="ledger-summary">
          共 <strong>{filtered.length}</strong> 筆消費，總支出{" "}
          <strong>NT$ {totalExpense.toLocaleString()}</strong>
          {filtered.some((transaction) => !transaction.category) && (
            <span className="ledger-uncategorized-hint">
              尚有 {filtered.filter((transaction) => !transaction.category).length} 筆未分類，可直接點分類欄位編輯。
            </span>
          )}
        </p>
      )}

      {visible.length > 0 && (
        <>
          <div className="ledger-table-wrapper">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>標籤</th>
                  <th>說明</th>
                  <th className="ledger-th-amount">金額</th>
                  <th>分類</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((transaction) => {
                  const accountName = accountNameMap.get(transaction.account_id);
                  return (
                    <tr key={transaction.id}>
                      <td className="ledger-date">{transaction.date}</td>
                      <td>
                        <span className="ledger-account-badge">
                          {resolveTransactionLabel(transaction, accountName)}
                        </span>
                      </td>
                      <td className="ledger-desc">{transaction.description ?? "—"}</td>
                      <td
                        className={`ledger-amount ${transaction.amount < 0 ? "negative" : "positive"}`}
                      >
                        {transaction.amount < 0 ? "-" : "+"}NT${" "}
                        {Math.abs(Number(transaction.amount)).toLocaleString()}
                      </td>
                      <td className="ledger-category-cell">
                        {editingId === transaction.id ? (
                          <input
                            autoFocus
                            className="ledger-category-input"
                            list="ledger-category-options"
                            value={editingCategory}
                            onChange={(event) => setEditingCategory(event.target.value)}
                            onBlur={() => void saveCategory(transaction.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void saveCategory(transaction.id);
                              if (event.key === "Escape") cancelEdit();
                            }}
                          />
                        ) : (
                          <button
                            className={`ledger-category-badge${
                              transaction.category ? "" : " uncategorized"
                            }`}
                            onClick={() => startEdit(transaction)}
                            type="button"
                          >
                            {savingIds.has(transaction.id)
                              ? "儲存中..."
                              : (transaction.category ?? "未分類")}
                          </button>
                        )}
                      </td>
                      <td>
                        <button
                          className="ledger-delete-btn"
                          disabled={deletingIds.has(transaction.id)}
                          onClick={() => void handleDelete(transaction.id)}
                          type="button"
                          aria-label="刪除"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <datalist id="ledger-category-options">
            {CATEGORY_LABELS.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>

          {filtered.length > visibleCount && (
            <button
              className="action-button secondary"
              style={{ marginTop: "12px" }}
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              type="button"
            >
              載入更多，剩餘 {filtered.length - visibleCount} 筆
            </button>
          )}
        </>
      )}

      {!loading && transactions.length === 0 && (
        <p>目前沒有信用卡交易。先從 Gmail 帳單同步或信用卡匯入開始。</p>
      )}
    </article>
  );
}
