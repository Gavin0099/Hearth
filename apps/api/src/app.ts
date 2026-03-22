import { Hono } from "hono";
import { cors } from "hono/cors";
import { reportRoutes } from "./routes/report";
import { portfolioRoutes } from "./routes/portfolio";
import { importRoutes } from "./routes/import";
import { accountsRoutes } from "./routes/accounts";
import { recurringRoutes } from "./routes/recurring";
import { transactionsRoutes } from "./routes/transactions";
import type { ApiEnv, WorkerBindings } from "./types";
import {
  getBearerToken,
  getTokenIssuer,
  resolveAuthenticatedUser as resolveAuthenticatedUserDefault,
} from "./lib/auth";
import { createSupabaseAdminClient as createSupabaseAdminClientDefault } from "./lib/supabase";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export type AccountsQuery = {
  select: (columns: string) => AccountsQuery;
  eq: (column: string, value: string) => AccountsQuery;
  order: (column: string, options: { ascending: boolean }) => Promise<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>;
  insert: (values: Record<string, unknown>) => AccountsInsertQuery;
};

export type AccountsInsertQuery = {
  select: (columns: string) => {
    single: () => Promise<{
      data: unknown | null;
      error: { message: string } | null;
    }>;
  };
};

export type SupabaseAdminClient = {
  from: (table: string) => any;
};

export type AppDependencies = {
  resolveAuthenticatedUser: (
    request: Request,
    env: WorkerBindings,
  ) => Promise<AuthenticatedUser | null>;
  createSupabaseAdminClient: (env: WorkerBindings) => SupabaseAdminClient;
};

const defaultDependencies: AppDependencies = {
  resolveAuthenticatedUser: resolveAuthenticatedUserDefault,
  createSupabaseAdminClient: createSupabaseAdminClientDefault as (
    env: WorkerBindings,
  ) => SupabaseAdminClient,
};

export function createApp(dependencies: Partial<AppDependencies> = {}) {
  const resolvedDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };

  const app = new Hono<ApiEnv>();

  app.use(
    "/api/*",
    cors({
      origin: "*",
      allowHeaders: ["authorization", "content-type"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      exposeHeaders: ["content-length", "content-type"],
      maxAge: 86400,
    }),
  );

  app.use("*", async (c, next) => {
    c.set("resolveAuthenticatedUser", resolvedDependencies.resolveAuthenticatedUser);
    c.set("createSupabaseAdminClient", resolvedDependencies.createSupabaseAdminClient);
    await next();
  });

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
    const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
    const user = await resolveAuthenticatedUser(c.req.raw, c.env);
    if (!user) {
      const token = getBearerToken(c.req.raw);
      if (token) {
        const issuer = getTokenIssuer(token);
        const expectedIssuer = `${c.env.SUPABASE_URL}/auth/v1`;
        if (issuer && issuer !== expectedIssuer) {
          return c.json(
            {
              error: `Bearer token issuer mismatch. expected=${expectedIssuer} actual=${issuer}`,
              status: "error",
            },
            401,
          );
        }
      }

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
  app.route("/api/recurring-templates", recurringRoutes);
  app.route("/api/transactions", transactionsRoutes);

  return app;
}
