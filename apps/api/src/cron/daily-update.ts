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

type Logger = Pick<typeof console, "log" | "error">;

export type DailyUpdateSectionReport = {
  attempted: number;
  upserted: number;
  skipped: number;
  errors: string[];
};

export type DailyUpdateReport = {
  priceSnapshots: DailyUpdateSectionReport;
  fxRates: DailyUpdateSectionReport;
};

type DailyUpdateDependencies = {
  supabase?: {
    from: (table: string) => any;
  };
  fetchImpl?: typeof fetch;
  logger?: Logger;
  now?: () => Date;
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

async function fetchTwsePrices(fetchImpl: typeof fetch): Promise<Map<string, { price: number; date: string }>> {
  const response = await fetchImpl("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", {
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
  fetchImpl: typeof fetch,
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

  const response = await fetchImpl("https://open.er-api.com/v6/latest/TWD");
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

export async function runDailyUpdate(
  env: WorkerBindings,
  dependencies: DailyUpdateDependencies = {},
): Promise<DailyUpdateReport> {
  const supabase = dependencies.supabase ?? createSupabaseAdminClient(env);
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const logger = dependencies.logger ?? console;
  const now = dependencies.now ?? (() => new Date());
  const runStartedAt = now().toISOString();
  const report: DailyUpdateReport = {
    priceSnapshots: { attempted: 0, upserted: 0, skipped: 0, errors: [] },
    fxRates: { attempted: 0, upserted: 0, skipped: 0, errors: [] },
  };
  const persistRun = async () => {
    const runFinishedAt = now().toISOString();
    const status =
      report.priceSnapshots.errors.length > 0 || report.fxRates.errors.length > 0
        ? "error"
        : "ok";
    const { error } = await supabase.from("job_runs").insert({
      job_name: "daily-update",
      run_started_at: runStartedAt,
      run_finished_at: runFinishedAt,
      status,
      report,
    });

    if (error) {
      logger.error(`[cron] job_runs insert error: ${error.message}`);
    }

    // Retain only the last 90 days of job runs
    const cutoff = new Date(now().getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { error: pruneError } = await supabase
      .from("job_runs")
      .delete()
      .lt("run_finished_at", cutoff);
    if (pruneError) {
      logger.error(`[cron] job_runs prune error: ${pruneError.message}`);
    }
  };

  const { data: holdingsData, error: holdingsError } = await supabase
    .from("holdings")
    .select("ticker, currency");

  if (holdingsError) {
    const message = `[cron] holdings fetch error: ${holdingsError.message}`;
    logger.error(message);
    report.priceSnapshots.errors.push(message);
    report.fxRates.errors.push(message);
    await persistRun();
    return report;
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
    const message = `[cron] accounts fetch error: ${accountsError.message}`;
    logger.error(message);
    report.fxRates.errors.push(message);
  }

  const accountCurrencies = ((accountsData ?? []) as AccountCurrencyRow[])
    .map((account) => normalizeCurrency(account.currency))
    .filter((currency): currency is string => Boolean(currency) && currency !== "TWD");

  const allForeignCurrencies = [...new Set([...holdingCurrencies, ...accountCurrencies])];

  if (twdTickers.length > 0) {
    report.priceSnapshots.attempted = twdTickers.length;
    try {
      const priceMap = await fetchTwsePrices(fetchImpl);
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

      report.priceSnapshots.skipped = twdTickers.length - snapshots.length;

      if (snapshots.length > 0) {
        const { error } = await supabase
          .from("price_snapshots")
          .upsert(snapshots, { onConflict: "ticker,snapshot_date" });

        if (error) {
          const message = `[cron] price_snapshots upsert error: ${error.message}`;
          logger.error(message);
          report.priceSnapshots.errors.push(message);
        } else {
          report.priceSnapshots.upserted = snapshots.length;
          logger.log(`[cron] upserted ${snapshots.length} price snapshots`);
        }
      }
    } catch (error) {
      const message = `[cron] TWSE fetch failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(message);
      report.priceSnapshots.errors.push(message);
    }
  }

  if (allForeignCurrencies.length > 0) {
    report.fxRates.attempted = allForeignCurrencies.length;
    try {
      const { rateDate, rates } = await fetchFxRates(allForeignCurrencies, fetchImpl);
      const rows: FxRateUpsertRow[] = [];

      for (const [currency, rate] of rates) {
        rows.push({
          from_currency: currency,
          to_currency: "TWD",
          rate_date: rateDate,
          rate,
        });
      }

      report.fxRates.skipped = allForeignCurrencies.length - rows.length;

      if (rows.length > 0) {
        const { error } = await supabase
          .from("fx_rates")
          .upsert(rows, { onConflict: "from_currency,to_currency,rate_date" });

        if (error) {
          const message = `[cron] fx_rates upsert error: ${error.message}`;
          logger.error(message);
          report.fxRates.errors.push(message);
        } else {
          report.fxRates.upserted = rows.length;
          logger.log(`[cron] upserted ${rows.length} FX rate(s)`);
        }
      }
    } catch (error) {
      const message = `[cron] FX fetch failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(message);
      report.fxRates.errors.push(message);
    }
  }

  logger.log(`[cron] daily-update complete ${JSON.stringify(report)}`);
  await persistRun();
  return report;
}
