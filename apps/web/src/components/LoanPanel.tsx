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

type LoanSnapshotItem = BankSnapshot & { data: ParsedLoanRecord[] };

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

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);
    fetchBankSnapshots()
      .then((items) => {
        setSnapshots(items.filter((s) => s.type === "loan") as LoanSnapshotItem[]);
        setLoading(false);
      })
      .catch((err: Error) => { setLoadError(err.message); setLoading(false); });
  }, [session]);

  async function handleDelete(id: string) {
    setDeletingIds((prev) => new Set([...prev, id]));
    await deleteBankSnapshot(id);
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
    setDeletingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  async function handleAdd() {
    setSaving(true);
    const record: ParsedLoanRecord = {
      accountNo: form.accountNo.trim(),
      paymentDate: form.paymentDate,
      paymentAmount: Number(form.paymentAmount.replace(/,/g, "")),
      principal: Number(form.principal.replace(/,/g, "")),
      interest: Number(form.interest.replace(/,/g, "")),
      penalty: Number(form.penalty.replace(/,/g, "")),
      remainingBalance: Number(form.remainingBalance.replace(/,/g, "")),
    };

    // 找出同一 bank + statementDate 的現有快照，合併進去
    const existing = snapshots.find(
      (s) => s.bank === form.bank && s.statement_date.slice(0, 7) === form.statementDate.slice(0, 7),
    );
    const newData = existing ? [...(existing.data as ParsedLoanRecord[]), record] : [record];
    await saveBankSnapshot(form.bank, "loan", form.statementDate, newData);

    // 重新載入
    const items = await fetchBankSnapshots();
    setSnapshots(items.filter((s) => s.type === "loan") as LoanSnapshotItem[]);
    setForm(emptyForm);
    setShowForm(false);
    setSaving(false);
  }

  if (!session) return null;

  const byBank = new Map<string, LoanSnapshotItem[]>();
  for (const snap of snapshots) {
    if (!byBank.has(snap.bank)) byBank.set(snap.bank, []);
    byBank.get(snap.bank)!.push(snap);
  }

  return (
    <article className="panel">
      <h2>貸款明細</h2>

      <div style={{ marginBottom: "16px" }}>
        <button
          className="action-button"
          type="button"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "取消" : "+ 手動新增"}
        </button>
      </div>

      {showForm && (
        <div className="ledger-toolbar" style={{ flexDirection: "column", alignItems: "stretch", gap: "10px", marginBottom: "20px", padding: "16px", border: "1px solid var(--border, #ddd)", borderRadius: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
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
        <section key={bank} className="ledger-account-section">
          <h3 className="ledger-account-heading">{BANK_DISPLAY_NAMES[bank] ?? bank}</h3>
          {bankSnaps.map((snap) => {
            const records = Array.isArray(snap.data) ? snap.data : [];
            return (
              <div key={snap.id} style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted, #888)" }}>
                    {formatDate(snap.statement_date)} 對帳單
                  </span>
                  <button
                    className="ledger-delete-btn"
                    disabled={deletingIds.has(snap.id)}
                    onClick={() => void handleDelete(snap.id)}
                    type="button"
                    aria-label="刪除此期對帳單"
                  >
                    ×
                  </button>
                </div>
                <div className="ledger-table-wrapper">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>帳號</th>
                        <th>繳款日</th>
                        <th className="ledger-th-amount">繳款金額</th>
                        <th className="ledger-th-amount">攤還本金</th>
                        <th className="ledger-th-amount">繳息金額</th>
                        <th className="ledger-th-amount">違約金</th>
                        <th className="ledger-th-amount">本金餘額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((rec, idx) => (
                        <tr key={idx}>
                          <td className="ledger-desc">{rec.accountNo}</td>
                          <td className="ledger-date">{formatDate(rec.paymentDate)}</td>
                          <td className="ledger-amount">{formatAmount(rec.paymentAmount)}</td>
                          <td className="ledger-amount">{formatAmount(rec.principal)}</td>
                          <td className="ledger-amount negative">{formatAmount(rec.interest)}</td>
                          <td className="ledger-amount">{formatAmount(rec.penalty)}</td>
                          <td className="ledger-amount positive">{formatAmount(rec.remainingBalance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </article>
  );
}
