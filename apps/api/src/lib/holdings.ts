export type HoldingRebuildTrade = {
  action: "buy" | "sell";
  shares: number;
  price_per_share: number;
  name: string | null;
  currency: string;
};

export type HoldingSnapshot = {
  name: string | null;
  total_shares: number;
  avg_cost: number;
  currency: string;
};

export type HoldingPersistenceTrade = {
  action: "buy" | "sell";
  shares: number | string;
  price_per_share: number | string;
  name: string | null;
  currency: string;
};

export function rebuildHoldingFromTrades(trades: HoldingRebuildTrade[]): HoldingSnapshot | null {
  let totalShares = 0;
  let weightedCost = 0;
  let name: string | null = null;
  let currency = "TWD";

  for (const trade of trades) {
    const shares = Number(trade.shares);
    const price = Number(trade.price_per_share);
    if (!name && trade.name) name = trade.name;
    currency = trade.currency;

    if (trade.action === "buy") {
      const newTotal = totalShares + shares;
      weightedCost = newTotal > 0 ? (weightedCost * totalShares + price * shares) / newTotal : price;
      totalShares = newTotal;
      continue;
    }

    totalShares = Math.max(0, totalShares - shares);
  }

  if (totalShares <= 0) {
    return null;
  }

  return {
    name,
    total_shares: totalShares,
    avg_cost: weightedCost,
    currency,
  };
}

export function normalizeHoldingPersistenceTrades(trades: HoldingPersistenceTrade[]): HoldingRebuildTrade[] {
  return trades.map((trade) => ({
    action: trade.action,
    shares: Number(trade.shares),
    price_per_share: Number(trade.price_per_share),
    name: trade.name,
    currency: trade.currency,
  }));
}

export async function refreshHoldingsForTickers(
  supabase: any,
  accountId: string,
  tickers: string[],
): Promise<{ holdingsRecalculated: number }> {
  let holdingsRecalculated = 0;

  for (const ticker of tickers) {
    const { data: allTrades, error: tradesError } = await supabase
      .from("investment_trades")
      .select("action, shares, price_per_share, name, currency")
      .eq("account_id", accountId)
      .eq("ticker", ticker)
      .order("trade_date", { ascending: true });

    if (tradesError) {
      continue;
    }

    const holding = rebuildHoldingFromTrades(normalizeHoldingPersistenceTrades(allTrades ?? []));

    if (!holding) {
      await supabase
        .from("holdings")
        .delete()
        .eq("account_id", accountId)
        .eq("ticker", ticker);
      continue;
    }

    const { error: upsertError } = await supabase.from("holdings").upsert(
      {
        account_id: accountId,
        ticker,
        name: holding.name,
        total_shares: holding.total_shares,
        avg_cost: holding.avg_cost,
        currency: holding.currency,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,ticker" },
    );

    if (!upsertError) {
      holdingsRecalculated += 1;
    }
  }

  return { holdingsRecalculated };
}
