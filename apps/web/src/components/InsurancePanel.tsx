import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ParsedInsuranceRecord } from "@hearth/shared";
import { fetchBankSnapshots, deleteBankSnapshot, type BankSnapshot } from "../lib/bank-snapshots";

const BANK_DISPLAY_NAMES: Record<string, string> = {
  sinopac: "永豐",
  esun: "玉山",
  cathay: "國泰",
  taishin: "台新",
  ctbc: "中信",
  mega: "兆豐",
};

function formatAmount(n: number): string {
  return n.toLocaleString("zh-TW");
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  return dateStr.replace(/-/g, "/");
}

type InsuranceSnapshotItem = BankSnapshot & { data: ParsedInsuranceRecord[] };

export function InsurancePanel({ session }: { session: Session | null }) {
  const [snapshots, setSnapshots] = useState<InsuranceSnapshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);

    fetchBankSnapshots()
      .then((items) => {
        const insuranceItems = items.filter((s) => s.type === "insurance") as InsuranceSnapshotItem[];
        setSnapshots(insuranceItems);
        setLoading(false);
      })
      .catch((err: Error) => {
        setLoadError(err.message);
        setLoading(false);
      });
  }, [session]);

  async function handleDelete(id: string) {
    setDeletingIds((prev) => new Set([...prev, id]));
    await deleteBankSnapshot(id);
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
    setDeletingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  if (!session) return null;

  if (loading) {
    return (
      <article className="panel">
        <h2>保險明細</h2>
        <p>載入中...</p>
      </article>
    );
  }

  if (loadError) {
    return (
      <article className="panel">
        <h2>保險明細</h2>
        <p>載入失敗：{loadError}</p>
      </article>
    );
  }

  if (snapshots.length === 0) {
    return (
      <article className="panel">
        <h2>保險明細</h2>
        <p>尚無保險資料。請在 Gmail 同步中匯入永豐綜合對帳單。</p>
      </article>
    );
  }

  const byBank = new Map<string, InsuranceSnapshotItem[]>();
  for (const snap of snapshots) {
    if (!byBank.has(snap.bank)) byBank.set(snap.bank, []);
    byBank.get(snap.bank)!.push(snap);
  }

  return (
    <article className="panel">
      <h2>保險明細</h2>

      {[...byBank.entries()].map(([bank, bankSnaps]) => {
        const bankLabel = BANK_DISPLAY_NAMES[bank] ?? bank;

        return (
          <section key={bank} className="ledger-account-section">
            <h3 className="ledger-account-heading">{bankLabel}</h3>

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

                  {records.length === 0 ? (
                    <p>此期無保險資料。</p>
                  ) : (
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
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </article>
  );
}
