import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { PortfolioHoldingsResponse } from "@hearth/shared";
import { fetchPortfolioHoldings } from "../lib/portfolio";

type PortfolioPanelProps = {
  session: Session | null;
  refreshKey: number;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | {
      status: "success";
      holdings: Extract<PortfolioHoldingsResponse, { status: "ok" }>;
    };

export function PortfolioPanel({ session, refreshKey }: PortfolioPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    if (!session) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    async function load() {
      setState({ status: "loading" });
      const result = await fetchPortfolioHoldings();
      if (cancelled) {
        return;
      }

      if (result.status === "error") {
        setState({ status: "error", message: result.error });
        return;
      }

      setState({ status: "success", holdings: result });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [session, refreshKey]);

  return (
    <article className="panel">
      <h2>投資持倉</h2>
      {!session ? <p>登入後會載入你目前的持倉清單。</p> : null}
      {state.status === "loading" ? <p>正在載入持倉資料...</p> : null}
      {state.status === "error" ? <p>持倉載入失敗: {state.message}</p> : null}
      {state.status === "success" ? (
        state.holdings.items.length > 0 ? (
          <ul>
            {state.holdings.items.slice(0, 8).map((item) => (
              <li key={item.id}>
                {item.ticker} {item.name ? `(${item.name})` : ""} |
                股數 {Number(item.total_shares).toFixed(3)} |
                成本 {item.currency} {Number(item.avg_cost).toFixed(4)}
              </li>
            ))}
          </ul>
        ) : (
          <p>目前沒有持倉資料，等台股匯入後這裡會顯示。</p>
        )
      ) : null}
    </article>
  );
}
