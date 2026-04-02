import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchOpsSummary, type JobRunSummaryResponse } from "../lib/ops";

type OpsPanelProps = {
  session: Session | null;
};

export function OpsPanel({ session }: OpsPanelProps) {
  const [summary, setSummary] = useState<JobRunSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    const result = await fetchOpsSummary("daily-update", 10);
    setSummary(result);
    setRefreshedAt(new Date());
    setLoading(false);
  }

  useEffect(() => {
    if (!session) {
      setSummary(null);
      return;
    }
    void load();
  }, [session]);

  if (!session) return null;

  const latest = summary?.status === "ok" ? summary.latest : null;
  const totals = summary?.status === "ok" ? summary.totals : null;

  const isHealthy =
    latest !== null &&
    latest.status === "ok" &&
    latest.report_error_sections.length === 0;

  const healthLabel = !latest
    ? "尚無執行記錄"
    : isHealthy
      ? "正常"
      : "異常";

  const healthColor = !latest ? "#888" : isHealthy ? "#4caf50" : "#f44336";

  function formatRelative(isoStr: string) {
    const diff = Date.now() - Date.parse(isoStr);
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return "不到 1 小時前";
    if (h < 24) return `${h} 小時前`;
    return `${Math.floor(h / 24)} 天前`;
  }

  return (
    <article className="panel">
      <h2>
        排程狀態
        <span
          style={{
            marginLeft: "0.5rem",
            fontSize: "0.8rem",
            color: healthColor,
            fontWeight: "normal",
          }}
        >
          ● {healthLabel}
        </span>
      </h2>

      {loading && !summary ? (
        <p>載入中...</p>
      ) : summary?.status === "error" ? (
        <p>讀取失敗：{summary.error}</p>
      ) : (
        <>
          {latest ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
              <tbody>
                <tr>
                  <th style={{ textAlign: "left", padding: "2px 8px 2px 0", color: "#aaa", fontWeight: "normal" }}>最後執行</th>
                  <td>{formatRelative(latest.run_finished_at)}</td>
                  <td style={{ color: "#888", paddingLeft: "0.5rem" }}>
                    {new Date(latest.run_finished_at).toLocaleString("zh-TW", {
                      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                </tr>
                <tr>
                  <th style={{ textAlign: "left", padding: "2px 8px 2px 0", color: "#aaa", fontWeight: "normal" }}>狀態</th>
                  <td style={{ color: latest.status === "ok" ? "#4caf50" : "#f44336" }}>
                    {latest.status === "ok" ? "成功" : "失敗"}
                  </td>
                </tr>
                {latest.report_error_sections.length > 0 ? (
                  <tr>
                    <th style={{ textAlign: "left", padding: "2px 8px 2px 0", color: "#aaa", fontWeight: "normal" }}>錯誤區段</th>
                    <td style={{ color: "#f44336" }}>{latest.report_error_sections.join("、")}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "#888", fontSize: "0.85rem" }}>尚未有任何 daily-update 執行記錄。</p>
          )}

          {totals && totals.runs > 0 ? (
            <p style={{ fontSize: "0.8rem", color: "#aaa", margin: 0 }}>
              近 {totals.runs} 次：成功 {totals.ok}／失敗 {totals.error}
              {totals.with_report_errors > 0
                ? `，含 section 錯誤 ${totals.with_report_errors} 次`
                : ""}
            </p>
          ) : null}

          <button
            className="action-button"
            disabled={loading}
            onClick={() => void load()}
            style={{ marginTop: "0.75rem" }}
            type="button"
          >
            {loading ? "更新中..." : "重新整理"}
          </button>

          {refreshedAt ? (
            <p style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.25rem" }}>
              查詢時間：{refreshedAt.toLocaleTimeString("zh-TW")}
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}
