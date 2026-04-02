import { Hono } from "hono";
import type {
  DividendRecord,
  FxRatesResponse,
  HoldingRecord,
  InvestmentCostsResponse,
  NetWorthHistoryResponse,
  NetWorthResponse,
  PortfolioDividendsResponse,
  PortfolioHoldingsResponse,
} from "@hearth/shared";
import type { ApiEnv } from "../types";

export const portfolioRoutes = new Hono<ApiEnv>();

type InvestmentCostsSuccessResponse = Extract<InvestmentCostsResponse, { status: "ok" }>;

portfolioRoutes.get("/net-worth", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<NetWorthResponse>(
      { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" },
      401,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  // 1. Get user accounts
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, type, currency")
    .eq("user_id", user.id);

  if (accountsError) {
    return c.json<NetWorthResponse>(
      { code: "database_error", error: accountsError.message, status: "error" },
      500,
    );
  }

  const accountIds = (accounts ?? []).map((a: { id: string }) => a.id);
  if (accountIds.length === 0) {
    return c.json<NetWorthResponse>({
      cashBankTwd: 0,
      cashCreditTwd: 0,
      investmentsTwd: 0,
      dividendsReceivedTwd: 0,
      dividendsYearToDateTwd: 0,
      totalNetWorthTwd: 0,
      priceAsOf: null,
      status: "ok",
    });
  }

  const accountMap = new Map(
    (accounts ?? []).map((a: { id: string; type: string; currency: string }) => [a.id, a]),
  );

  // 2. Sum transactions per account for cash balances
  const { data: transactions, error: txError } = await supabase
    .from("transactions")
    .select("account_id, amount")
    .in("account_id", accountIds);

  if (txError) {
    return c.json<NetWorthResponse>(
      { code: "database_error", error: txError.message, status: "error" },
      500,
    );
  }

  const balanceByAccount = new Map<string, number>();
  for (const tx of transactions ?? []) {
    const prev = balanceByAccount.get(tx.account_id) ?? 0;
    balanceByAccount.set(tx.account_id, prev + Number(tx.amount));
  }

  // 3. Get investment holdings
  const { data: holdings, error: holdingsError } = await supabase
    .from("holdings")
    .select("account_id, ticker, total_shares, avg_cost, currency")
    .in("account_id", accountIds);

  if (holdingsError) {
    return c.json<NetWorthResponse>(
      { code: "database_error", error: holdingsError.message, status: "error" },
      500,
    );
  }

  // 4. Latest price per ticker (fall back to avg_cost if no snapshot)
  const tickers = [...new Set((holdings ?? []).map((h: { ticker: string }) => h.ticker))];
  let latestPrices = new Map<string, number>();
  let priceAsOf: string | null = null;

  if (tickers.length > 0) {
    const { data: prices, error: pricesError } = await supabase
      .from("price_snapshots")
      .select("ticker, close_price, snapshot_date")
      .in("ticker", tickers)
      .order("snapshot_date", { ascending: false });

    if (pricesError) {
      return c.json<NetWorthResponse>(
        { code: "database_error", error: pricesError.message, status: "error" },
        500,
      );
    }

    for (const p of prices ?? []) {
      if (!latestPrices.has(p.ticker)) {
        latestPrices.set(p.ticker, Number(p.close_price));
        if (!priceAsOf || p.snapshot_date > priceAsOf) {
          priceAsOf = p.snapshot_date;
        }
      }
    }
  }

  // 5. Latest FX rates (to TWD)
  const nonTwdCurrencies = [
    ...new Set(
      [
        ...(accounts ?? []).map((a: { currency: string }) => a.currency),
        ...(holdings ?? []).map((h: { currency: string }) => h.currency),
      ].filter((cur) => cur !== "TWD"),
    ),
  ];

  const fxRates = new Map<string, number>([["TWD", 1]]);
  if (nonTwdCurrencies.length > 0) {
    const { data: rates, error: ratesError } = await supabase
      .from("fx_rates")
      .select("from_currency, rate, rate_date")
      .in("from_currency", nonTwdCurrencies)
      .eq("to_currency", "TWD")
      .order("rate_date", { ascending: false });

    if (ratesError) {
      return c.json<NetWorthResponse>(
        { code: "database_error", error: ratesError.message, status: "error" },
        500,
      );
    }

    for (const r of rates ?? []) {
      if (!fxRates.has(r.from_currency)) {
        fxRates.set(r.from_currency, Number(r.rate));
      }
    }

    // Default unknown currencies to 1 to avoid NaN
    for (const cur of nonTwdCurrencies) {
      if (!fxRates.has(cur)) fxRates.set(cur, 1);
    }
  }

  const toTwd = (amount: number, currency: string) => amount * (fxRates.get(currency) ?? 1);

  // 6. Calculate net worth components
  let cashBankTwd = 0;
  let cashCreditTwd = 0;

  for (const account of accounts ?? []) {
    const balance = balanceByAccount.get(account.id) ?? 0;
    const balanceTwd = toTwd(balance, account.currency);
    if (account.type === "cash_bank") {
      cashBankTwd += balanceTwd;
    } else if (account.type === "cash_credit") {
      cashCreditTwd += balanceTwd;
    }
  }

  let investmentsTwd = 0;
  for (const holding of holdings ?? []) {
    const price = latestPrices.get(holding.ticker) ?? Number(holding.avg_cost);
    const marketValue = Number(holding.total_shares) * price;
    investmentsTwd += toTwd(marketValue, holding.currency);
  }

  const { data: dividends, error: dividendsError } = await supabase
    .from("dividends")
    .select("pay_date, net_amount, currency")
    .in("account_id", accountIds);

  if (dividendsError) {
    return c.json<NetWorthResponse>(
      { code: "database_error", error: dividendsError.message, status: "error" },
      500,
    );
  }

  const currentYear = new Date().getUTCFullYear();
  let dividendsReceivedTwd = 0;
  let dividendsYearToDateTwd = 0;

  for (const dividend of dividends ?? []) {
    const amountTwd = toTwd(Number(dividend.net_amount), dividend.currency);
    dividendsReceivedTwd += amountTwd;
    if (String(dividend.pay_date).startsWith(`${currentYear}-`)) {
      dividendsYearToDateTwd += amountTwd;
    }
  }

  const totalNetWorthTwd = cashBankTwd + cashCreditTwd + investmentsTwd;

  // Upsert daily snapshot; ignore errors (table may not exist yet)
  const todayDate = new Date().toISOString().slice(0, 10);
  try {
    await supabase.from("net_worth_snapshots").upsert(
      {
        user_id: user.id,
        snapshot_date: todayDate,
        total_twd: Math.round(totalNetWorthTwd),
        cash_bank_twd: Math.round(cashBankTwd),
        investments_twd: Math.round(investmentsTwd),
      },
      { onConflict: "user_id,snapshot_date" },
    );
  } catch {
    // Non-critical; don't fail the net-worth response
  }

  return c.json<NetWorthResponse>({
    cashBankTwd: Math.round(cashBankTwd),
    cashCreditTwd: Math.round(cashCreditTwd),
    investmentsTwd: Math.round(investmentsTwd),
    dividendsReceivedTwd: Math.round(dividendsReceivedTwd),
    dividendsYearToDateTwd: Math.round(dividendsYearToDateTwd),
    totalNetWorthTwd: Math.round(totalNetWorthTwd),
    priceAsOf,
    status: "ok",
  });
});

portfolioRoutes.get("/net-worth-history", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<NetWorthHistoryResponse>(
      { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" },
      401,
    );
  }

  const days = Math.min(Math.max(parseInt(c.req.query("days") ?? "90") || 90, 1), 365);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().slice(0, 10);

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  const { data, error } = await supabase
    .from("net_worth_snapshots")
    .select("snapshot_date, total_twd, cash_bank_twd, investments_twd")
    .eq("user_id", user.id)
    .gte("snapshot_date", sinceDate)
    .order("snapshot_date", { ascending: true });

  if (error) {
    return c.json<NetWorthHistoryResponse>(
      { code: "database_error", error: error.message, status: "error" },
      500,
    );
  }

  return c.json<NetWorthHistoryResponse>({
    snapshots: (data ?? []).map((r: { snapshot_date: string; total_twd: number; cash_bank_twd: number; investments_twd: number }) => ({
      snapshot_date: r.snapshot_date,
      total_twd: Number(r.total_twd),
      cash_bank_twd: Number(r.cash_bank_twd),
      investments_twd: Number(r.investments_twd),
    })),
    status: "ok",
  });
});

portfolioRoutes.get("/holdings", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<PortfolioHoldingsResponse>(
      {
        code: "unauthorized",
        error: "Missing or invalid Supabase bearer token.",
        status: "error",
      },
      401,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  const { data: ownedAccounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);

  if (accountsError) {
    return c.json<PortfolioHoldingsResponse>(
      {
        code: "database_error",
        error: accountsError.message,
        status: "error",
      },
      500,
    );
  }

  const accountIds = (ownedAccounts ?? []).map((account: { id: string }) => account.id);
  if (accountIds.length === 0) {
    return c.json<PortfolioHoldingsResponse>({
      items: [],
      count: 0,
      provider: "supabase",
      status: "ok",
    });
  }

  const { data, error } = await supabase
    .from("holdings")
    .select("id, account_id, ticker, name, total_shares, avg_cost, currency, updated_at")
    .in("account_id", accountIds)
    .order("updated_at", { ascending: false });

  if (error) {
    return c.json<PortfolioHoldingsResponse>(
      {
        code: "database_error",
        error: error.message,
        status: "error",
      },
      500,
    );
  }

  const holdings = data ?? [];

  // Enrich with latest close_price from price_snapshots
  const tickers = [...new Set(holdings.map((h: { ticker: string }) => h.ticker))];
  const latestPrices = new Map<string, { close_price: number; snapshot_date: string }>();

  if (tickers.length > 0) {
    const { data: prices, error: pricesError } = await supabase
      .from("price_snapshots")
      .select("ticker, close_price, snapshot_date")
      .in("ticker", tickers)
      .order("snapshot_date", { ascending: false });

    if (pricesError) {
      return c.json<PortfolioHoldingsResponse>(
        {
          code: "database_error",
          error: pricesError.message,
          status: "error",
        },
        500,
      );
    }

    for (const p of prices ?? []) {
      if (!latestPrices.has(p.ticker)) {
        latestPrices.set(p.ticker, { close_price: Number(p.close_price), snapshot_date: p.snapshot_date });
      }
    }
  }

  const enriched = holdings.map((h: HoldingRecord) => {
    const snap = latestPrices.get(h.ticker);
    return { ...h, close_price: snap?.close_price ?? null, price_as_of: snap?.snapshot_date ?? null };
  });

  return c.json<PortfolioHoldingsResponse>({
    items: enriched as HoldingRecord[],
    count: enriched.length,
    provider: "supabase",
    status: "ok",
  });
});

portfolioRoutes.get("/dividends", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<PortfolioDividendsResponse>(
      {
        code: "unauthorized",
        error: "Missing or invalid Supabase bearer token.",
        status: "error",
      },
      401,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  const { data: ownedAccounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);

  if (accountsError) {
    return c.json<PortfolioDividendsResponse>(
      {
        code: "database_error",
        error: accountsError.message,
        status: "error",
      },
      500,
    );
  }

  const accountIds = (ownedAccounts ?? []).map((account: { id: string }) => account.id);
  if (accountIds.length === 0) {
    return c.json<PortfolioDividendsResponse>({
      items: [],
      count: 0,
      provider: "supabase",
      status: "ok",
    });
  }

  const { data, error } = await supabase
    .from("dividends")
    .select("id, account_id, ticker, pay_date, gross_amount, tax_withheld, net_amount, currency, created_at")
    .in("account_id", accountIds)
    .order("pay_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return c.json<PortfolioDividendsResponse>(
      {
        code: "database_error",
        error: error.message,
        status: "error",
      },
      500,
    );
  }

  return c.json<PortfolioDividendsResponse>({
    items: (data ?? []) as DividendRecord[],
    count: data?.length ?? 0,
    provider: "supabase",
    status: "ok",
  });
});

type PriceSnapshotEntry = {
  ticker: string;
  date: string;
  close_price: number;
  currency?: string;
};

type PriceSnapshotResponse =
  | { saved: number; status: "ok" }
  | { code: "unauthorized" | "validation_error" | "database_error"; error: string; status: "error" };

portfolioRoutes.post("/price-snapshots", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<PriceSnapshotResponse>(
      { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" },
      401,
    );
  }

  let entries: PriceSnapshotEntry[];
  try {
    const body = await c.req.json();
    entries = Array.isArray(body) ? body : [body];
  } catch {
    return c.json<PriceSnapshotResponse>(
      { code: "validation_error", error: "Invalid JSON body.", status: "error" },
      400,
    );
  }

  const rows = entries
    .filter((e) => e.ticker && e.date && typeof e.close_price === "number" && e.close_price > 0)
    .map((e) => ({
      ticker: String(e.ticker).toUpperCase().trim(),
      snapshot_date: e.date,
      close_price: e.close_price,
      currency: e.currency ?? "TWD",
    }));

  if (rows.length === 0) {
    return c.json<PriceSnapshotResponse>(
      { code: "validation_error", error: "No valid entries. Each entry needs ticker, date, close_price.", status: "error" },
      400,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);
  const { error } = await supabase
    .from("price_snapshots")
    .upsert(rows, { onConflict: "ticker,snapshot_date" });

  if (error) {
    return c.json<PriceSnapshotResponse>(
      { code: "database_error", error: error.message, status: "error" },
      500,
    );
  }

  return c.json<PriceSnapshotResponse>({ saved: rows.length, status: "ok" });
});

// GET /fx-rates — latest rate per non-TWD currency the user holds
portfolioRoutes.get("/fx-rates", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<FxRatesResponse>(
      { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" },
      401,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  // Collect non-TWD currencies from user's accounts and holdings
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("currency")
    .eq("user_id", user.id);

  if (accountsError) {
    return c.json<FxRatesResponse>(
      { code: "database_error", error: accountsError.message, status: "error" },
      500,
    );
  }

  const accountIds = (accounts ?? []).map((a: { currency: string }) => a.currency);

  // Get account IDs to find holdings currencies
  const { data: ownedAccounts, error: ownedAccountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);

  if (ownedAccountsError) {
    return c.json<FxRatesResponse>(
      { code: "database_error", error: ownedAccountsError.message, status: "error" },
      500,
    );
  }

  const ids = (ownedAccounts ?? []).map((a: { id: string }) => a.id);
  const { data: holdings, error: holdingsError } = ids.length > 0
    ? await supabase.from("holdings").select("currency").in("account_id", ids)
    : { data: [], error: null };

  if (holdingsError) {
    return c.json<FxRatesResponse>(
      { code: "database_error", error: holdingsError.message, status: "error" },
      500,
    );
  }

  const currencies = [
    ...new Set([
      ...accountIds,
      ...(holdings ?? []).map((h: { currency: string }) => h.currency),
    ].filter((cur) => cur !== "TWD")),
  ];

  if (currencies.length === 0) {
    return c.json<FxRatesResponse>({ rates: [], status: "ok" });
  }

  const { data: rates, error } = await supabase
    .from("fx_rates")
    .select("from_currency, to_currency, rate_date, rate")
    .in("from_currency", currencies)
    .eq("to_currency", "TWD")
    .order("rate_date", { ascending: false });

  if (error) {
    return c.json<FxRatesResponse>(
      { code: "database_error", error: error.message, status: "error" },
      500,
    );
  }

  // Keep only the latest rate per currency
  const seen = new Set<string>();
  const latest = (rates ?? []).filter((r: { from_currency: string }) => {
    if (seen.has(r.from_currency)) return false;
    seen.add(r.from_currency);
    return true;
  });

  return c.json<FxRatesResponse>({
    rates: latest.map((r: { from_currency: string; to_currency: string; rate_date: string; rate: number }) => ({
      from_currency: r.from_currency,
      to_currency: r.to_currency,
      rate_date: r.rate_date,
      rate: Number(r.rate),
    })),
    status: "ok",
  });
});

type FxRateEntry = { from_currency: string; rate_date: string; rate: number };
type FxRateSaveResponse =
  | { saved: number; status: "ok" }
  | { code: "unauthorized" | "validation_error" | "database_error"; error: string; status: "error" };

// POST /fx-rates — upsert FX rates (to TWD)
portfolioRoutes.post("/fx-rates", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<FxRateSaveResponse>(
      { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" },
      401,
    );
  }

  let entries: FxRateEntry[];
  try {
    const body = await c.req.json();
    entries = Array.isArray(body) ? body : [body];
  } catch {
    return c.json<FxRateSaveResponse>(
      { code: "validation_error", error: "Invalid JSON body.", status: "error" },
      400,
    );
  }

  const rows = entries
    .filter(
      (e) =>
        e.from_currency &&
        e.rate_date &&
        typeof e.rate === "number" &&
        e.rate > 0,
    )
    .map((e) => ({
      from_currency: String(e.from_currency).toUpperCase().trim(),
      to_currency: "TWD",
      rate_date: e.rate_date,
      rate: e.rate,
    }));

  if (rows.length === 0) {
    return c.json<FxRateSaveResponse>(
      { code: "validation_error", error: "No valid entries.", status: "error" },
      400,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);
  const { error } = await supabase
    .from("fx_rates")
    .upsert(rows, { onConflict: "from_currency,to_currency,rate_date" });

  if (error) {
    return c.json<FxRateSaveResponse>(
      { code: "database_error", error: error.message, status: "error" },
      500,
    );
  }

  return c.json<FxRateSaveResponse>({ saved: rows.length, status: "ok" });
});

// GET /trade-costs — total fee+tax per ticker from investment_trades
portfolioRoutes.get("/trade-costs", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<InvestmentCostsResponse>(
      { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" },
      401,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  const { data: ownedAccounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);

  if (accountsError) {
    return c.json<InvestmentCostsResponse>(
      { code: "database_error", error: accountsError.message, status: "error" },
      500,
    );
  }

  const accountIds = (ownedAccounts ?? []).map((a: { id: string }) => a.id);
  if (accountIds.length === 0) {
    return c.json<InvestmentCostsResponse>({ items: [], status: "ok" });
  }

  const { data, error } = await supabase
    .from("investment_trades")
    .select("ticker, fee, tax, currency")
    .in("account_id", accountIds);

  if (error) {
    return c.json<InvestmentCostsResponse>(
      { code: "database_error", error: error.message, status: "error" },
      500,
    );
  }

  // Aggregate per ticker in JS (avoids needing a DB function)
  const map = new Map<string, { ticker: string; currency: string; total_fee: number; total_tax: number; trade_count: number }>();
  for (const row of data ?? []) {
    const ticker = String(row.ticker);
    const currency = String(row.currency ?? "TWD").toUpperCase();
    const key = `${ticker}::${currency}`;
    const prev = map.get(key) ?? { ticker, currency, total_fee: 0, total_tax: 0, trade_count: 0 };
    map.set(key, {
      ticker,
      currency,
      total_fee: prev.total_fee + Number(row.fee),
      total_tax: prev.total_tax + Number(row.tax),
      trade_count: prev.trade_count + 1,
    });
  }

  const items: InvestmentCostsSuccessResponse["items"] = [...map.entries()]
    .map(([, value]) => value)
    .sort((a, b) => {
      const totalDiff = (b.total_fee + b.total_tax) - (a.total_fee + a.total_tax);
      if (totalDiff !== 0) return totalDiff;
      return a.ticker.localeCompare(b.ticker);
    });

  return c.json<InvestmentCostsResponse>({ items, status: "ok" });
});
