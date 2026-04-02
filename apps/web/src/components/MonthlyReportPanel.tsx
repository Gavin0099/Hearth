import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { MonthlyReportResponse } from "@hearth/shared";
import { fetchMonthlyReport } from "../lib/report";

type MonthlyReportPanelProps = {
  session: Session | null;
  refreshKey: number;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | {
      status: "success";
      report: Extract<MonthlyReportResponse, { status: "ok" }>;
    };

const fmtTwd = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function addMonths(year: number, month: number, delta: number): [number, number] {
  const d = new Date(year, month - 1 + delta, 1);
  return [d.getFullYear(), d.getMonth() + 1];
}

export function MonthlyReportPanel({ session, refreshKey }: MonthlyReportPanelProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [showAllCategories, setShowAllCategories] = useState(false);

  useEffect(() => {
    if (!session) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      try {
        const result = await fetchMonthlyReport(year, month);
        if (cancelled) return;

        if (result.status === "error") {
          setState({ status: "error", message: result.error });
          return;
        }
        setState({ status: "success", report: result });
      } catch (error) {
        if (cancelled) return;
        setState({ status: "error", message: error instanceof Error ? error.message : "Unknown error" });
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [session, refreshKey, year, month]);

  function handlePrev() {
    const [y, m] = addMonths(year, month, -1);
    setYear(y);
    setMonth(m);
    setShowAllCategories(false);
  }

  function handleNext() {
    const [y, m] = addMonths(year, month, 1);
    const nowY = now.getFullYear();
    const nowM = now.getMonth() + 1;
    if (y > nowY || (y === nowY && m > nowM)) return; // 不允許超過當月
    setYear(y);
    setMonth(m);
    setShowAllCategories(false);
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <article className="panel">
      <h2>月報表</h2>

      {!session ? <p>登入後會載入月收支摘要與分類。</p> : null}

      {session ? (
        <div className="month-nav">
          <button className="action-button" type="button" onClick={handlePrev}>‹</button>
          <span className="month-label">
            {year}/{String(month).padStart(2, "0")}
          </span>
          <button
            className="action-button"
            type="button"
            onClick={handleNext}
            disabled={isCurrentMonth}
          >›</button>
        </div>
      ) : null}

      {state.status === "loading" ? <p>正在彙整...</p> : null}
      {state.status === "error" ? <p>月報載入失敗: {state.message}</p> : null}

      {state.status === "success" ? (() => {
        const { summary } = state.report;
        const totalExpense = Math.abs(summary.expense);
        const categories = summary.categories;
        const visibleCategories = showAllCategories ? categories : categories.slice(0, 6);
        const hiddenCount = categories.length - visibleCategories.length;

        return (
          <>
            <div className="report-summary-row">
              <div className="report-stat">
                <span className="label">收入</span>
                <span className="value income">{fmtTwd.format(summary.income)}</span>
              </div>
              <div className="report-stat">
                <span className="label">支出</span>
                <span className="value expense">{fmtTwd.format(totalExpense)}</span>
              </div>
              <div className="report-stat">
                <span className="label">交易筆數</span>
                <span className="value">{summary.transactionCount}</span>
              </div>
            </div>

            {categories.length > 0 ? (
              <>
                <ul className="category-list">
                  {visibleCategories.map((cat) => {
                    const pct = totalExpense > 0 ? Math.round((Math.abs(cat.amount) / totalExpense) * 100) : 0;
                    return (
                      <li key={cat.category} className="category-item">
                        <span className="cat-name">{cat.category}</span>
                        <div className="cat-bar-wrap">
                          <div className="cat-bar" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="cat-amount">{fmtTwd.format(Math.abs(cat.amount))}</span>
                        <span className="cat-pct">{pct}%</span>
                      </li>
                    );
                  })}
                </ul>
                {hiddenCount > 0 ? (
                  <button
                    className="action-button"
                    type="button"
                    onClick={() => setShowAllCategories(true)}
                    style={{ marginTop: "0.25rem", fontSize: "0.8rem" }}
                  >
                    顯示剩餘 {hiddenCount} 筆分類
                  </button>
                ) : showAllCategories && categories.length > 6 ? (
                  <button
                    className="action-button"
                    type="button"
                    onClick={() => setShowAllCategories(false)}
                    style={{ marginTop: "0.25rem", fontSize: "0.8rem" }}
                  >
                    收起
                  </button>
                ) : null}
              </>
            ) : (
              <p>本月尚無交易資料。</p>
            )}
          </>
        );
      })() : null}
    </article>
  );
}
