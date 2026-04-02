import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchOpsSummary, type JobRunSummaryResponse } from "../lib/ops";

type OpsPanelProps = {
  session: Session | null;
};

function formatRelative(isoStr: string) {
  const diff = Date.now() - Date.parse(isoStr);
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "less than 1 hour ago";
  if (h < 24) return `${h} hour(s) ago`;
  return `${Math.floor(h / 24)} day(s) ago`;
}

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
  const verdict = summary?.status === "ok" ? summary.verdict : null;
  const reasons = summary?.status === "ok" ? summary.reasons : [];

  const healthLabel = !latest
    ? "No Data"
    : verdict === "healthy"
      ? "Healthy"
      : verdict === "warning"
        ? "Warning"
        : "Critical";

  const healthColor =
    !latest || verdict === null
      ? "#888"
      : verdict === "healthy"
        ? "#4caf50"
        : verdict === "warning"
          ? "#d89b1d"
          : "#f44336";

  return (
    <article className="panel">
      <h2>
        Ops
        <span
          style={{
            marginLeft: "0.5rem",
            fontSize: "0.8rem",
            color: healthColor,
            fontWeight: "normal",
          }}
        >
          {healthLabel}
        </span>
      </h2>

      {loading && !summary ? (
        <p>Loading...</p>
      ) : summary?.status === "error" ? (
        <p>Load failed: {summary.error}</p>
      ) : (
        <>
          {latest ? (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.85rem",
                marginBottom: "0.75rem",
              }}
            >
              <tbody>
                <tr>
                  <th style={{ textAlign: "left", padding: "2px 8px 2px 0", color: "#aaa", fontWeight: "normal" }}>
                    Latest Run
                  </th>
                  <td>{formatRelative(latest.run_finished_at)}</td>
                  <td style={{ color: "#888", paddingLeft: "0.5rem" }}>
                    {new Date(latest.run_finished_at).toLocaleString("zh-TW", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
                <tr>
                  <th style={{ textAlign: "left", padding: "2px 8px 2px 0", color: "#aaa", fontWeight: "normal" }}>
                    Status
                  </th>
                  <td style={{ color: latest.status === "ok" ? "#4caf50" : "#f44336" }}>
                    {latest.status === "ok" ? "ok" : latest.status}
                  </td>
                </tr>
                {latest.age_minutes !== null ? (
                  <tr>
                    <th style={{ textAlign: "left", padding: "2px 8px 2px 0", color: "#aaa", fontWeight: "normal" }}>
                      Age
                    </th>
                    <td>{latest.age_minutes} min</td>
                  </tr>
                ) : null}
                {latest.report_error_sections.length > 0 ? (
                  <tr>
                    <th style={{ textAlign: "left", padding: "2px 8px 2px 0", color: "#aaa", fontWeight: "normal" }}>
                      Error Sections
                    </th>
                    <td style={{ color: "#f44336" }}>{latest.report_error_sections.join(", ")}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "#888", fontSize: "0.85rem" }}>No persisted daily-update runs yet.</p>
          )}

          {reasons.length > 0 ? (
            <div style={{ marginBottom: "0.75rem" }}>
              {reasons.map((reason) => (
                <p key={reason} style={{ margin: "0.2rem 0", fontSize: "0.8rem", color: healthColor }}>
                  {reason}
                </p>
              ))}
            </div>
          ) : null}

          {totals && totals.runs > 0 ? (
            <>
              <p style={{ fontSize: "0.8rem", color: "#aaa", margin: 0 }}>
                Last {totals.runs} run(s): ok {totals.ok}, error {totals.error}
                {totals.with_report_errors > 0 ? `, report-error runs ${totals.with_report_errors}` : ""}
              </p>
              {(totals.consecutive_status_errors > 0 || totals.consecutive_report_error_runs > 0) ? (
                <p style={{ fontSize: "0.8rem", color: healthColor, margin: "0.35rem 0 0" }}>
                  Consecutive status errors {totals.consecutive_status_errors}; consecutive report-error runs {totals.consecutive_report_error_runs}
                </p>
              ) : null}
            </>
          ) : null}

          <button
            className="action-button"
            disabled={loading}
            onClick={() => void load()}
            style={{ marginTop: "0.75rem" }}
            type="button"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>

          {refreshedAt ? (
            <p style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.25rem" }}>
              Refreshed at {refreshedAt.toLocaleTimeString("zh-TW")}
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}
