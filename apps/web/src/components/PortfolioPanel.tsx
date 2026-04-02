import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type {
  FxRateRecord,
  NetWorthResponse,
  PortfolioDividendsResponse,
  PortfolioHoldingsResponse,
} from "@hearth/shared";
import {
  fetchFxRates,
  fetchNetWorth,
  fetchPortfolioDividends,
  fetchPortfolioHoldings,
  saveFxRates,
  savePriceSnapshots,
} from "../lib/portfolio";

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
        netWorth: Extract<NetWorthResponse, { status: "ok" }>;
        dividends: Extract<PortfolioDividendsResponse, { status: "ok" }>;
      };

const fmtTwd = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatAmount(value: number, currency: string) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function PortfolioPanel({ session, refreshKey }: PortfolioPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [priceDate, setPriceDate] = useState(todayIso);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceMessage, setPriceMessage] = useState<string | null>(null);

  const [fxRates, setFxRates] = useState<FxRateRecord[]>([]);
  const [fxDate, setFxDate] = useState(todayIso);
  const [fxInputs, setFxInputs] = useState<Record<string, string>>({});
  const [fxSaving, setFxSaving] = useState(false);
  const [fxMessage, setFxMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    async function load() {
      setState({ status: "loading" });
      const [holdingsResult, netWorthResult, dividendsResult, fxResult] = await Promise.all([
        fetchPortfolioHoldings(),
        fetchNetWorth(),
        fetchPortfolioDividends(),
        fetchFxRates(),
      ]);
      if (cancelled) return;

      if (holdingsResult.status === "error") {
        setState({ status: "error", message: holdingsResult.error });
        return;
      }
      if (netWorthResult.status === "error") {
        setState({ status: "error", message: netWorthResult.error });
        return;
      }
      if (dividendsResult.status === "error") {
        setState({ status: "error", message: dividendsResult.error });
        return;
      }

      if (fxResult.status === "ok") setFxRates(fxResult.rates);
      setState({
        status: "success",
        holdings: holdingsResult,
        netWorth: netWorthResult,
        dividends: dividendsResult,
      });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [session, refreshKey]);

  async function handleSavePrices() {
    const entries = Object.entries(priceInputs)
      .filter(([, v]) => v.trim() !== "")
      .map(([ticker, v]) => ({
        ticker,
        date: priceDate,
        close_price: parseFloat(v.replace(/,/g, "")),
        currency: "TWD",
      }))
      .filter((e) => e.close_price > 0);

    if (entries.length === 0) {
      setPriceMessage("請至少輸入一個有效報價。");
      return;
    }

    setPriceSaving(true);
    setPriceMessage(null);
    const result = await savePriceSnapshots(entries);
    setPriceSaving(false);

    if (result.status === "error") {
      setPriceMessage(`儲存失敗：${result.error}`);
    } else {
      setPriceMessage(`已儲存 ${result.saved} 筆報價。`);
      setPriceInputs({});
    }
  }

  async function handlePriceCsvUpload(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    const entries: { ticker: string; date: string; close_price: number; currency?: string }[] = [];
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(",").map((p) => p.trim());
      if (i === 0 && parts[0].toLowerCase() === "ticker") continue;
      const [ticker, date, closePriceRaw, currency] = parts;
      if (!ticker || !date || !closePriceRaw) {
        errors.push(`第 ${i + 1} 行格式錯誤`);
        continue;
      }
      const close_price = parseFloat(closePriceRaw.replace(/,/g, ""));
      if (isNaN(close_price) || close_price <= 0) {
        errors.push(`第 ${i + 1} 行收盤價無效`);
        continue;
      }
      entries.push({ ticker: ticker.toUpperCase(), date, close_price, currency: currency || "TWD" });
    }

    if (entries.length === 0) {
      setPriceMessage(errors.length > 0 ? `解析失敗：${errors[0]}` : "CSV 內無有效資料。");
      return;
    }

    setPriceSaving(true);
    setPriceMessage(null);
    const result = await savePriceSnapshots(entries);
    setPriceSaving(false);

    const warn = errors.length > 0 ? `（${errors.length} 行略過）` : "";
    if (result.status === "error") {
      setPriceMessage(`儲存失敗：${result.error}${warn}`);
    } else {
      setPriceMessage(`已從 CSV 儲存 ${result.saved} 筆報價${warn}。`);
    }
  }

  async function handleSaveFxRates() {
    const entries = Object.entries(fxInputs)
      .filter(([, v]) => v.trim() !== "")
      .map(([from_currency, v]) => ({
        from_currency,
        rate_date: fxDate,
        rate: parseFloat(v.replace(/,/g, "")),
      }))
      .filter((e) => e.rate > 0);

    if (entries.length === 0) {
      setFxMessage("請至少輸入一個有效匯率。");
      return;
    }

    setFxSaving(true);
    setFxMessage(null);
    const result = await saveFxRates(entries);
    setFxSaving(false);

    if (result.status === "error") {
      setFxMessage(`儲存失敗：${result.error}`);
    } else {
      setFxMessage(`已儲存 ${result.saved} 筆匯率。`);
      setFxInputs({});
      const updated = await fetchFxRates();
      if (updated.status === "ok") setFxRates(updated.rates);
    }
  }

  return (
    <article className="panel">
      <h2>投資組合</h2>

      {!session ? <p>登入後會載入你目前的持倉清單。</p> : null}
      {state.status === "loading" ? <p>正在載入...</p> : null}
      {state.status === "error" ? <p>載入失敗: {state.message}</p> : null}

      {state.status === "success" ? (
        <>
          {/* 淨值摘要 */}
          <section className="net-worth-summary">
            <div className="net-worth-total">
              <span className="label">總資產淨值</span>
              <span className="value">{fmtTwd.format(state.netWorth.totalNetWorthTwd)}</span>
            </div>
            <div className="net-worth-breakdown">
              <div>
                <span className="label">銀行現金</span>
                <span className="value">{fmtTwd.format(state.netWorth.cashBankTwd)}</span>
              </div>
              <div>
                <span className="label">信用卡餘額</span>
                <span className="value">{fmtTwd.format(state.netWorth.cashCreditTwd)}</span>
              </div>
              <div>
                <span className="label">投資市值</span>
                <span className="value">{fmtTwd.format(state.netWorth.investmentsTwd)}</span>
              </div>
              <div>
                <span className="label">累計配息</span>
                <span className="value">{fmtTwd.format(state.netWorth.dividendsReceivedTwd)}</span>
              </div>
              <div>
                <span className="label">今年配息</span>
                <span className="value">{fmtTwd.format(state.netWorth.dividendsYearToDateTwd)}</span>
              </div>
            </div>
            {state.netWorth.priceAsOf ? (
              <p className="price-as-of">報價日期：{state.netWorth.priceAsOf}</p>
            ) : state.netWorth.investmentsTwd > 0 ? (
              <p className="price-as-of">尚無報價，以成本計算</p>
            ) : null}
          </section>

          {/* 持倉明細 table */}
          {state.holdings.items.length > 0 ? (
            <>
              <section className="holdings-list">
                <h3>持倉明細</h3>
                <div className="holdings-table-wrap">
                  <table className="holdings-table">
                    <thead>
                      <tr>
                        <th>股票</th>
                        <th className="num">股數</th>
                        <th className="num">成本均價</th>
                        <th className="num">現價</th>
                        <th className="num">未實現損益</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.holdings.items.map((item) => {
                        const shares = Number(item.total_shares);
                        const avgCost = Number(item.avg_cost);
                        const closePrice = item.close_price;
                        const costBasis = shares * avgCost;
                        const marketValue = closePrice !== null ? shares * closePrice : null;
                        const pnl = marketValue !== null ? marketValue - costBasis : null;
                        const pnlPct = pnl !== null && costBasis > 0 ? (pnl / costBasis) * 100 : null;
                        const pnlColor = pnl === null ? undefined : pnl >= 0 ? "#4caf50" : "#f44336";

                        return (
                          <tr key={item.id}>
                            <td>
                              <span className="ticker">{item.ticker}</span>
                              {item.name ? <span className="holding-name">{item.name}</span> : null}
                            </td>
                            <td className="num">
                              {shares.toLocaleString("zh-TW", { maximumFractionDigits: 3 })}
                            </td>
                            <td className="num">{avgCost.toFixed(2)}</td>
                            <td className="num">
                              {closePrice !== null ? (
                                <>
                                  {closePrice.toFixed(2)}
                                  {item.price_as_of ? (
                                    <span className="price-date"> ({item.price_as_of.slice(5)})</span>
                                  ) : null}
                                </>
                              ) : (
                                <span className="no-price">—</span>
                              )}
                            </td>
                            <td className="num" style={{ color: pnlColor }}>
                              {pnl !== null && pnlPct !== null ? (
                                <>
                                  {pnl >= 0 ? "+" : ""}
                                  {fmtTwd.format(pnl)}
                                  <span className="pnl-pct">
                                    {" "}({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                                  </span>
                                </>
                              ) : (
                                <span className="no-price">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 更新報價 */}
              <section className="price-update">
                <h3>更新報價</h3>
                <label>
                  報價日期
                  <input
                    type="date"
                    value={priceDate}
                    onChange={(e) => setPriceDate(e.target.value)}
                  />
                </label>
                <div className="price-inputs">
                  {state.holdings.items.map((item) => (
                    <label key={item.ticker}>
                      {item.ticker}{item.name ? ` (${item.name})` : ""}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="收盤價"
                        value={priceInputs[item.ticker] ?? ""}
                        onChange={(e) =>
                          setPriceInputs((prev) => ({ ...prev, [item.ticker]: e.target.value }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <button
                  className="action-button"
                  disabled={priceSaving}
                  onClick={() => void handleSavePrices()}
                  type="button"
                >
                  {priceSaving ? "儲存中..." : "儲存報價"}
                </button>
                <label className="csv-upload-label">
                  或上傳 CSV（<code>ticker,date,close_price[,currency]</code>）
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={priceSaving}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handlePriceCsvUpload(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {priceMessage ? <p>{priceMessage}</p> : null}
              </section>
            </>
          ) : (
            <p>目前沒有持倉資料，匯入台股或複委託交易後這裡會顯示。</p>
          )}

          {/* 更新匯率 */}
          {fxRates.length > 0 ? (
            <section className="fx-update">
              <h3>更新匯率</h3>
              <label>
                匯率日期
                <input
                  type="date"
                  value={fxDate}
                  onChange={(e) => setFxDate(e.target.value)}
                />
              </label>
              <div className="price-inputs">
                {fxRates.map((r) => (
                  <label key={r.from_currency}>
                    {r.from_currency} / TWD
                    <span className="current-rate">目前：{r.rate}（{r.rate_date}）</span>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      placeholder="新匯率"
                      value={fxInputs[r.from_currency] ?? ""}
                      onChange={(e) =>
                        setFxInputs((prev) => ({ ...prev, [r.from_currency]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                className="action-button"
                disabled={fxSaving}
                onClick={() => void handleSaveFxRates()}
                type="button"
              >
                {fxSaving ? "儲存中..." : "儲存匯率"}
              </button>
              {fxMessage ? <p>{fxMessage}</p> : null}
            </section>
          ) : null}

          {/* 最近配息 */}
          {state.dividends.items.length > 0 ? (
            <section className="holdings-list">
              <h3>最近配息</h3>
              <ul>
                {state.dividends.items.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <span className="ticker">{item.ticker}</span>
                    <span className="name">{item.pay_date}</span>
                    <span className="shares">{formatAmount(Number(item.net_amount), item.currency)}</span>
                    <span className="cost">
                      {item.gross_amount !== null
                        ? `毛額 ${formatAmount(Number(item.gross_amount), item.currency)} / 稅 ${formatAmount(Number(item.tax_withheld), item.currency)}`
                        : `稅 ${formatAmount(Number(item.tax_withheld), item.currency)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
