import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ParsedInsuranceRecord } from "@hearth/shared";
import { fetchBankSnapshots, type BankSnapshot } from "../lib/bank-snapshots";

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

  if (!session) {
    return (
      <div className="panel">
        <h2>保險明細</h2>
        <p className="muted">請先登入以查看保險資料。</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="panel">
        <h2>保險明細</h2>
        <p className="muted">載入中...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="panel">
        <h2>保險明細</h2>
        <p className="error">{loadError}</p>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="panel">
        <h2>保險明細</h2>
        <p className="muted">尚無保險資料。請在 Gmail 同步中匯入永豐綜合對帳單。</p>
      </div>
    );
  }

  // Group by bank
  const byBank = new Map<string, InsuranceSnapshotItem[]>();
  for (const snap of snapshots) {
    if (!byBank.has(snap.bank)) byBank.set(snap.bank, []);
    byBank.get(snap.bank)!.push(snap);
  }

  return (
    <div className="panel">
      <h2>保險明細</h2>

      {[...byBank.entries()].map(([bank, bankSnaps]) => {
        const bankLabel = BANK_DISPLAY_NAMES[bank] ?? bank;
        // Use the latest snapshot
        const latest = bankSnaps[0];
        const records = Array.isArray(latest.data) ? latest.data : [];

        return (
          <div key={bank} className="bank-group">
            <h3>{bankLabel} — {formatDate(latest.statement_date)} 對帳單</h3>
            {records.length === 0 ? (
              <p className="muted">此期對帳單無保險資料。</p>
            ) : (
              <div className="insurance-list">
                {records.map((rec, idx) => (
                  <div key={idx} className="insurance-card">
                    <div className="insurance-card-header">
                      <span className="policy-no mono">{rec.policyNo}</span>
                      <span className="policy-type">
                        {rec.insuranceType === 'investment' ? '投資型' : '非投資型'}
                      </span>
                    </div>
                    <div className="insurance-card-body">
                      <div className="insurance-row">
                        <span className="label">保險公司</span>
                        <span>{rec.company || '—'}</span>
                      </div>
                      <div className="insurance-row">
                        <span className="label">商品名稱</span>
                        <span>{rec.productName || '—'}</span>
                      </div>
                      <div className="insurance-row">
                        <span className="label">被保險人</span>
                        <span>{rec.insuredPerson || '—'}</span>
                      </div>
                      <div className="insurance-row">
                        <span className="label">保單期間</span>
                        <span>
                          {formatDate(rec.startDate)} ～ {formatDate(rec.endDate)}
                        </span>
                      </div>
                      <div className="insurance-row">
                        <span className="label">幣別 / 主約保額</span>
                        <span>
                          {rec.currency} {rec.coverage > 0 ? formatAmount(rec.coverage) : '—'}
                        </span>
                      </div>
                      <div className="insurance-row">
                        <span className="label">繳費方式</span>
                        <span>{rec.paymentPeriod || '—'}</span>
                      </div>
                      <div className="insurance-row highlight">
                        <span className="label">下期應繳保費</span>
                        <span>
                          {rec.nextPremium > 0 ? formatAmount(rec.nextPremium) : '—'}
                          {rec.nextPaymentDate ? ` （${formatDate(rec.nextPaymentDate)}）` : ''}
                        </span>
                      </div>
                      <div className="insurance-row">
                        <span className="label">累計已繳保費</span>
                        <span>
                          {rec.accumulatedPremium > 0 ? formatAmount(rec.accumulatedPremium) : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {bankSnaps.length > 1 && (
              <details className="history">
                <summary>歷史紀錄（{bankSnaps.length} 期）</summary>
                {bankSnaps.slice(1).map((snap) => {
                  const histRecords = Array.isArray(snap.data) ? snap.data as ParsedInsuranceRecord[] : [];
                  return (
                    <div key={snap.id} className="history-entry">
                      <strong>{formatDate(snap.statement_date)}</strong>：{histRecords.length} 筆保單
                    </div>
                  );
                })}
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
