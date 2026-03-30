import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountRecord, TransactionRecord } from "@hearth/shared";
import { transactionCategories } from "@hearth/shared";
import { fetchAccounts } from "../lib/accounts";
import {
  findMatchingCategoryRule,
  loadLearnedCategoryRules,
  rememberCategoryRule,
  type LearnedCategoryRule,
} from "../lib/category-rules";
import {
  clearTransactions,
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
} from "../lib/transactions";

const CATEGORY_LABELS = transactionCategories.map((category) => category.label);
const PAGE_SIZE = 40;
const BANK_SOURCE_PREFIX = "gmail_bank_";
const FUTURE_CARD_DATE_REPAIR_WINDOW_DAYS = 45;

const GMAIL_SOURCE_LABELS: Record<string, string> = {
  gmail_pdf_sinopac: "永豐",
  gmail_pdf_esun: "玉山",
  gmail_pdf_cathay: "國泰",
  gmail_pdf_taishin: "台新",
  gmail_pdf_ctbc: "中信",
  gmail_pdf_mega: "兆豐",
  credit_card_tw: "信用卡匯入",
};

const BANK_TONE_CLASS: Record<string, string> = {
  中信: "review-bank-tone-ctbc",
  台新: "review-bank-tone-taishin",
  永豐: "review-bank-tone-sinopac",
  玉山: "review-bank-tone-esun",
  國泰: "review-bank-tone-cathay",
  兆豐: "review-bank-tone-mega",
};

type ReviewScope = "all" | "uncategorized" | string;

function resolveTransactionLabel(transaction: TransactionRecord, accountName: string | undefined) {
  if (transaction.source && transaction.source in GMAIL_SOURCE_LABELS) {
    return GMAIL_SOURCE_LABELS[transaction.source];
  }
  return accountName ?? "未知";
}

function isCreditCardTransaction(
  transaction: TransactionRecord,
  accountTypeById: Map<string, string>,
) {
  if (transaction.source?.startsWith(BANK_SOURCE_PREFIX)) {
    return false;
  }

  if (transaction.source && transaction.source in GMAIL_SOURCE_LABELS) {
    return true;
  }

  return accountTypeById.get(transaction.account_id) === "cash_credit";
}

function formatMonthLabel(month: string) {
  return `${month.slice(0, 4)} / ${month.slice(5, 7)}`;
}

function formatCurrency(amount: number) {
  return `NT$ ${Math.abs(amount).toLocaleString()}`;
}

function formatAmountText(amount: number) {
  return `${amount < 0 ? "-" : "+"}${formatCurrency(amount)}`;
}

function formatDateLabel(date: string) {
  return `${date.slice(5, 7)}/${date.slice(8, 10)}`;
}

function shiftDateBackOneYear(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  parsed.setFullYear(parsed.getFullYear() - 1);
  return parsed.toISOString().slice(0, 10);
}

function normalizeCreditCardDisplayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  const futureThreshold = new Date();
  futureThreshold.setDate(futureThreshold.getDate() + FUTURE_CARD_DATE_REPAIR_WINDOW_DAYS);

  return parsed > futureThreshold ? shiftDateBackOneYear(date) : date;
}

function getDefaultScope(transactions: TransactionRecord[]) {
  return transactions.some((transaction) => !transaction.category) ? "uncategorized" : "all";
}

export function CreditCardLedgerPanel({ session }: { session: Session | null }) {
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [activeScope, setActiveScope] = useState<ReviewScope>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  const [learnedRules, setLearnedRules] = useState<LearnedCategoryRule[]>([]);
  const autoAppliedRuleKeys = useRef(new Set<string>());

  const creditAccounts = accounts.filter((account) => account.type === "cash_credit");
  const accountTypeById = new Map(accounts.map((account) => [account.id, account.type]));
  const accountNameMap = new Map(creditAccounts.map((account) => [account.id, account.name]));
  const creditTransactions = transactions
    .filter((transaction) => isCreditCardTransaction(transaction, accountTypeById))
    .map((transaction) => ({
      ...transaction,
      date: normalizeCreditCardDisplayDate(transaction.date),
    }))
    .sort((left, right) => right.date.localeCompare(left.date) || Math.abs(right.amount) - Math.abs(left.amount));

  const recentMonthsDesc = [...new Set(creditTransactions.map((transaction) => transaction.date.slice(0, 7)))]
    .sort()
    .reverse()
    .slice(0, 4);
  const availableMonths = recentMonthsDesc.slice().reverse();

  useEffect(() => {
    setLearnedRules(loadLearnedCategoryRules(session));
    autoAppliedRuleKeys.current.clear();
  }, [session]);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setLoadError(null);

      const [accountsResult, transactionsResult] = await Promise.all([
        fetchAccounts(),
        fetchTransactions(),
      ]);

      if (cancelled) return;

      if (accountsResult.status === "error") {
        setLoadError(accountsResult.error);
        setLoading(false);
        return;
      }

      if (transactionsResult.status === "error") {
        setLoadError(transactionsResult.error);
        setLoading(false);
        return;
      }

      setAccounts(accountsResult.items);
      setTransactions(transactionsResult.items);
      setLoading(false);
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (recentMonthsDesc.length === 0) {
      setSelectedMonth("");
      setActiveScope("all");
      return;
    }

    if (!recentMonthsDesc.includes(selectedMonth)) {
      const nextMonth = recentMonthsDesc[0];
      const nextMonthTransactions = creditTransactions.filter((transaction) => transaction.date.startsWith(nextMonth));
      setSelectedMonth(nextMonth);
      setActiveScope(getDefaultScope(nextMonthTransactions));
      setVisibleCount(PAGE_SIZE);
    }
  }, [recentMonthsDesc, creditTransactions, selectedMonth]);

  if (!session) return null;

  const monthTransactions = selectedMonth
    ? creditTransactions.filter((transaction) => transaction.date.startsWith(selectedMonth))
    : creditTransactions;
  const availableBanks = [...new Set(
    monthTransactions.map((transaction) => resolveTransactionLabel(transaction, accountNameMap.get(transaction.account_id))),
  )].sort();
  const filteredTransactions = monthTransactions.filter((transaction) => {
    if (activeScope === "all") return true;
    if (activeScope === "uncategorized") return !transaction.category;
    return resolveTransactionLabel(transaction, accountNameMap.get(transaction.account_id)) === activeScope;
  });

  const visibleTransactions = filteredTransactions.slice(0, visibleCount);
  const groupedVisibleTransactions = new Map<string, TransactionRecord[]>();
  for (const transaction of visibleTransactions) {
    const label = resolveTransactionLabel(transaction, accountNameMap.get(transaction.account_id));
    if (!groupedVisibleTransactions.has(label)) groupedVisibleTransactions.set(label, []);
    groupedVisibleTransactions.get(label)!.push(transaction);
  }

  const monthExpenseTransactions = monthTransactions.filter((transaction) => transaction.amount < 0);
  const monthExpenseTotal = monthExpenseTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const uncategorizedCount = monthTransactions.filter((transaction) => !transaction.category).length;
  const largestExpense = monthExpenseTransactions.reduce<TransactionRecord | null>((largest, transaction) => {
    if (!largest || Math.abs(transaction.amount) > Math.abs(largest.amount)) {
      return transaction;
    }
    return largest;
  }, null);

  const categoryTotals = transactionCategories
    .map((category) => {
      const amount = monthTransactions
        .filter((transaction) => transaction.amount < 0 && transaction.category === category.label)
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

      return {
        category: category.label,
        amount,
      };
    })
    .filter((item) => item.amount > 0)
    .sort((left, right) => right.amount - left.amount);

  const bankTotals = availableBanks
    .map((bank) => {
      const amount = monthTransactions
        .filter((transaction) =>
          transaction.amount < 0 &&
          resolveTransactionLabel(transaction, accountNameMap.get(transaction.account_id)) === bank)
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

      const count = monthTransactions.filter((transaction) =>
        resolveTransactionLabel(transaction, accountNameMap.get(transaction.account_id)) === bank).length;

      return { bank, amount, count };
    })
    .filter((item) => item.count > 0)
    .sort((left, right) => right.amount - left.amount);

  const trendMonths = recentMonthsDesc.slice().reverse();
  const monthTrend = trendMonths.map((month) => {
    const monthLabel = formatMonthLabel(month).replace(" / ", "/");
    const bankBreakdown = [...new Set(
      creditTransactions
        .filter((transaction) => transaction.date.startsWith(month))
        .map((transaction) => resolveTransactionLabel(transaction, accountNameMap.get(transaction.account_id))),
    )]
      .sort()
      .map((bank) => ({
        bank,
        amount: creditTransactions
          .filter((transaction) =>
            transaction.date.startsWith(month) &&
            transaction.amount < 0 &&
            resolveTransactionLabel(transaction, accountNameMap.get(transaction.account_id)) === bank)
          .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
      }))
      .filter((item) => item.amount > 0)
      .sort((left, right) => right.amount - left.amount);

    return {
      month,
      label: monthLabel,
      total: bankBreakdown.reduce((sum, item) => sum + item.amount, 0),
      bankBreakdown,
    };
  });

  const topBankAmount = bankTotals[0]?.amount ?? 0;
  const topCategoryAmount = categoryTotals[0]?.amount ?? 0;
  const topTrendAmount = monthTrend.reduce((max, item) => Math.max(max, item.total), 0);
  const categorizedExpense = categoryTotals.reduce((sum, item) => sum + item.amount, 0);
  const coverageRatio = monthExpenseTotal > 0 ? categorizedExpense / monthExpenseTotal : 0;

  async function autoApplyLearnedRules() {
    if (learnedRules.length === 0) {
      return;
    }

    const pendingMatches = creditTransactions
      .filter((transaction) => !transaction.category)
      .map((transaction) => ({
        transaction,
        rule: findMatchingCategoryRule(transaction, learnedRules, "credit"),
      }))
      .filter((item): item is { transaction: TransactionRecord; rule: LearnedCategoryRule } => Boolean(item.rule))
      .filter((item) => !autoAppliedRuleKeys.current.has(`${item.transaction.id}:${item.rule.category}`));

    if (pendingMatches.length === 0) {
      return;
    }

    const categoryById = new Map(pendingMatches.map((item) => [item.transaction.id, item.rule.category]));
    pendingMatches.forEach((item) => autoAppliedRuleKeys.current.add(`${item.transaction.id}:${item.rule.category}`));

    setTransactions((current) =>
      current.map((item) =>
        categoryById.has(item.id) ? { ...item, category: categoryById.get(item.id) ?? item.category } : item,
      ),
    );

    for (const item of pendingMatches) {
      const result = await updateTransaction(item.transaction.id, { category: item.rule.category });
      if (result.status === "error") {
        setTransactions((current) =>
          current.map((tx) => (tx.id === item.transaction.id ? { ...tx, category: null } : tx)),
        );
        setLoadError(result.error);
      }
    }
  }

  useEffect(() => {
    void autoApplyLearnedRules();
  }, [learnedRules, transactions]);

  async function assignCategory(transaction: TransactionRecord, category: string | null) {
    const previousCategory = transaction.category;
    setEditingId(null);
    setSavingIds((current) => new Set([...current, transaction.id]));
    setTransactions((current) =>
      current.map((item) =>
        item.id === transaction.id ? { ...item, category } : item,
      ),
    );

    const result = await updateTransaction(transaction.id, { category });
    setSavingIds((current) => {
      const next = new Set(current);
      next.delete(transaction.id);
      return next;
    });

    if (result.status === "error") {
      setTransactions((current) =>
        current.map((item) =>
          item.id === transaction.id ? { ...item, category: previousCategory } : item,
        ),
      );
      setLoadError(result.error);
      return;
    }

    const updated = result.items[0];
    if (updated) {
      setTransactions((current) =>
        current.map((item) =>
          item.id === transaction.id ? { ...item, category: updated.category } : item,
        ),
      );
    }

    if (category) {
      setLearnedRules((current) => rememberCategoryRule(session, current, transaction, category, "credit"));
    }
  }

  async function handleDelete(id: string) {
    setDeletingIds((current) => new Set([...current, id]));
    const result = await deleteTransaction(id);
    setDeletingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });

    if (result.status === "error") {
      setLoadError(result.error);
      return;
    }

    setTransactions((current) => current.filter((transaction) => transaction.id !== id));
  }

  async function handleClearAll() {
    if (creditAccounts.length === 0 || creditTransactions.length === 0) {
      return;
    }

    if (!window.confirm(`確定要清空全部信用卡交易嗎？目前共有 ${creditTransactions.length} 筆，這個動作無法復原。`)) {
      return;
    }

    setClearing(true);
    for (const account of creditAccounts) {
      const result = await clearTransactions(account.id);
      if (result.status === "error") {
        setLoadError(result.error);
        break;
      }
    }
    setTransactions((current) => current.filter((transaction) => !isCreditCardTransaction(transaction, accountTypeById)));
    setClearing(false);
  }

  return (
    <article className="panel ledger-panel review-panel">
      <div className="review-header">
        <div>
          <h2>信用卡消費明細</h2>
          <p className="review-panel-copy">先處理本月未分類交易，再讓分類結果自然長出支出結構。手動分過的相同敘述，之後會自動套用。</p>
        </div>
        <div className="review-month-tabs" role="tablist" aria-label="信用卡月份">
          {availableMonths.map((month) => (
            <button
              key={month}
              className={`review-month-tab${selectedMonth === month ? " active" : ""}`}
              onClick={() => {
                const nextMonthTransactions = creditTransactions.filter((transaction) => transaction.date.startsWith(month));
                setSelectedMonth(month);
                setActiveScope(getDefaultScope(nextMonthTransactions));
                setEditingId(null);
                setVisibleCount(PAGE_SIZE);
              }}
              type="button"
            >
              {formatMonthLabel(month)}
            </button>
          ))}
        </div>
      </div>

      <div className="review-summary-grid">
        <section className="review-summary-card">
          <p>本月總支出</p>
          <strong className="negative">{formatCurrency(monthExpenseTotal)}</strong>
          <span>{selectedMonth ? `${formatMonthLabel(selectedMonth)} 已入帳消費` : "尚無資料"}</span>
        </section>
        <section className="review-summary-card">
          <p>交易筆數</p>
          <strong>{monthTransactions.length} 筆</strong>
          <span>{bankTotals[0] ? `最多來自 ${bankTotals[0].bank} ${bankTotals[0].count} 筆` : "尚無交易"}</span>
        </section>
        <section className="review-summary-card">
          <p>待分類</p>
          <strong className={uncategorizedCount > 0 ? "warning" : ""}>{uncategorizedCount} 筆</strong>
          <span>{uncategorizedCount > 0 ? "預設聚焦未分類" : "本月已全數分類"}</span>
        </section>
        <section className="review-summary-card">
          <p>最大單筆</p>
          <strong>{largestExpense ? formatCurrency(largestExpense.amount) : "NT$ 0"}</strong>
          <span>{largestExpense?.description ?? "尚無資料"}</span>
        </section>
      </div>

      {loadError && <p>載入失敗：{loadError}</p>}
      {loading && <p>載入中...</p>}

      {!loading && creditTransactions.length > 0 && (
        <div className="review-workspace">
          <section className="review-main-card">
            <div className="review-section-header">
              <div>
                <h3>交易列表</h3>
                <p>{activeScope === "uncategorized" ? `${uncategorizedCount} 筆待分類，建議先清完再看整體分布。` : `目前顯示 ${filteredTransactions.length} 筆交易。`}</p>
              </div>
              <div className="review-inline-meta">
                {uncategorizedCount > 0 && <span className="review-count-pill">{uncategorizedCount} 未分類</span>}
                <button
                  className="action-button secondary review-clear-button"
                  disabled={clearing}
                  onClick={() => void handleClearAll()}
                  type="button"
                >
                  {clearing ? "清除中..." : "清空信用卡交易"}
                </button>
              </div>
            </div>

            <div className="review-scope-tabs">
              <button
                className={`review-scope-tab${activeScope === "all" ? " active" : ""}`}
                onClick={() => {
                  setActiveScope("all");
                  setEditingId(null);
                  setVisibleCount(PAGE_SIZE);
                }}
                type="button"
              >
                全部
              </button>
              <button
                className={`review-scope-tab${activeScope === "uncategorized" ? " active" : ""}`}
                onClick={() => {
                  setActiveScope("uncategorized");
                  setEditingId(null);
                  setVisibleCount(PAGE_SIZE);
                }}
                type="button"
              >
                未分類
              </button>
              {availableBanks.map((bank) => (
                <button
                  key={bank}
                  className={`review-scope-tab${activeScope === bank ? " active" : ""}`}
                  onClick={() => {
                    setActiveScope(bank);
                    setEditingId(null);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  type="button"
                >
                  {bank}
                </button>
              ))}
            </div>

            <div className="review-list-shell">
              {[...groupedVisibleTransactions.entries()].map(([bank, groupTransactions]) => {
                const bankExpense = groupTransactions
                  .filter((transaction) => transaction.amount < 0)
                  .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

                return (
                  <section key={bank} className="review-bank-group">
                    <div className="review-bank-group-header">
                      <div className="review-bank-group-title">
                        <span className={`review-bank-dot ${BANK_TONE_CLASS[bank] ?? ""}`} />
                        <strong>{bank}</strong>
                      </div>
                      <span className="review-bank-group-meta">
                        {groupTransactions.length} 筆 · {formatCurrency(bankExpense)}
                      </span>
                    </div>

                    <div className="review-transaction-list">
                      {groupTransactions.map((transaction) => (
                        <article
                          key={transaction.id}
                          className={`review-transaction-row${transaction.category ? "" : " is-uncategorized"}`}
                        >
                          <div className="review-row-date">{formatDateLabel(transaction.date)}</div>
                          <div className="review-row-desc">
                            <strong title={transaction.description ?? "未命名交易"}>{transaction.description ?? "未命名交易"}</strong>
                            <span>{transaction.category ?? "尚未分類"}</span>
                          </div>
                          <div className={`review-row-amount ${transaction.amount < 0 ? "negative" : "positive"}`}>
                            {formatAmountText(transaction.amount)}
                          </div>
                          <div className="review-row-actions">
                            {editingId === transaction.id ? (
                              <div className="review-category-picker">
                                {CATEGORY_LABELS.map((category) => (
                                  <button
                                    key={category}
                                    className="review-category-option"
                                    onClick={() => void assignCategory(transaction, category)}
                                    type="button"
                                  >
                                    {category}
                                  </button>
                                ))}
                                <button
                                  className="review-category-option subtle"
                                  onClick={() => setEditingId(null)}
                                  type="button"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                className={`review-assign-pill${transaction.category ? " assigned" : ""}`}
                                disabled={savingIds.has(transaction.id)}
                                onClick={() => setEditingId(transaction.id)}
                                type="button"
                              >
                                {savingIds.has(transaction.id)
                                  ? "儲存中..."
                                  : transaction.category
                                    ? transaction.category
                                    : "+ 指派分類"}
                              </button>
                            )}
                            <button
                              className="ledger-delete-btn always-visible"
                              disabled={deletingIds.has(transaction.id)}
                              onClick={() => void handleDelete(transaction.id)}
                              type="button"
                              aria-label="刪除"
                            >
                              ×
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}

              {!loading && filteredTransactions.length === 0 && (
                <p className="review-empty-state">目前這個月份/篩選下沒有交易。</p>
              )}
            </div>

            {filteredTransactions.length > visibleCount && (
              <button
                className="action-button secondary review-load-more"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                type="button"
              >
                載入更多，剩餘 {filteredTransactions.length - visibleCount} 筆
              </button>
            )}
          </section>

          <aside className="review-side-column">
            <section className="review-side-card">
              <div className="review-section-header compact">
                <div>
                  <h3>月支出趨勢</h3>
                  <p>最近 4 個月信用卡支出</p>
                </div>
                <span className="review-coverage-pill">{trendMonths.length} 個月</span>
              </div>

              <div className="review-trend-chart">
                <div className="review-trend-y-axis">
                  {[1, 0.75, 0.5, 0.25, 0].map((ratio) => {
                    const value = topTrendAmount > 0 ? Math.round(topTrendAmount * ratio) : 0;
                    return (
                      <span key={ratio}>
                        {value >= 1000 ? `NT$${Math.round(value / 1000)}K` : `NT$${value}`}
                      </span>
                    );
                  })}
                </div>

                <div className="review-trend-plot">
                  {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
                    <div key={ratio} className="review-trend-grid-line" style={{ bottom: `${ratio * 100}%` }} />
                  ))}

                  <div className="review-trend-bars">
                    {monthTrend.map((item) => (
                      <div key={item.month} className="review-trend-column">
                        <div className={`review-trend-bar-shell${selectedMonth === item.month ? " active" : ""}`}>
                          <div
                            className="review-trend-bar"
                            style={{ height: `${topTrendAmount > 0 ? (item.total / topTrendAmount) * 100 : 0}%` }}
                          >
                            {item.bankBreakdown.map((bankItem) => (
                              <div
                                key={`${item.month}-${bankItem.bank}`}
                                className={`review-trend-segment ${BANK_TONE_CLASS[bankItem.bank] ?? "review-bank-tone-default"}`}
                                style={{ height: `${item.total > 0 ? (bankItem.amount / item.total) * 100 : 0}%` }}
                                title={`${item.label} ${bankItem.bank} ${formatCurrency(bankItem.amount)}`}
                              />
                            ))}
                          </div>
                        </div>
                        <span className="review-trend-label">{item.month.slice(5, 7)}月</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="review-side-card">
              <div className="review-section-header compact">
                <div>
                  <h3>消費類別分佈</h3>
                  <p>分類後自動更新</p>
                </div>
                <span className="review-coverage-pill">覆蓋率 {(coverageRatio * 100).toFixed(0)}%</span>
              </div>

              {uncategorizedCount > 0 && (
                <p className="review-side-note">目前仍有 {uncategorizedCount} 筆未分類，分布尚未完整。</p>
              )}

              <div className="review-bar-list">
                {(categoryTotals.length > 0 ? categoryTotals : CATEGORY_LABELS.slice(0, 4).map((category) => ({ category, amount: 0 }))).map((item) => (
                  <div key={item.category} className="review-bar-row">
                    <span>{item.category}</span>
                    <div className="review-bar-track">
                      <div
                        className="review-bar-fill review-bar-fill-category"
                        style={{ width: `${topCategoryAmount > 0 ? (item.amount / topCategoryAmount) * 100 : 0}%` }}
                      />
                    </div>
                    <strong>{formatCurrency(item.amount)}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="review-side-card">
              <div className="review-section-header compact">
                <div>
                  <h3>銀行支出比較</h3>
                  <p>本月信用卡支出分佈</p>
                </div>
              </div>

              <div className="review-bar-list">
                {bankTotals.map((item) => (
                  <div key={item.bank} className="review-bar-row bank">
                    <span className="review-bank-group-title">
                      <span className={`review-bank-dot ${BANK_TONE_CLASS[item.bank] ?? ""}`} />
                      <span>{item.bank}</span>
                    </span>
                    <div className="review-bar-track">
                      <div
                        className={`review-bar-fill ${BANK_TONE_CLASS[item.bank] ?? "review-bank-tone-default"}`}
                        style={{ width: `${topBankAmount > 0 ? (item.amount / topBankAmount) * 100 : 0}%` }}
                      />
                    </div>
                    <strong>{formatCurrency(item.amount)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}

      {!loading && creditTransactions.length === 0 && (
        <p>目前沒有信用卡交易。先從 Gmail 帳單同步或信用卡匯入開始。</p>
      )}
    </article>
  );
}
