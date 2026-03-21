import { Hono } from "hono";
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

portfolioRoutes.get("/holdings", (c) => {
  return c.json({
    items: [],
    provider: "supabase",
    status: "stub",
  });
});
