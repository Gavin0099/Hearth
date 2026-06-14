import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ParsedLoanRecord } from "@hearth/shared";
import { fetchBankSnapshots, deleteBankSnapshot, saveBankSnapshot, type BankSnapshot } from "../lib/bank-snapshots";

const BANK_DISPLAY_NAMES: Record<string, string> = {
  sinopac: "永豐",
  esun: "玉山",
  cathay: "國泰",
  taishin: "台新",
  ctbc: "中信",
  mega: "兆豐",
};

const BANK_KEYS = Object.keys(BANK_DISPLAY_NAMES);

function formatAmount(n: number): string {
  return n.toLocaleString("zh-TW");
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  return dateStr.replace(/-/g, "/");
}

function formatOptionalAmount(n: number): string {
  return n > 0 ? formatAmount(n) : "—";
}

function isBalanceSnapshot(record: ParsedLoanRecord): boolean {
  return record.scheduleType !== "amortization" && record.paymentAmount <= 0 && record.principal <= 0 && record.interest <= 0 && record.penalty <= 0;
}

function isAmortizationSeed(record: ParsedLoanRecord): boolean {
  return record.scheduleType === "amortization" && !!record.monthlyPayment && !!record.monthlyRate;
}

type ComputedAmortRow = {
  paymentDate: string;
  principal: number;
  interest: number;
  paymentAmount: number;
  remainingBalance: number;
  status: "past" | "current" | "future";
};

function computeAmortizationSchedule(seed: ParsedLoanRecord, today: Date = new Date()): ComputedAmortRow[] {
  if (!isAmortizationSeed(seed)) return [];
  const rate = seed.monthlyRate!;
  const pmt = seed.monthlyPayment!;
  const ref = new Date(seed.paymentDate);
  const day = ref.getDate();
  let year = ref.getFullYear();
  let month = ref.getMonth(); // 0-indexed
  let balance = seed.remainingBalance;
  const todayYM = today.getFullYear() * 12 + today.getMonth();
  const rows: ComputedAmortRow[] = [];
  while (balance > 1 && rows.length < 480) {
    month++;
    if (month > 11) { month = 0; year++; }
    const interest = Math.round(balance * rate);
    const principal = Math.min(pmt - interest, balance);
    const payment = principal + interest;
    balance = Math.max(0, balance - principal);
    const rowYM = year * 12 + month;
    const status = rowYM < todayYM ? "past" : rowYM === todayYM ? "current" : "future";
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    rows.push({ paymentDate: `${year}-${mm}-${dd}`, principal, interest, paymentAmount: payment, remainingBalance: balance, status });
  }
  return rows;
}

type LoanSnapshotItem = BankSnapshot & { data: ParsedLoanRecord[] };

function buildLoanRecordKey(record: ParsedLoanRecord): string {
  return [
    record.accountNo,
    record.paymentDate,
    record.paymentAmount,
    record.principal,
    record.interest,
    record.penalty,
    record.remainingBalance,
  ].join("|");
}

const emptyForm = {
  bank: "sinopac",
  statementDate: new Date().toISOString().slice(0, 7) + "-01",
  accountNo: "",
  paymentDate: "",
  paymentAmount: "",
  principal: "",
  interest: "",
  penalty: "0",
  remainingBalance: "",
};

export function LoanPanel({ session }: { session: Session | null }) {
  const [snapshots, setSnapshots] = useState<LoanSnapshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [expandedAmort, setExpandedAmort] = useState<Set<string>>(new Set());

  async function loadSnapshots() {
    setLoadError(null);
    const items = await fetchBankSnapshots();
    setSnapshots(items.filter((s) => s.type === "loan") as LoanSnapshotItem[]);
  }

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    void loadSnapshots()
      .then(() => setLoading(false))
      .catch((err: Error) => { setLoadError(err.message); setLoading(false); });
  }, [session]);

  useEffect(() => {
    const months = [...new Set(snapshots.map((snap) => snap.statement_date.slice(0, 7)))].sort().reverse().slice(0, 4);
    if (months.length > 0 && !months.includes(selectedMonth)) {
      setSelectedMonth(months[0]);
    }
  }, [selectedMonth, snapshots]);

  async function handleDeleteSnapshot(id: string) {
    setDeletingIds((prev) => new Set([...prev, id]));
    try {
      await deleteBankSnapshot(id);
      await loadSnapshots();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "刪除貸款明細失敗");
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  async function handleDeleteRecord(snap: LoanSnapshotItem, idx: number) {
    const key = `${snap.id}-${idx}`;
    setDeletingIds((prev) => new Set([...prev, key]));
    try {
      const newData = (snap.data as ParsedLoanRecord[]).filter((_, i) => i !== idx);
      if (newData.length === 0) {
        await deleteBankSnapshot(snap.id);
      } else {
        await saveBankSnapshot(snap.bank, "loan", snap.statement_date, newData);
      }
      await loadSnapshots();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "刪除貸款明細失敗");
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }

  async function handleAdd() {
    setSaving(true);
    try {
      const record: ParsedLoanRecord = {
        accountNo: form.accountNo.trim(),
        paymentDate: form.paymentDate,
        paymentAmount: Number(form.paymentAmount.replace(/,/g, "")),
        principal: Number(form.principal.replace(/,/g, "")),
        interest: Number(form.interest.replace(/,/g, "")),
        penalty: Number(form.penalty.replace(/,/g, "")),
        remainingBalance: Number(form.remainingBalance.replace(/,/g, "")),
      };

      const existing = snapshots.find(
        (s) => s.bank === form.bank && s.statement_date.slice(0, 7) === form.statementDate.slice(0, 7),
      );
      const newData = existing ? [...(existing.data as ParsedLoanRecord[]), record] : [record];
      await saveBankSnapshot(form.bank, "loan", form.statementDate, newData);
      await loadSnapshots();
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "儲存貸款明細失敗");
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  // Separate amortization seeds (one-time setup) from regular monthly snapshots
  type AmortSeed = { snap: LoanSnapshotItem; record: ParsedLoanRecord; snapIdx: number };
  const amortSeeds: AmortSeed[] = [];
  const regularSnapshots: LoanSnapshotItem[] = [];
  for (const snap of snapshots) {
    const records = Array.isArray(snap.data) ? snap.data : [];
    const seeds = records.map((r, i) => ({ rec: r, idx: i })).filter(({ rec }) => isAmortizationSeed(rec));
    if (seeds.length > 0) {
      seeds.forEach(({ rec, idx }) => amortSeeds.push({ snap, record: rec, snapIdx: idx }));
      const nonSeed = records.filter((r) => !isAmortizationSeed(r));
      if (nonSeed.length > 0) regularSnapshots.push({ ...snap, data: nonSeed });
    } else {
      regularSnapshots.push(snap);
    }
  }

  const availableMonths = [...new Set(regularSnapshots.map((snap) => snap.statement_date.slice(0, 7)))]
    .sort()
    .reverse()
    .slice(0, 4);

  const monthSnapshots = selectedMonth
    ? regularSnapshots.filter((snap) => snap.statement_date.startsWith(selectedMonth))
    : regularSnapshots;

  const byBank = new Map<string, LoanSnapshotItem[]>();
  for (const snap of monthSnapshots) {
    if (!byBank.has(snap.bank)) byBank.set(snap.bank, []);
    byBank.get(snap.bank)!.push(snap);
  }

  const today = new Date();
  const amortCurrentBalances = amortSeeds.map(({ record }) => {
    const rows = computeAmortizationSchedule(record, today);
    const pastOrCurrent = rows.filter((r) => r.status !== "future");
    const currentOrLast = pastOrCurrent[pastOrCurrent.length - 1] ?? rows[0];
    return currentOrLast?.remainingBalance ?? record.remainingBalance;
  });

  const monthRecords = monthSnapshots.flatMap((snap) => (Array.isArray(snap.data) ? snap.data : []));

  // Deduplicate by accountNo: keep only the latest record per account for balance totals
  function latestByAccount(records: ParsedLoanRecord[]): ParsedLoanRecord[] {
    const map = new Map<string, ParsedLoanRecord>();
    for (const r of records) {
      const existing = map.get(r.accountNo);
      if (!existing || r.paymentDate > existing.paymentDate) map.set(r.accountNo, r);
    }
    return [...map.values()];
  }

  const dedupedRecords = latestByAccount(monthRecords);
  const regularBalance = dedupedRecords.reduce((sum, r) => sum + r.remainingBalance, 0);
  const amortBalance = amortCurrentBalances.reduce((sum, b) => sum + b, 0);
  const totalRemainingBalance = regularBalance + amortBalance;
  const snapshotCount = dedupedRecords.length + amortSeeds.length;
  const bankCount = byBank.size + new Set(amortSeeds.map((s) => s.snap.bank)).size;
  const allRecordsForLargest = [
    ...dedupedRecords,
    ...amortSeeds.map(({ record }, i) => ({ ...record, remainingBalance: amortCurrentBalances[i] })),
  ];
  const largestSnapshot = allRecordsForLargest.reduce<ParsedLoanRecord | null>((largest, record) => {
    if (!largest || record.remainingBalance > largest.remainingBalance) {
      return record;
    }
    return largest;
  }, null);

  return (
    <article className="panel detail-panel ledger-panel review-panel loan-panel">
      <div className="review-header">
        <div>
          <h2>貸款明細</h2>
          <p className="detail-panel-intro panel-copy panel-copy--tight">按月份整理貸款餘額快照與還款明細，先確認每家銀行本月貸款狀態是否合理。</p>
        </div>
        <div className="review-month-tabs" role="tablist" aria-label="貸款月份">
          {availableMonths.map((month) => (
            <button
              key={month}
              className={`review-month-tab${selectedMonth === month ? " active" : ""}`}
              onClick={() => setSelectedMonth(month)}
              type="button"
            >
              {month.replace("-", " / ")}
            </button>
          ))}
        </div>
      </div>

      <div className="review-summary-grid">
        <section className="review-summary-card">
          <p>貸款筆數</p>
          <strong>{snapshotCount} 筆</strong>
          <span>{selectedMonth ? `${selectedMonth.replace("-", " / ")} 已匯入快照` : "尚無資料"}</span>
        </section>
        <section className="review-summary-card">
          <p>覆蓋銀行</p>
          <strong>{bankCount} 家</strong>
          <span>{bankCount > 0 ? "本月有貸款資料的銀行" : "尚未匯入"}</span>
        </section>
        <section className="review-summary-card">
          <p>本金餘額總計</p>
          <strong>{`NT$ ${formatAmount(totalRemainingBalance)}`}</strong>
          <span>僅統計目前顯示月份</span>
        </section>
        <section className="review-summary-card">
          <p>最大單筆餘額</p>
          <strong>{largestSnapshot ? `NT$ ${formatAmount(largestSnapshot.remainingBalance)}` : "NT$ 0"}</strong>
          <span>{largestSnapshot?.accountNo ?? "尚無資料"}</span>
        </section>
      </div>

      <div className="detail-panel-actions">
        <button
          className="action-button"
          type="button"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "取消" : "+ 手動新增"}
        </button>
      </div>

      {showForm && (
        <div className="ledger-toolbar detail-entry-form">
          <div className="detail-entry-grid">
            <label className="ledger-toolbar-field">
              <span>銀行</span>
              <select value={form.bank} onChange={(e) => setForm((f) => ({ ...f, bank: e.target.value }))}>
                {BANK_KEYS.map((k) => <option key={k} value={k}>{BANK_DISPLAY_NAMES[k]}</option>)}
              </select>
            </label>
            <label className="ledger-toolbar-field">
              <span>對帳單月份</span>
              <input type="month" value={form.statementDate.slice(0, 7)}
                onChange={(e) => setForm((f) => ({ ...f, statementDate: e.target.value + "-01" }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>帳號/分號</span>
              <input value={form.accountNo} placeholder="007-05*-**10734-*/420005"
                onChange={(e) => setForm((f) => ({ ...f, accountNo: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>繳款日</span>
              <input type="date" value={form.paymentDate}
                onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>繳款金額</span>
              <input value={form.paymentAmount} placeholder="38,570"
                onChange={(e) => setForm((f) => ({ ...f, paymentAmount: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>攤還本金</span>
              <input value={form.principal} placeholder="34,158"
                onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>繳息金額</span>
              <input value={form.interest} placeholder="4,412"
                onChange={(e) => setForm((f) => ({ ...f, interest: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>違約金</span>
              <input value={form.penalty} placeholder="0"
                onChange={(e) => setForm((f) => ({ ...f, penalty: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>本金餘額</span>
              <input value={form.remainingBalance} placeholder="2,327,230"
                onChange={(e) => setForm((f) => ({ ...f, remainingBalance: e.target.value }))} />
            </label>
          </div>
          <button
            className="action-button"
            type="button"
            disabled={saving || !form.accountNo || !form.paymentDate || !form.remainingBalance}
            onClick={() => void handleAdd()}
          >
            {saving ? "儲存中..." : "儲存"}
          </button>
        </div>
      )}

      {loading && <p className="panel-message panel-message--muted">載入中...</p>}
      {loadError && <p className="panel-message panel-message--error">載入失敗：{loadError}</p>}
      {!loading && snapshots.length === 0 && !showForm && (
        <p className="panel-message panel-message--muted">尚無貸款資料。請在 Gmail 同步中匯入永豐綜合對帳單，或點上方「手動新增」。</p>
      )}

      {[...byBank.entries()].map(([bank, bankSnaps]) => (
        <section key={bank} className="ledger-account-section detail-bank-section">
          <div className="detail-bank-header">
            <h3 className="ledger-account-heading">{BANK_DISPLAY_NAMES[bank] ?? bank}</h3>
            <span className="detail-bank-pill">{bankSnaps.length} 期對帳單</span>
          </div>
          {bankSnaps.map((snap) => {
            const records = Array.isArray(snap.data) ? snap.data : [];
            return (
              <div key={snap.id} className="snapshot-block">
                <div className="snapshot-header">
                  <div className="snapshot-meta">
                    <div className="snapshot-statement-date">{formatDate(snap.statement_date)} 對帳單</div>
                    <div className="snapshot-record-count">{records.length} 筆貸款快照</div>
                  </div>
                  <button
                    className="snapshot-delete-button"
                    disabled={deletingIds.has(snap.id)}
                    onClick={() => void handleDeleteSnapshot(snap.id)}
                    type="button"
                  >
                    刪除此月
                  </button>
                </div>
                <div className="detail-card-list detail-card-list-compact">
                  {records.map((rec, idx) => (
                    <section key={buildLoanRecordKey(rec)} className="detail-card loan-card">
                      <div className="detail-card-header">
                        <div>
                          <div className="detail-card-title">帳號</div>
                          <div className="detail-card-emphasis loan-account-number">{rec.accountNo}</div>
                        </div>
                        {isBalanceSnapshot(rec) && (
                          <span className="detail-card-badge">餘額快照</span>
                        )}
                        <button
                          className="ledger-delete-btn always-visible"
                          disabled={deletingIds.has(`${snap.id}-${idx}`)}
                          onClick={() => void handleDeleteRecord(snap, idx)}
                          type="button"
                          aria-label="刪除"
                        >×</button>
                      </div>

                      {isBalanceSnapshot(rec) ? (
                        <div className="detail-metric-grid loan-snapshot-grid">
                          <div className="detail-metric">
                            <span className="label">資料日期</span>
                            <strong>{formatDate(rec.paymentDate)}</strong>
                          </div>
                          <div className="detail-metric">
                            <span className="label">對帳單月份</span>
                            <strong>{formatDate(snap.statement_date)}</strong>
                          </div>
                          <div className="detail-metric loan-balance-metric">
                            <span className="label">本金餘額</span>
                            <strong className="positive">TWD {formatAmount(rec.remainingBalance)}</strong>
                          </div>
                        </div>
                      ) : (
                        <div className="detail-metric-grid">
                          <div className="detail-metric">
                            <span className="label">資料日 / 繳款日</span>
                            <strong>{formatDate(rec.paymentDate)}</strong>
                          </div>
                          <div className="detail-metric">
                            <span className="label">本金餘額</span>
                            <strong className="positive">TWD {formatAmount(rec.remainingBalance)}</strong>
                          </div>
                          <div className="detail-metric">
                            <span className="label">繳款金額</span>
                            <strong>{formatOptionalAmount(rec.paymentAmount)}</strong>
                          </div>
                          <div className="detail-metric">
                            <span className="label">攤還本金</span>
                            <strong>{formatOptionalAmount(rec.principal)}</strong>
                          </div>
                          <div className="detail-metric">
                            <span className="label">繳息金額</span>
                            <strong className={rec.interest > 0 ? "negative" : undefined}>{formatOptionalAmount(rec.interest)}</strong>
                          </div>
                          <div className="detail-metric">
                            <span className="label">違約金</span>
                            <strong>{formatOptionalAmount(rec.penalty)}</strong>
                          </div>
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}

      {!loading && snapshots.length > 0 && monthSnapshots.length === 0 && amortSeeds.length === 0 && (
        <p className="panel-message panel-message--muted">這個月份目前沒有貸款資料。</p>
      )}

      {amortSeeds.length > 0 && (
        <section className="ledger-account-section detail-bank-section amort-section">
          <div className="detail-bank-header">
            <h3 className="ledger-account-heading">自動計算攤還</h3>
            <span className="detail-bank-pill amort-pill">依利率自動推算</span>
          </div>
          {amortSeeds.map(({ snap, record, snapIdx }, seedI) => {
            const key = `${snap.id}-amort-${snapIdx}`;
            const expanded = expandedAmort.has(key);
            const rows = computeAmortizationSchedule(record, today);
            const currentRow = rows.find((r) => r.status === "current");
            const currentBalance = currentRow?.remainingBalance ?? record.remainingBalance;
            const annualRate = (record.monthlyRate! * 12 * 100).toFixed(2);
            const remainingMonths = rows.filter((r) => r.status !== "past").length;
            return (
              <div key={key} className="snapshot-block amort-block">
                <div className="snapshot-header">
                  <div className="snapshot-meta">
                    <div className="snapshot-statement-date">{BANK_DISPLAY_NAMES[snap.bank] ?? snap.bank}　{record.accountNo}</div>
                    <div className="snapshot-record-count">年利率 {annualRate}%　月繳 NT$ {formatAmount(record.monthlyPayment!)}　剩 {remainingMonths} 期</div>
                  </div>
                  <div className="amort-header-actions">
                    <button
                      className="action-button action-button--small"
                      type="button"
                      onClick={() => setExpandedAmort((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key); else next.add(key);
                        return next;
                      })}
                    >
                      {expanded ? "收合" : "展開攤還表"}
                    </button>
                    <button
                      className="snapshot-delete-button"
                      disabled={deletingIds.has(key)}
                      onClick={async () => {
                        setDeletingIds((prev) => new Set([...prev, key]));
                        try {
                          const allRecords = Array.isArray(snap.data) ? snap.data : [];
                          const newData = allRecords.filter((_, i) => i !== snapIdx);
                          if (newData.length === 0) await deleteBankSnapshot(snap.id);
                          else await saveBankSnapshot(snap.bank, "loan", snap.statement_date, newData);
                          await loadSnapshots();
                        } catch (err) {
                          setLoadError(err instanceof Error ? err.message : "刪除失敗");
                        } finally {
                          setDeletingIds((prev) => { const next = new Set(prev); next.delete(key); return next; });
                        }
                      }}
                      type="button"
                    >
                      刪除
                    </button>
                  </div>
                </div>
                <div className="amort-summary-row">
                  <div className="detail-metric">
                    <span className="label">目前餘額（推算）</span>
                    <strong className="positive">TWD {formatAmount(currentBalance)}</strong>
                  </div>
                  {currentRow && (
                    <>
                      <div className="detail-metric">
                        <span className="label">本月繳款日</span>
                        <strong>{formatDate(currentRow.paymentDate)}</strong>
                      </div>
                      <div className="detail-metric">
                        <span className="label">本月本金</span>
                        <strong>{formatAmount(currentRow.principal)}</strong>
                      </div>
                      <div className="detail-metric">
                        <span className="label">本月利息</span>
                        <strong className="negative">{formatAmount(currentRow.interest)}</strong>
                      </div>
                    </>
                  )}
                  <div className="detail-metric">
                    <span className="label">參考資料日</span>
                    <strong>{formatDate(record.paymentDate)}</strong>
                  </div>
                </div>
                {expanded && (
                  <div className="amort-table-wrapper">
                    <table className="amort-table">
                      <thead>
                        <tr>
                          <th>繳款日</th>
                          <th className="amort-num">本金</th>
                          <th className="amort-num">利息</th>
                          <th className="amort-num">繳款</th>
                          <th className="amort-num">餘額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.paymentDate} className={`amort-row amort-row--${row.status}`}>
                            <td>{formatDate(row.paymentDate)}</td>
                            <td className="amort-num">{formatAmount(row.principal)}</td>
                            <td className="amort-num negative">{formatAmount(row.interest)}</td>
                            <td className="amort-num">{formatAmount(row.paymentAmount)}</td>
                            <td className="amort-num">{formatAmount(row.remainingBalance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </article>
  );
}
