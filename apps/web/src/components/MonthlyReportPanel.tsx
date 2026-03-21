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

export function MonthlyReportPanel({ session, refreshKey }: MonthlyReportPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    if (!session) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    const now = new Date();

    async function load() {
      setState({ status: "loading" });
      const result = await fetchMonthlyReport(now.getUTCFullYear(), now.getUTCMonth() + 1);
      if (cancelled) {
        return;
      }

      if (result.status === "error") {
        setState({ status: "error", message: result.error });
        return;
      }

      setState({ status: "success", report: result });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [session, refreshKey]);

  return (
    <article className="panel">
      <h2>本月報表</h2>
      {!session ? <p>登入後會載入本月收支摘要與分類。</p> : null}
      {state.status === "loading" ? <p>正在彙整本月交易資料...</p> : null}
      {state.status === "error" ? <p>月報載入失敗: {state.message}</p> : null}
      {state.status === "success" ? (
        <>
          <p>
            {state.report.year}/{String(state.report.month).padStart(2, "0")} |
            交易數 {state.report.summary.transactionCount}
          </p>
          <p>收入: NT$ {state.report.summary.income.toFixed(2)}</p>
          <p>支出: NT$ {state.report.summary.expense.toFixed(2)}</p>
          {state.report.summary.categories.length > 0 ? (
            <ul>
              {state.report.summary.categories.slice(0, 5).map((category) => (
                <li key={category.category}>
                  {category.category}: NT$ {category.amount.toFixed(2)}
                </li>
              ))}
            </ul>
          ) : (
            <p>目前還沒有交易資料，等匯入或手動新增後這裡會開始顯示。</p>
          )}
        </>
      ) : null}
    </article>
  );
}
