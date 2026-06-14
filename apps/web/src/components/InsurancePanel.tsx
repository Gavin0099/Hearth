import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ParsedInsuranceRecord, BenefitItem } from "@hearth/shared";
import { fetchBankSnapshots, deleteBankSnapshot, saveBankSnapshot, type BankSnapshot } from "../lib/bank-snapshots";

type CoverageCategory = "death" | "accidental" | "hospitalization" | "critical" | "cancer" | "disability";

const COVERAGE_CONFIG: Array<{ key: CoverageCategory; label: string; note: string; keywords: RegExp }> = [
  { key: "death",          label: "壽險身故",  note: "壽險保額合計",    keywords: /壽險|定期壽/        },
  { key: "accidental",     label: "意外身故",  note: "傷害險保額合計",  keywords: /傷害/               },
  { key: "hospitalization",label: "住院醫療",  note: "醫療險保額合計",  keywords: /住院|醫療|急診/     },
  { key: "critical",       label: "重大疾病",  note: "重大疾病一次金",  keywords: /重大疾病|重大傷病/  },
  { key: "cancer",         label: "癌症防癌",  note: "防癌保額合計",    keywords: /防癌|癌症/          },
  { key: "disability",     label: "失能長照",  note: "失能照護保額",    keywords: /失能|照護|長照/     },
];

type CoverageSummaryItem = { productName: string; coverage: number };
type CoverageSummaryData = Record<CoverageCategory, { total: number; items: CoverageSummaryItem[] }>;

type BenefitGroupEntry = {
  policyName: string;
  amount: number;
  unit: string;
  note?: string;
  receiptType?: string;
  sublabel?: string;
};

type BenefitGroup = {
  label: string;
  entries: BenefitGroupEntry[];
  hasReceiptConflict: boolean;
};

// Labels that should be merged into one display group
const BENEFIT_MERGE_GROUPS: Array<{ displayLabel: string; labels: string[] }> = [
  { displayLabel: "病房費 / 住院日額", labels: ["病房費", "病房費補貼", "住院醫療日額"] },
  { displayLabel: "意外身故 / 失能", labels: ["意外身故/失能", "意外身故/失能（附加）"] },
];

function resolveGroupLabel(label: string): string {
  for (const g of BENEFIT_MERGE_GROUPS) {
    if (g.labels.includes(label)) return g.displayLabel;
  }
  return label;
}

function groupBenefitsByLabel(records: ParsedInsuranceRecord[]): BenefitGroup[] {
  const map = new Map<string, BenefitGroupEntry[]>();
  for (const rec of records) {
    const benefits = rec.benefits as BenefitItem[] | undefined;
    if (!Array.isArray(benefits)) continue;
    for (const b of benefits) {
      const groupLabel = resolveGroupLabel(b.label);
      if (!map.has(groupLabel)) map.set(groupLabel, []);
      map.get(groupLabel)!.push({
        policyName: rec.productName,
        amount: b.amount,
        unit: b.unit,
        note: b.note,
        receiptType: b.receiptType,
        sublabel: groupLabel !== b.label ? b.label : undefined,
      });
    }
  }
  return [...map.entries()].map(([label, entries]) => {
    const types = new Set(entries.map((e) => e.receiptType).filter(Boolean));
    return { label, entries, hasReceiptConflict: types.has("正本") && types.has("副本") };
  });
}

function buildCoverageSummary(records: ParsedInsuranceRecord[]): CoverageSummaryData {
  const totals = Object.fromEntries(
    COVERAGE_CONFIG.map((c) => [c.key, { total: 0, items: [] as CoverageSummaryItem[] }]),
  ) as CoverageSummaryData;
  for (const rec of records) {
    for (const cfg of COVERAGE_CONFIG) {
      if (cfg.keywords.test(rec.productName)) {
        totals[cfg.key].total += rec.coverage;
        totals[cfg.key].items.push({ productName: rec.productName, coverage: rec.coverage });
        break;
      }
    }
  }
  return totals;
}

function getSubtypeLabel(productName: string): string {
  if (/初次罹患/.test(productName))       return "初次罹癌一次金";
  if (/加倍安心|富邦.*醫/.test(productName)) return "終身累計限額";
  if (/急診/.test(productName))           return "急診每次限額";
  if (/住院/.test(productName))           return "住院每次限額";
  if (/失能|照護|長照/.test(productName)) return "月給付型";
  if (/防癌/.test(productName))           return "防癌各項給付";
  if (/重大疾病|重大傷病/.test(productName)) return "重大疾病一次金";
  if (/傷害/.test(productName))           return "意外身故/失能";
  if (/壽險/.test(productName))           return "身故保障";
  return "保障型";
}

const DISABILITY_GRADES = [
  { level: "第1–3級", desc: "極嚴重失能", note: "日常生活完全依賴他人協助（臥床、植物人等）" },
  { level: "第4–6級", desc: "嚴重失能",   note: "吃飯、穿衣、如廁等日常生活需他人協助" },
  { level: "第7–11級",desc: "部分失能",   note: "肢體、視力、聽力等部分機能喪失" },
];

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

function buildInsuranceRecordKey(record: ParsedInsuranceRecord): string {
  return [
    record.insuranceType,
    record.policyNo,
    record.company,
    record.productName,
    record.insuredPerson,
    record.startDate,
    record.endDate,
    record.currency,
    record.coverage,
    record.paymentPeriod,
    record.nextPremium,
    record.nextPaymentDate,
    record.accumulatedPremium,
  ].join("|");
}

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
  const [selectedMonth, setSelectedMonth] = useState("");
  const [expandedCards, setExpandedCards] = useState<Set<CoverageCategory>>(new Set());

  function toggleCard(key: CoverageCategory) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function loadSnapshots() {
    setLoadError(null);
    const items = await fetchBankSnapshots();
    setSnapshots(items.filter((s) => s.type === "insurance") as InsuranceSnapshotItem[]);
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
      setLoadError(err instanceof Error ? err.message : "刪除保險明細失敗");
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  async function handleDeleteRecord(snap: InsuranceSnapshotItem, idx: number) {
    const key = `${snap.id}-${idx}`;
    setDeletingIds((prev) => new Set([...prev, key]));
    try {
      const newData = (snap.data as ParsedInsuranceRecord[]).filter((_, i) => i !== idx);
      if (newData.length === 0) {
        await deleteBankSnapshot(snap.id);
      } else {
        await saveBankSnapshot(snap.bank, "insurance", snap.statement_date, newData);
      }
      await loadSnapshots();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "刪除保險明細失敗");
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }

  async function handleAdd() {
    setSaving(true);
    try {
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
      await loadSnapshots();
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "儲存保險明細失敗");
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  const availableMonths = [...new Set(snapshots.map((snap) => snap.statement_date.slice(0, 7)))]
    .sort()
    .reverse()
    .slice(0, 4);

  const monthSnapshots = selectedMonth
    ? snapshots.filter((snap) => snap.statement_date.startsWith(selectedMonth))
    : snapshots;

  const byBank = new Map<string, InsuranceSnapshotItem[]>();
  for (const snap of monthSnapshots) {
    if (!byBank.has(snap.bank)) byBank.set(snap.bank, []);
    byBank.get(snap.bank)!.push(snap);
  }

  const monthRecords = monthSnapshots.flatMap((snap) => (Array.isArray(snap.data) ? snap.data : []));
  const policyCount = monthRecords.length;
  const investmentCount = monthRecords.filter((record) => record.insuranceType === "investment").length;
  const nonInvestmentCount = monthRecords.filter((record) => record.insuranceType === "non-investment").length;
  const nextPremiumTotal = monthRecords.reduce((sum, record) => sum + record.nextPremium, 0);
  const accumulatedPremiumTotal = monthRecords.reduce((sum, record) => sum + record.accumulatedPremium, 0);
  const coverageSummary = buildCoverageSummary(monthRecords);

  return (
    <article className="panel detail-panel ledger-panel review-panel insurance-panel">
      <div className="review-header">
        <div>
          <h2>保險明細</h2>
          <p className="panel-copy panel-copy--tight detail-panel-intro">把每月匯入的保單快照集中整理，方便確認保障型 / 投資型比例與後續保費負擔。</p>
        </div>
        <div className="review-month-tabs" role="tablist" aria-label="保險月份">
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
          <p>保單筆數</p>
          <strong>{policyCount} 筆</strong>
          <span>{selectedMonth ? `${selectedMonth.replace("-", " / ")} 保單快照` : "尚無資料"}</span>
        </section>
        <section className="review-summary-card">
          <p>保單型態</p>
          <strong>{`${nonInvestmentCount} / ${investmentCount}`}</strong>
          <span>非投資型 / 投資型</span>
        </section>
        <section className="review-summary-card">
          <p>下期保費合計</p>
          <strong>{`NT$ ${formatAmount(nextPremiumTotal)}`}</strong>
          <span>依目前可讀到的保單資料</span>
        </section>
        <section className="review-summary-card">
          <p>累計已繳保費</p>
          <strong>{`NT$ ${formatAmount(accumulatedPremiumTotal)}`}</strong>
          <span>僅統計本頁當前月份</span>
        </section>
      </div>

      {monthRecords.length > 0 && (
        <section className="coverage-summary-section">
          <h3 className="coverage-summary-title">保障總覽</h3>
          <div className="coverage-summary-grid">
            {COVERAGE_CONFIG.map((cfg) => {
              const cat = coverageSummary[cfg.key];
              const isExpanded = expandedCards.has(cfg.key);
              return (
                <div
                  key={cfg.key}
                  className={`coverage-card coverage-card--${cfg.key}${isExpanded ? " expanded" : ""}`}
                  onClick={() => toggleCard(cfg.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && toggleCard(cfg.key)}
                >
                  <div className="coverage-card-main">
                    <p className="coverage-card-label">{cfg.label}</p>
                    <strong className="coverage-card-amount">
                      {cat.total > 0 ? `NT$ ${formatAmount(cat.total)}` : "—"}
                    </strong>
                    <span className="coverage-card-note">{cfg.note}</span>
                    <span className="coverage-card-chevron">{isExpanded ? "▲" : "▼"}</span>
                  </div>

                  {isExpanded && (() => {
                    const catRecords = monthRecords.filter((r) => cfg.keywords.test(r.productName));
                    const benefitGroups = groupBenefitsByLabel(catRecords);
                    const hasBenefitData = benefitGroups.length > 0;

                    return (
                      <div className="coverage-card-detail" onClick={(e) => e.stopPropagation()}>
                        {hasBenefitData ? (
                          <div className="benefit-group-list">
                            {benefitGroups.map((group) => (
                              <div key={group.label} className="benefit-group">
                                <div className="benefit-group-label">{group.label}</div>
                                <table className="coverage-benefit-table">
                                  <tbody>
                                    {group.entries.map((entry, i) => (
                                      <tr key={i}>
                                        {entry.receiptType && (
                                          <td className="benefit-receipt-cell">
                                            <span className={`receipt-badge receipt-badge--${entry.receiptType}`}>{entry.receiptType}</span>
                                          </td>
                                        )}
                                        <td className="benefit-label">
                                          {entry.policyName.replace(/全球人壽|台灣人壽|富邦人壽/g, (m) => ({ "全球人壽": "全球", "台灣人壽": "台壽", "富邦人壽": "富邦" }[m] ?? m))}
                                          {entry.sublabel && <span className="benefit-sublabel">{entry.sublabel}</span>}
                                        </td>
                                        <td className="benefit-amount">{entry.amount.toLocaleString("zh-TW")} {entry.unit}</td>
                                        {entry.note && <td className="benefit-note">{entry.note}</td>}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {group.hasReceiptConflict && (
                                  <p className="receipt-conflict-note">
                                    ⚡ 住院後先送<strong>正本</strong>給正本保險公司理賠，再以<strong>副本</strong>送其他保險公司
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="coverage-policy-list">
                            {cat.items.map((item, i) => (
                              <div key={i} className="coverage-policy-block">
                                <div className="coverage-policy-header">
                                  <span className="coverage-subtype-badge">{getSubtypeLabel(item.productName)}</span>
                                  <span className="coverage-policy-name">{item.productName}</span>
                                </div>
                                <div className="coverage-benefit-fallback">主約保額 NT$ {formatAmount(item.coverage)}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {cfg.key === "cancer" && (
                          <p className="coverage-card-caveat">⚠ 防癌各項給付依實際理賠項目；初次罹癌一次金於確診後一次性給付</p>
                        )}
                        {cfg.key === "disability" && (
                          <div className="coverage-disability-note">
                            <p className="coverage-disability-heading">失能等級說明（依「失能程度與保險金給付表」）</p>
                            <div className="coverage-grade-table">
                              {DISABILITY_GRADES.map((g) => (
                                <div key={g.level} className="coverage-grade-row">
                                  <span className="coverage-grade-level">{g.level}</span>
                                  <span className="coverage-grade-desc">{g.desc}</span>
                                  <span className="coverage-grade-note">{g.note}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </section>
      )}

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
            <label className="ledger-toolbar-field detail-entry-grid-span-2">
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

      {loading && <p className="panel-message panel-message--muted">載入中...</p>}
      {loadError && <p className="panel-message panel-message--error">載入失敗：{loadError}</p>}
      {!loading && snapshots.length === 0 && !showForm && (
        <p className="panel-message panel-message--muted">尚無保險資料。請在 Gmail 同步中匯入永豐綜合對帳單，或點上方「手動新增」。</p>
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
                    <div className="snapshot-record-count">{records.length} 筆保單快照</div>
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
                <div className="detail-card-list">
                  {records.map((rec, idx) => (
                    <section key={buildInsuranceRecordKey(rec)} className="detail-card insurance-card">
                      <div className="detail-card-header insurance-card-header">
                        <div>
                          <div className="detail-card-title">保單號碼</div>
                          <div className="detail-card-emphasis">{rec.policyNo}</div>
                        </div>
                        <span className="detail-card-badge">
                          {rec.insuranceType === "investment" ? "投資型" : "非投資型"}
                        </span>
                        <button
                          className="ledger-delete-btn always-visible ml-auto"
                          disabled={deletingIds.has(`${snap.id}-${idx}`)}
                          onClick={() => void handleDeleteRecord(snap, idx)}
                          type="button"
                          aria-label="刪除此保單"
                        >×</button>
                      </div>
                      <div className="insurance-card-body detail-grid">
                        <div className="insurance-row">
                          <span className="label">保險公司</span>
                          <span>{rec.company || "—"}</span>
                        </div>
                        <div className="insurance-row">
                          <span className="label">商品名稱</span>
                          <span className="detail-long-text">{rec.productName || "—"}</span>
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
                    </section>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}

      {!loading && snapshots.length > 0 && monthSnapshots.length === 0 && (
        <p className="panel-message panel-message--muted">這個月份目前沒有保險資料。</p>
      )}
    </article>
  );
}
