import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ParsedLoanRecord } from "@hearth/shared";
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

type LoanSnapshotItem = BankSnapshot & { data: ParsedLoanRecord[] };

export function LoanPanel({ session }: { session: Session | null }) {
  const [snapshots, setSnapshots] = useState<LoanSnapshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

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
        <h2>貸款明細</h2>
        <p>載入中...</p>
      </article>
    );
  }

  if (loadError) {
    return (
      <article className="panel">
        <h2>貸款明細</h2>
        <p>載入失敗：{loadError}</p>
      </article>
    );
  }

  if (snapshots.length === 0) {
    return (
      <article className="panel">
        <h2>貸款明細</h2>
        <p>尚無貸款資料。請在 Gmail 同步中匯入永豐綜合對帳單。</p>
      </article>
    );
  }

  const byBank = new Map<string, LoanSnapshotItem[]>();
  for (const snap of snapshots) {
    if (!byBank.has(snap.bank)) byBank.set(snap.bank, []);
    byBank.get(snap.bank)!.push(snap);
  }

  return (
    <article className="panel">
      <h2>貸款明細</h2>

      {[...byBank.entries()].map(([bank, bankSnaps]) => {
        const bankLabel = BANK_DISPLAY_NAMES[bank] ?? bank;

        return (
          <section key={bank} className="ledger-account-section">
            <h3 className="ledger-account-heading">{bankLabel}</h3>

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

                  {records.length === 0 ? (
                    <p>此期無貸款資料。</p>
                  ) : (
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
