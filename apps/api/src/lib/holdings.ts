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
