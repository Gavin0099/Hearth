export type TransactionRecord = {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  currency: string;
  category: string | null;
  description: string | null;
  source: string | null;
  source_hash: string | null;
  created_at: string;
};

export type MonthlyCategorySummary = {
  category: string;
  amount: number;
};

export type MonthlyDailySeriesPoint = {
  date: string;
  expense: number;
  income: number;
};

export type MonthlyReportSummary = {
  income: number;
  expense: number;
  categories: MonthlyCategorySummary[];
  dailySeries: MonthlyDailySeriesPoint[];
  transactionCount: number;
};

export type MonthlyReportResponse =
  | {
      year: number;
      month: number;
      summary: MonthlyReportSummary;
      provider: "supabase";
      status: "ok";
    }
  | {
      code: "unauthorized" | "validation_error" | "database_error";
      error: string;
      status: "error";
    };
