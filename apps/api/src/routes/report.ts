import { Hono } from "hono";
import type { ApiEnv } from "../types";

export const reportRoutes = new Hono<ApiEnv>();

reportRoutes.get("/monthly", (c) => {
  return c.json({
    year: c.req.query("year") ?? null,
    month: c.req.query("month") ?? null,
    summary: {
      income: 0,
      expense: 0,
      categories: [],
      dailySeries: [],
    },
    provider: "supabase",
    status: "stub",
  });
});
