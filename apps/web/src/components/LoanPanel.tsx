import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ParsedLoanRecord } from "@hearth/shared";
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

type LoanSnapshotItem = BankSnapshot & { data: ParsedLoanRecord[] };

export function LoanPanel({ session }: { session: Session | null }) {
  const [snapshots, setSnapshots] = useState<LoanSnapshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);

    fetchBankSnapshots()
      .then((items) => {
        const loanItems = items.filter((s) => s.type === "loan") as LoanSnapshotItem[];
        setSnapshots(loanItems);
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
        <h2>貸款明細</h2>
        <p className="muted">請先登入以查看貸款資料。</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="panel">
        <h2>貸款明細</h2>
        <p className="muted">載入中...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="panel">
        <h2>貸款明細</h2>
        <p className="error">{loadError}</p>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="panel">
        <h2>貸款明細</h2>
        <p className="muted">尚無貸款資料。請在 Gmail 同步中匯入永豐綜合對帳單。</p>
      </div>
    );
  }

  // Group by bank
  const byBank = new Map<string, LoanSnapshotItem[]>();
  for (const snap of snapshots) {
    if (!byBank.has(snap.bank)) byBank.set(snap.bank, []);
    byBank.get(snap.bank)!.push(snap);
  }

  return (
    <div className="panel">
      <h2>貸款明細</h2>

      {[...byBank.entries()].map(([bank, bankSnaps]) => {
        const bankLabel = BANK_DISPLAY_NAMES[bank] ?? bank;
        // Use the latest snapshot
        const latest = bankSnaps[0];
        const records = Array.isArray(latest.data) ? latest.data : [];

        return (
          <div key={bank} className="bank-group">
            <h3>{bankLabel} — {formatDate(latest.statement_date)} 對帳單</h3>
            {records.length === 0 ? (
              <p className="muted">此期對帳單無貸款資料。</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>帳號</th>
                    <th>繳款日</th>
                    <th>繳款金額</th>
                    <th>攤還本金</th>
                    <th>繳息金額</th>
                    <th>違約金</th>
                    <th>本金餘額</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec, idx) => (
                    <tr key={idx}>
                      <td className="mono">{rec.accountNo}</td>
                      <td>{formatDate(rec.paymentDate)}</td>
                      <td className="amount">{formatAmount(rec.paymentAmount)}</td>
                      <td className="amount">{formatAmount(rec.principal)}</td>
                      <td className="amount">{formatAmount(rec.interest)}</td>
                      <td className="amount">{formatAmount(rec.penalty)}</td>
                      <td className="amount highlight">{formatAmount(rec.remainingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {bankSnaps.length > 1 && (
              <details className="history">
                <summary>歷史紀錄（{bankSnaps.length} 期）</summary>
                {bankSnaps.slice(1).map((snap) => {
                  const histRecords = Array.isArray(snap.data) ? snap.data as ParsedLoanRecord[] : [];
                  return (
                    <div key={snap.id} className="history-entry">
                      <strong>{formatDate(snap.statement_date)}</strong>
                      {histRecords.map((rec, idx) => (
                        <div key={idx} className="history-row">
                          <span>{rec.accountNo}</span>
                          <span>餘額：{formatAmount(rec.remainingBalance)}</span>
                        </div>
                      ))}
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
