import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountRecord, TransactionRecord } from "@hearth/shared";
import { transactionCategories } from "@hearth/shared";
import { fetchAccounts } from "../lib/accounts";
import { fetchTransactions, updateTransaction } from "../lib/transactions";

const CATEGORY_LABELS = transactionCategories.map((c) => c.label);
const PAGE_SIZE = 50;

export function CreditCardLedgerPanel({ session }: { session: Session | null }) {
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Inline category editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState("");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!session) return;
    void fetchAccounts().then((result) => {
      if (result.status === "error") return;
      setAccounts(result.items);
      setSelectedAccountId(result.items[0]?.id ?? "");
    });
  }, [session]);

  useEffect(() => {
    if (!selectedAccountId) return;
    setLoading(true);
    setLoadError(null);
    setVisibleCount(PAGE_SIZE);
    void fetchTransactions({ account_id: selectedAccountId }).then((result) => {
      setLoading(false);
      if (result.status === "error") {
        setLoadError(result.error);
        return;
      }
      setTransactions(result.items);
    });
  }, [selectedAccountId]);

  const filtered = transactions.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.description ?? "").toLowerCase().includes(q) ||
      (t.category ?? "").toLowerCase().includes(q)
    );
  });

  const visible = filtered.slice(0, visibleCount);
  const totalExpense = filtered
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

  function startEdit(t: TransactionRecord) {
    setEditingId(t.id);
    setEditingCategory(t.category ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveCategory(id: string) {
    setEditingId(null);
    setSavingIds((s) => new Set([...s, id]));
    const result = await updateTransaction(id, {
      category: editingCategory.trim() || null,
    });
    setSavingIds((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    if (result.status !== "error" && result.items[0]) {
      const updated = result.items[0];
      setTransactions((ts) =>
        ts.map((t) => (t.id === id ? { ...t, category: updated.category } : t)),
      );
    }
  }

  if (!session) return null;

  return (
    <article className="panel ledger-panel">
      <h2>信用卡消費明細</h2>

      <div className="ledger-toolbar">
        <label className="ledger-toolbar-field">
          <span>帳戶</span>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <label className="ledger-toolbar-field">
          <span>搜尋</span>
          <input
            placeholder="商店名稱或分類..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          />
        </label>
      </div>

      {loading && <p>載入中...</p>}
      {loadError && <p>載入失敗：{loadError}</p>}

      {!loading && transactions.length > 0 && (
        <p className="ledger-summary">
          共 <strong>{filtered.length}</strong> 筆，消費合計{" "}
          <strong>NT$ {totalExpense.toLocaleString()}</strong>
          {filtered.some((t) => !t.category) && (
            <span className="ledger-uncategorized-hint">
              　（{filtered.filter((t) => !t.category).length} 筆未分類，點擊分類欄可編輯）
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
                  <th>說明</th>
                  <th className="ledger-th-amount">金額</th>
                  <th>分類</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id}>
                    <td className="ledger-date">{t.date}</td>
                    <td className="ledger-desc">{t.description ?? "—"}</td>
                    <td className={`ledger-amount ${t.amount < 0 ? "negative" : "positive"}`}>
                      {t.amount < 0 ? "−" : "+"}NT${" "}
                      {Math.abs(Number(t.amount)).toLocaleString()}
                    </td>
                    <td className="ledger-category-cell">
                      {editingId === t.id ? (
                        <input
                          autoFocus
                          className="ledger-category-input"
                          list="ledger-category-options"
                          value={editingCategory}
                          onChange={(e) => setEditingCategory(e.target.value)}
                          onBlur={() => void saveCategory(t.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveCategory(t.id);
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                      ) : (
                        <button
                          className={`ledger-category-badge${t.category ? "" : " uncategorized"}`}
                          onClick={() => startEdit(t)}
                          type="button"
                        >
                          {savingIds.has(t.id) ? "儲存中…" : (t.category ?? "未分類")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <datalist id="ledger-category-options">
            {CATEGORY_LABELS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          {filtered.length > visibleCount && (
            <button
              className="action-button secondary"
              style={{ marginTop: "12px" }}
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              type="button"
            >
              顯示更多（還有 {filtered.length - visibleCount} 筆）
            </button>
          )}
        </>
      )}

      {!loading && transactions.length === 0 && selectedAccountId && (
        <p>此帳戶尚無交易記錄。請先透過 Gmail 帳單同步匯入信用卡帳單。</p>
      )}
    </article>
  );
}
