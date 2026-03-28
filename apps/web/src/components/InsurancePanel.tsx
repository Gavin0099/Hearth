import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ParsedInsuranceRecord } from "@hearth/shared";
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

type InsuranceSnapshotItem = BankSnapshot & { data: ParsedInsuranceRecord[] };

const emptyForm: {
  bank: string;
  statementDate: string;
  insuranceType: "non-investment" | "investment";
  policyNo: string;
  company: string;
  productName: string;
  insuredPerson: string;
  startDate: string;
  endDate: string;
  currency: string;
  coverage: string;
  paymentPeriod: string;
  nextPremium: string;
  nextPaymentDate: string;
  accumulatedPremium: string;
} = {
  bank: "sinopac",
  statementDate: new Date().toISOString().slice(0, 7) + "-01",
  insuranceType: "non-investment",
  policyNo: "",
  company: "",
  productName: "",
  insuredPerson: "",
  startDate: "",
  endDate: "",
  currency: "TWD",
  coverage: "",
  paymentPeriod: "",
  nextPremium: "",
  nextPaymentDate: "",
  accumulatedPremium: "",
};

export function InsurancePanel({ session }: { session: Session | null }) {
  const [snapshots, setSnapshots] = useState<InsuranceSnapshotItem[]>([]);
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
        setSnapshots(items.filter((s) => s.type === "insurance") as InsuranceSnapshotItem[]);
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
    const record: ParsedInsuranceRecord = {
      insuranceType: form.insuranceType,
      policyNo: form.policyNo.trim(),
      company: form.company.trim(),
      productName: form.productName.trim(),
      insuredPerson: form.insuredPerson.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      currency: form.currency,
      coverage: Number(form.coverage.replace(/,/g, "")),
      paymentPeriod: form.paymentPeriod.trim(),
      nextPremium: Number(form.nextPremium.replace(/,/g, "")),
      nextPaymentDate: form.nextPaymentDate,
      accumulatedPremium: Number(form.accumulatedPremium.replace(/,/g, "")),
    };

    const existing = snapshots.find(
      (s) => s.bank === form.bank && s.statement_date.slice(0, 7) === form.statementDate.slice(0, 7),
    );
    const newData = existing ? [...(existing.data as ParsedInsuranceRecord[]), record] : [record];
    await saveBankSnapshot(form.bank, "insurance", form.statementDate, newData);

    const items = await fetchBankSnapshots();
    setSnapshots(items.filter((s) => s.type === "insurance") as InsuranceSnapshotItem[]);
    setForm(emptyForm);
    setShowForm(false);
    setSaving(false);
  }

  if (!session) return null;

  const byBank = new Map<string, InsuranceSnapshotItem[]>();
  for (const snap of snapshots) {
    if (!byBank.has(snap.bank)) byBank.set(snap.bank, []);
    byBank.get(snap.bank)!.push(snap);
  }

  return (
    <article className="panel">
      <h2>保險明細</h2>

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
              <span>類型</span>
              <select value={form.insuranceType}
                onChange={(e) => setForm((f) => ({ ...f, insuranceType: e.target.value as "non-investment" | "investment" }))}>
                <option value="non-investment">非投資型</option>
                <option value="investment">投資型</option>
              </select>
            </label>
            <label className="ledger-toolbar-field">
              <span>幣別</span>
              <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                <option value="TWD">TWD</option>
                <option value="USD">USD</option>
                <option value="JPY">JPY</option>
              </select>
            </label>
            <label className="ledger-toolbar-field">
              <span>保單號碼</span>
              <input value={form.policyNo} placeholder="P12****77401"
                onChange={(e) => setForm((f) => ({ ...f, policyNo: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>保險公司</span>
              <input value={form.company} placeholder="富邦人壽"
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>商品名稱</span>
              <input value={form.productName} placeholder="加倍安心醫療健康"
                onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>被保險人</span>
              <input value={form.insuredPerson} placeholder="P122****74"
                onChange={(e) => setForm((f) => ({ ...f, insuredPerson: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>保單生效日</span>
              <input type="date" value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>保單到期日</span>
              <input type="date" value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>主約保額</span>
              <input value={form.coverage} placeholder="2,000"
                onChange={(e) => setForm((f) => ({ ...f, coverage: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>繳費方式</span>
              <input value={form.paymentPeriod} placeholder="20年/年繳"
                onChange={(e) => setForm((f) => ({ ...f, paymentPeriod: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>下期應繳保費</span>
              <input value={form.nextPremium} placeholder="23,859"
                onChange={(e) => setForm((f) => ({ ...f, nextPremium: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field">
              <span>下期繳費日</span>
              <input type="date" value={form.nextPaymentDate}
                onChange={(e) => setForm((f) => ({ ...f, nextPaymentDate: e.target.value }))} />
            </label>
            <label className="ledger-toolbar-field" style={{ gridColumn: "span 2" }}>
              <span>累計已繳保費</span>
              <input value={form.accumulatedPremium} placeholder="418,433"
                onChange={(e) => setForm((f) => ({ ...f, accumulatedPremium: e.target.value }))} />
            </label>
          </div>
          <button
            className="action-button"
            type="button"
            disabled={saving || !form.policyNo}
            onClick={() => void handleAdd()}
          >
            {saving ? "儲存中..." : "儲存"}
          </button>
        </div>
      )}

      {loading && <p>載入中...</p>}
      {loadError && <p>載入失敗：{loadError}</p>}
      {!loading && snapshots.length === 0 && !showForm && (
        <p>尚無保險資料。請在 Gmail 同步中匯入永豐綜合對帳單，或點上方「手動新增」。</p>
      )}

      {[...byBank.entries()].map(([bank, bankSnaps]) => (
        <section key={bank} className="ledger-account-section">
          <h3 className="ledger-account-heading">{BANK_DISPLAY_NAMES[bank] ?? bank}</h3>
          {bankSnaps.map((snap) => {
            const records = Array.isArray(snap.data) ? snap.data : [];
            return (
              <div key={snap.id} style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
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
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {records.map((rec, idx) => (
                    <div key={idx} className="insurance-card">
                      <div className="insurance-card-header">
                        <span style={{ fontWeight: 600 }}>{rec.policyNo}</span>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted, #888)" }}>
                          {rec.insuranceType === "investment" ? "投資型" : "非投資型"}
                        </span>
                      </div>
                      <div className="insurance-card-body">
                        <div className="insurance-row">
                          <span className="label">保險公司</span>
                          <span>{rec.company || "—"}</span>
                        </div>
                        <div className="insurance-row">
                          <span className="label">商品名稱</span>
                          <span>{rec.productName || "—"}</span>
                        </div>
                        <div className="insurance-row">
                          <span className="label">被保險人</span>
                          <span>{rec.insuredPerson || "—"}</span>
                        </div>
                        <div className="insurance-row">
                          <span className="label">保單期間</span>
                          <span>{formatDate(rec.startDate)} ～ {formatDate(rec.endDate)}</span>
                        </div>
                        <div className="insurance-row">
                          <span className="label">幣別 / 主約保額</span>
                          <span>{rec.currency} {rec.coverage > 0 ? formatAmount(rec.coverage) : "—"}</span>
                        </div>
                        <div className="insurance-row">
                          <span className="label">繳費方式</span>
                          <span>{rec.paymentPeriod || "—"}</span>
                        </div>
                        <div className="insurance-row">
                          <span className="label">下期應繳保費</span>
                          <span>
                            {rec.nextPremium > 0 ? formatAmount(rec.nextPremium) : "—"}
                            {rec.nextPaymentDate ? `（${formatDate(rec.nextPaymentDate)}）` : ""}
                          </span>
                        </div>
                        <div className="insurance-row">
                          <span className="label">累計已繳保費</span>
                          <span>{rec.accumulatedPremium > 0 ? formatAmount(rec.accumulatedPremium) : "—"}</span>
                        </div>
                      </div>
                    </div>
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
