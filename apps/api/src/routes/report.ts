import { Hono } from "hono";
import type {
  MonthlyCategorySummary,
  MonthlyDailySeriesPoint,
  MonthlyReportResponse,
  TransactionRecord,
} from "@hearth/shared";
import type { ApiEnv } from "../types";

export const reportRoutes = new Hono<ApiEnv>();

function parseYearMonth(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function summarizeTransactions(transactions: TransactionRecord[]) {
  let income = 0;
  let expense = 0;
  const categoryTotals = new Map<string, number>();
  const dailyTotals = new Map<string, { income: number; expense: number }>();

  for (const transaction of transactions) {
    const amount = Number(transaction.amount);
    const dateKey = transaction.date;
    const daily = dailyTotals.get(dateKey) ?? { income: 0, expense: 0 };

    if (amount >= 0) {
      income += amount;
      daily.income += amount;
    } else {
      const absAmount = Math.abs(amount);
      expense += absAmount;
      daily.expense += absAmount;

      const category = transaction.category?.trim() || "未分類";
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + absAmount);
    }

    dailyTotals.set(dateKey, daily);
  }

  const categories: MonthlyCategorySummary[] = [...categoryTotals.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
    }))
    .sort((left, right) => right.amount - left.amount);

  const dailySeries: MonthlyDailySeriesPoint[] = [...dailyTotals.entries()]
    .map(([date, totals]) => ({
      date,
      expense: totals.expense,
      income: totals.income,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  return {
    income,
    expense,
    categories,
    dailySeries,
    transactionCount: transactions.length,
  };
}

reportRoutes.get("/monthly", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<MonthlyReportResponse>(
      {
        code: "unauthorized",
        error: "Missing or invalid Supabase bearer token.",
        status: "error",
      },
      401,
    );
  }

  const now = new Date();
  const year = parseYearMonth(c.req.query("year"), now.getUTCFullYear());
  const month = parseYearMonth(c.req.query("month"), now.getUTCMonth() + 1);

  if (month < 1 || month > 12) {
    return c.json<MonthlyReportResponse>(
      {
        code: "validation_error",
        error: "Month must be between 1 and 12.",
        status: "error",
      },
      400,
    );
  }

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-31`;

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);

  if (accountsError) {
    return c.json<MonthlyReportResponse>(
      {
        code: "database_error",
        error: accountsError.message,
        status: "error",
      },
      500,
    );
  }

  const accountIds = (accounts ?? []).map((account: { id: string }) => account.id);
  if (accountIds.length === 0) {
    return c.json<MonthlyReportResponse>({
      year,
      month,
      summary: summarizeTransactions([]),
      provider: "supabase",
      status: "ok",
    });
  }

  const { data: transactions, error: transactionsError } = await supabase
    .from("transactions")
    .select("id, account_id, date, amount, currency, category, description, source, source_hash, created_at")
    .in("account_id", accountIds)
    .gte("date", monthStart)
    .lte("date", monthEnd)
    .order("date", { ascending: true });

  if (transactionsError) {
    return c.json<MonthlyReportResponse>(
      {
        code: "database_error",
        error: transactionsError.message,
        status: "error",
      },
      500,
    );
  }

  return c.json<MonthlyReportResponse>({
    year,
    month,
    summary: summarizeTransactions((transactions ?? []) as TransactionRecord[]),
    provider: "supabase",
    status: "ok",
  });
});
