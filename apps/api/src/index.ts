import { Hono } from "hono";
import { reportRoutes } from "./routes/report";
import { portfolioRoutes } from "./routes/portfolio";
import { importRoutes } from "./routes/import";
import { accountsRoutes } from "./routes/accounts";
import type { ApiEnv } from "./types";
import { resolveAuthenticatedUser } from "./lib/auth";

const app = new Hono<ApiEnv>();

app.get("/health", (c) =>
  c.json({
    service: "hearth-api",
    status: "ok",
    runtime: "cloudflare-workers",
    supabaseConfigured: Boolean(
      c.env.SUPABASE_URL && c.env.SUPABASE_ANON_KEY && c.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  }),
);

app.get("/api/auth/me", async (c) => {
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json(
      {
        error: "Missing or invalid Supabase bearer token.",
        status: "error",
      },
      401,
    );
  }

  return c.json({
    user,
    status: "ok",
  });
});

app.route("/api/report", reportRoutes);
app.route("/api/portfolio", portfolioRoutes);
app.route("/api/import", importRoutes);
app.route("/api/accounts", accountsRoutes);

export default app;
