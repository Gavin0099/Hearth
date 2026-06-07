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
    try {
      const result = await fetchOpsSummary("daily-update", 10);
      setSummary(result);
      setRefreshedAt(new Date());
    } catch (error) {
      setSummary({
        code: "request_failed",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    } finally {
      setLoading(false);
    }
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
  const thresholds = summary?.status === "ok" ? summary.thresholds : null;

  const healthLabel = !latest
    ? "No Data"
    : verdict === "healthy"
      ? "Healthy"
      : verdict === "warning"
        ? "Warning"
        : "Critical";

  const healthClass =
    !latest || verdict === null
      ? ""
      : verdict === "healthy"
        ? "amount--income"
        : verdict === "warning"
          ? "ops-health--warning"
          : "amount--expense";

  return (
    <article className="panel ops-panel">
      <h2>
        Ops
        <span className={`ops-health-badge ${healthClass}`}>
          {healthLabel}
        </span>
      </h2>

      {loading && !summary ? (
        <p className="panel-message panel-message--muted">Loading...</p>
      ) : summary?.status === "error" ? (
        <p className="panel-message panel-message--error">Load failed: {summary.error}</p>
      ) : (
        <>
          {latest ? (
            <table className="ops-table">
              <tbody>
                <tr>
                  <th>Latest Run</th>
                  <td>{formatRelative(latest.run_finished_at)}</td>
                  <td className="muted">
                    {new Date(latest.run_finished_at).toLocaleString("zh-TW", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
                <tr>
                  <th>Status</th>
                  <td className={latest.status === "ok" ? "amount--income" : "amount--expense"}>
                    {latest.status === "ok" ? "ok" : latest.status}
                  </td>
                </tr>
                {latest.age_minutes !== null ? (
                  <tr>
                    <th>Age</th>
                    <td>{latest.age_minutes} min</td>
                  </tr>
                ) : null}
                {latest.report_error_sections.length > 0 ? (
                  <tr>
                    <th>Error Sections</th>
                    <td className="amount--expense">{latest.report_error_sections.join(", ")}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <p className="panel-message panel-message--muted">No persisted daily-update runs yet.</p>
          )}

          {reasons.length > 0 ? (
            <div className="ops-reasons">
              {reasons.map((reason) => (
                <p key={reason} className={`ops-reason ${healthClass}`}>
                  {reason}
                </p>
              ))}
            </div>
          ) : null}

          {thresholds ? (
            <p className="ops-policy">
              Policy: max age{" "}
              {thresholds.max_age_minutes === null ? "disabled" : `${thresholds.max_age_minutes} min`}
              , consecutive status errors {thresholds.consecutive_failure_threshold}, consecutive report-error
              runs {thresholds.consecutive_report_error_threshold}
            </p>
          ) : null}

          {totals && totals.runs > 0 ? (
            <>
              <p className="ops-totals">
                Last {totals.runs} run(s): ok {totals.ok}, error {totals.error}
                {totals.with_report_errors > 0 ? `, report-error runs ${totals.with_report_errors}` : ""}
              </p>
              {(totals.consecutive_status_errors > 0 || totals.consecutive_report_error_runs > 0) ? (
                <p className={`ops-consecutive ${healthClass}`}>
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
            <p className="panel-message panel-message--muted">
              Refreshed at {refreshedAt.toLocaleTimeString("zh-TW")}
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}
