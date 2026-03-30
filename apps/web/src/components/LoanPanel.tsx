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

  const byBank = new Map<string, LoanSnapshotItem[]>();
  for (const snap of snapshots) {
    if (!byBank.has(snap.bank)) byBank.set(snap.bank, []);
    byBank.get(snap.bank)!.push(snap);
  }

  return (
    <article className="panel detail-panel ledger-panel">
      <h2>貸款明細</h2>
      <p className="detail-panel-intro">按銀行與對帳單月份整理貸款快照，方便快速比對每月餘額、繳款與本金攤還。</p>

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

      {loading && <p>載入中...</p>}
      {loadError && <p>載入失敗：{loadError}</p>}
      {!loading && snapshots.length === 0 && !showForm && (
        <p>尚無貸款資料。請在 Gmail 同步中匯入永豐綜合對帳單，或點上方「手動新增」。</p>
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
                        <button
                          className="ledger-delete-btn always-visible"
                          disabled={deletingIds.has(`${snap.id}-${idx}`)}
                          onClick={() => void handleDeleteRecord(snap, idx)}
                          type="button"
                          aria-label="刪除"
                        >×</button>
                      </div>

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
                    </section>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </article>
  );
}
