/**
 * Cloudflare Cron handler that runs after Taiwan market close.
 *
 * Steps:
 *   1. Fetch distinct tickers from holdings (TWD stocks = 4-digit codes)
 *   2. Fetch TWSE daily stock prices
 *   3. Upsert `price_snapshots`
 *   4. Fetch distinct non-TWD currencies from accounts + holdings
 *   5. Fetch FX rates
 *   6. Upsert `fx_rates`
 */

import { createSupabaseAdminClient } from "../lib/supabase";
import type { WorkerBindings } from "../types";

type TwseStockRow = {
  Code: string;
  ClosingPrice: string;
  Date: string;
};

type ErApiResponse = {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_utc: string;
};

type HoldingCurrencyRow = {
  ticker: string | null;
  currency: string | null;
};

type AccountCurrencyRow = {
  currency: string | null;
};

type PriceSnapshotUpsertRow = {
  ticker: string;
  snapshot_date: string;
  close_price: number;
  currency: string;
};

type FxRateUpsertRow = {
  from_currency: string;
  to_currency: string;
  rate_date: string;
  rate: number;
};

function normalizeCurrency(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function toIsoDate(dateText: string | null | undefined): string | null {
  if (!dateText) return null;

  const compact = dateText.trim();
  if (/^\d{8}$/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }

  const parsed = new Date(compact);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

async function fetchTwsePrices(): Promise<Map<string, { price: number; date: string }>> {
  const response = await fetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`TWSE API ${response.status}`);

  const rows = (await response.json()) as TwseStockRow[];
  const prices = new Map<string, { price: number; date: string }>();

  for (const row of rows) {
    const ticker = row.Code?.trim();
    const price = Number.parseFloat(row.ClosingPrice);
    const date = toIsoDate(row.Date);
    if (!ticker || Number.isNaN(price) || price <= 0 || !date) {
      continue;
    }

    prices.set(ticker, { price, date });
  }

  return prices;
}

async function fetchFxRates(
  currencies: string[],
): Promise<{ rateDate: string; rates: Map<string, number> }> {
  const needed = [
    ...new Set(currencies.map(normalizeCurrency).filter((currency): currency is string => Boolean(currency) && currency !== "TWD")),
  ];

  if (needed.length === 0) {
    return {
      rateDate: new Date().toISOString().slice(0, 10),
      rates: new Map(),
    };
  }

  const response = await fetch("https://open.er-api.com/v6/latest/TWD");
  if (!response.ok) throw new Error(`FX API ${response.status}`);

  const data = (await response.json()) as ErApiResponse;
  if (data.result !== "success") {
    throw new Error("FX API returned non-success");
  }

  const rates = new Map<string, number>();
  for (const currency of needed) {
    const rate = data.rates[currency];
    if (rate && rate > 0) {
      rates.set(currency, 1 / rate);
    }
  }

  return {
    rateDate: toIsoDate(data.time_last_update_utc) ?? new Date().toISOString().slice(0, 10),
    rates,
  };
}

export async function runDailyUpdate(env: WorkerBindings): Promise<void> {
  const supabase = createSupabaseAdminClient(env);

  const { data: holdingsData, error: holdingsError } = await supabase
    .from("holdings")
    .select("ticker, currency");

  if (holdingsError) {
    console.error("[cron] holdings fetch error:", holdingsError.message);
    return;
  }

  const holdings = (holdingsData ?? []) as HoldingCurrencyRow[];
  const twdTickers = [
    ...new Set(
      holdings
        .map((holding) => {
          const ticker = holding.ticker?.trim();
          return ticker && /^\d{4}$/.test(ticker) ? ticker : null;
        })
        .filter((ticker): ticker is string => ticker !== null),
    ),
  ];
  const holdingCurrencies = [
    ...new Set(
      holdings
        .map((holding) => normalizeCurrency(holding.currency))
        .filter((currency): currency is string => Boolean(currency) && currency !== "TWD"),
    ),
  ];

  const { data: accountsData, error: accountsError } = await supabase
    .from("accounts")
    .select("currency");

  if (accountsError) {
    console.error("[cron] accounts fetch error:", accountsError.message);
    return;
  }

  const accountCurrencies = ((accountsData ?? []) as AccountCurrencyRow[])
    .map((account) => normalizeCurrency(account.currency))
    .filter((currency): currency is string => Boolean(currency) && currency !== "TWD");

  const allForeignCurrencies = [...new Set([...holdingCurrencies, ...accountCurrencies])];

  if (twdTickers.length > 0) {
    try {
      const priceMap = await fetchTwsePrices();
      const snapshots: PriceSnapshotUpsertRow[] = [];

      for (const ticker of twdTickers) {
        const entry = priceMap.get(ticker);
        if (!entry) continue;

        snapshots.push({
          ticker,
          snapshot_date: entry.date,
          close_price: entry.price,
          currency: "TWD",
        });
      }

      if (snapshots.length > 0) {
        const { error } = await supabase
          .from("price_snapshots")
          .upsert(snapshots, { onConflict: "ticker,snapshot_date" });

        if (error) {
          console.error("[cron] price_snapshots upsert error:", error.message);
        } else {
          console.log(`[cron] upserted ${snapshots.length} price snapshots`);
        }
      }
    } catch (error) {
      console.error("[cron] TWSE fetch failed:", error);
    }
  }

  if (allForeignCurrencies.length > 0) {
    try {
      const { rateDate, rates } = await fetchFxRates(allForeignCurrencies);
      const rows: FxRateUpsertRow[] = [];

      for (const [currency, rate] of rates) {
        rows.push({
          from_currency: currency,
          to_currency: "TWD",
          rate_date: rateDate,
          rate,
        });
      }

      if (rows.length > 0) {
        const { error } = await supabase
          .from("fx_rates")
          .upsert(rows, { onConflict: "from_currency,to_currency,rate_date" });

        if (error) {
          console.error("[cron] fx_rates upsert error:", error.message);
        } else {
          console.log(`[cron] upserted ${rows.length} FX rate(s)`);
        }
      }
    } catch (error) {
      console.error("[cron] FX fetch failed:", error);
    }
  }

  console.log("[cron] daily-update complete");
}
