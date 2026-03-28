import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountRecord, TransactionRecord } from "@hearth/shared";
import { transactionCategories } from "@hearth/shared";
import { fetchAccounts } from "../lib/accounts";
import {
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
} from "../lib/transactions";

const CATEGORY_LABELS = transactionCategories.map((c) => c.label);
const PAGE_SIZE = 50;

const BANK_SOURCES = [
  "gmail_bank_sinopac",
  "gmail_bank_esun",
  "gmail_bank_cathay",
  "gmail_bank_taishin",
  "gmail_bank_ctbc",
  "gmail_bank_mega",
] as const;

const BANK_SOURCE_LABELS: Record<string, string> = {
  gmail_bank_sinopac: "永豐",
  gmail_bank_esun: "玉山",
};

function resolveTransactionLabel(
  transaction: TransactionRecord,
  accountName: string | undefined,
) {
  if (transaction.source && transaction.source in BANK_SOURCE_LABELS) {
    return BANK_SOURCE_LABELS[transaction.source];
  }
  return accountName ?? "未知";
}

export function BankLedgerPanel({ session }: { session: Session | null }) {
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState("");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);

  const bankAccounts = accounts;
  const accountNameMap = new Map(bankAccounts.map((account) => [account.id, account.name]));

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
    // Fetch all transactions, then filter by bank statement sources client-side
    void fetchTransactions().then((result) => {
      setLoading(false);
      if (result.status === "error") {
        setLoadError(result.error);
        return;
      }
      const bankTxs = result.items.filter(
        (t) => t.source && (BANK_SOURCES as readonly string[]).includes(t.source),
      );
      bankTxs.sort((a, b) => b.date.localeCompare(a.date));
      setTransactions(bankTxs);
    });
  }, [session]);

  const availableMonths = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort().reverse();
  const availableAccounts = [...new Set(
    transactions.map((t) => resolveTransactionLabel(t, accountNameMap.get(t.account_id))),
  )].sort();

  const filtered = transactions.filter((transaction) => {
    const accountName = accountNameMap.get(transaction.account_id);
    if (filterMonth && !transaction.date.startsWith(filterMonth)) return false;
    if (filterAccount && resolveTransactionLabel(transaction, accountName) !== filterAccount) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (transaction.description ?? "").toLowerCase().includes(query) ||
      (transaction.category ?? "").toLowerCase().includes(query) ||
      (accountName ?? "").toLowerCase().includes(query)
    );
  });

  // Group by account label
  const groupedByAccount = new Map<string, TransactionRecord[]>();
  for (const transaction of filtered) {
    const label = resolveTransactionLabel(transaction, accountNameMap.get(transaction.account_id));
    if (!groupedByAccount.has(label)) groupedByAccount.set(label, []);
    groupedByAccount.get(label)!.push(transaction);
  }
  const accountGroups = [...groupedByAccount.entries()].sort(([a], [b]) => a.localeCompare(b));

  const totalIncome = filtered
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = filtered
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

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
    setTransactions((current) => current.filter((t) => t.id !== id));
  }

  async function handleClearAll() {
    if (transactions.length === 0) return;

    if (!window.confirm(`確定要清空全部銀行帳單交易嗎？目前共有 ${transactions.length} 筆，這個動作無法復原。`)) {
      return;
    }

    setClearing(true);
    for (const tx of transactions) {
      await deleteTransaction(tx.id);
    }
    setTransactions([]);
    setClearing(false);
  }

  if (!session) return null;

  return (
    <article className="panel ledger-panel">
      <h2>銀行帳戶明細</h2>

      <div className="ledger-toolbar">
        <label className="ledger-toolbar-field">
          <span>搜尋</span>
          <input
            placeholder="輸入說明、分類或帳戶..."
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
          <span>帳戶</span>
          <select
            value={filterAccount}
            onChange={(event) => {
              setFilterAccount(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            <option value="">全部</option>
            {availableAccounts.map((account) => (
              <option key={account} value={account}>{account}</option>
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
              {clearing ? "清除中..." : "清空全部銀行交易"}
            </button>
          </div>
        )}
      </div>

      {loading && <p>載入中...</p>}
      {loadError && <p>載入失敗：{loadError}</p>}

      {!loading && transactions.length > 0 && (
        <p className="ledger-summary">
          共 <strong>{filtered.length}</strong> 筆，收入{" "}
          <strong>NT$ {totalIncome.toLocaleString()}</strong>
          {" · "}支出{" "}
          <strong>NT$ {totalExpense.toLocaleString()}</strong>
          {filtered.some((t) => !t.category) && (
            <span className="ledger-uncategorized-hint">
              尚有 {filtered.filter((t) => !t.category).length} 筆未分類，可直接點分類欄位編輯。
            </span>
          )}
        </p>
      )}

      {accountGroups.length > 0 && (
        <>
          {accountGroups.map(([label, groupTransactions]) => {
            const groupIncome = groupTransactions
              .filter((t) => t.amount > 0)
              .reduce((sum, t) => sum + Number(t.amount), 0);
            const groupExpense = groupTransactions
              .filter((t) => t.amount < 0)
              .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
            return (
              <section key={label} className="ledger-account-section">
                <h3 className="ledger-account-heading">
                  {label}
                  <span className="ledger-account-summary">
                    {groupTransactions.length} 筆 · 收入 NT$ {groupIncome.toLocaleString()} · 支出 NT$ {groupExpense.toLocaleString()}
                  </span>
                </h3>
                <div className="ledger-table-wrapper">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>說明</th>
                        <th className="ledger-th-amount">金額</th>
                        <th>分類</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupTransactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td className="ledger-date">{transaction.date}</td>
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
                                list="bank-ledger-category-options"
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
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          <datalist id="bank-ledger-category-options">
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
        <p>目前沒有銀行帳戶交易。先從 Gmail 帳單同步或匯入對帳單開始。</p>
      )}
    </article>
  );
}
