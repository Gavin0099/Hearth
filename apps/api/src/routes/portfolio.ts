import { Hono } from "hono";
import type { HoldingRecord, PortfolioHoldingsResponse } from "@hearth/shared";
import type { ApiEnv } from "../types";

export const portfolioRoutes = new Hono<ApiEnv>();

portfolioRoutes.get("/net-worth", (c) => {
  return c.json({
    cashTwd: 0,
    investmentsTwd: 0,
    totalNetWorthTwd: 0,
    monthDeltaTwd: 0,
    provider: "supabase",
    status: "stub",
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

  return c.json<PortfolioHoldingsResponse>({
    items: (data ?? []) as HoldingRecord[],
    count: data?.length ?? 0,
    provider: "supabase",
    status: "ok",
  });
});
