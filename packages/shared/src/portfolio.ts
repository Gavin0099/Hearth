export type HoldingRecord = {
  id: string;
  account_id: string;
  ticker: string;
  name: string | null;
  total_shares: number;
  avg_cost: number;
  currency: string;
  updated_at: string;
};

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
