export type NetWorthResponse =
  | {
      cashBankTwd: number;
      cashCreditTwd: number;
      investmentsTwd: number;
      dividendsReceivedTwd: number;
      dividendsYearToDateTwd: number;
      totalNetWorthTwd: number;
      priceAsOf: string | null;
      status: "ok";
    }
  | {
      code: "unauthorized" | "database_error";
      error: string;
      status: "error";
    };

export type HoldingRecord = {
  id: string;
  account_id: string;
  ticker: string;
  name: string | null;
  total_shares: number;
  avg_cost: number;
  currency: string;
  updated_at: string;
  // enriched by API from price_snapshots
  close_price: number | null;
  price_as_of: string | null;
};

export type DividendRecord = {
  id: string;
  account_id: string;
  ticker: string;
  pay_date: string;
  gross_amount: number | null;
  tax_withheld: number;
  net_amount: number;
  currency: string;
  created_at: string;
};

export type InvestmentCostRecord = {
  ticker: string;
  currency: string;
  total_fee: number;
  total_tax: number;
  trade_count: number;
};

export type InvestmentCostsResponse =
  | { items: InvestmentCostRecord[]; status: "ok" }
  | { code: "unauthorized" | "database_error"; error: string; status: "error" };

export type NetWorthSnapshotRecord = {
  snapshot_date: string;
  total_twd: number;
  cash_bank_twd: number;
  investments_twd: number;
};

export type NetWorthHistoryResponse =
  | { snapshots: NetWorthSnapshotRecord[]; status: "ok" }
  | { code: "unauthorized" | "database_error"; error: string; status: "error" };

export type FxRateRecord = {
  from_currency: string;
  to_currency: string;
  rate_date: string;
  rate: number;
};

export type FxRatesResponse =
  | { rates: FxRateRecord[]; status: "ok" }
  | { code: "unauthorized" | "database_error"; error: string; status: "error" };

export type PortfolioHoldingsResponse =
  | {
      items: HoldingRecord[];
      count: number;
      provider: "supabase";
      status: "ok";
    }
  | {
      code: "unauthorized" | "database_error";
      error: string;
      status: "error";
    };

export type PortfolioDividendsResponse =
  | {
      items: DividendRecord[];
      count: number;
      provider: "supabase";
      status: "ok";
    }
  | {
      code: "unauthorized" | "database_error";
      error: string;
      status: "error";
    };
