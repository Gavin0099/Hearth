const fs = require("fs");

const content = `
// ---------------------------------------------------------------------------
// G: portfolio, report, user-settings contract tests
// ---------------------------------------------------------------------------

// GET /api/portfolio/net-worth
test("GET /api/portfolio/net-worth returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request("/api/portfolio/net-worth", {}, env);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string; status: string };
  assert.equal(body.status, "error");
  assert.equal(body.code, "unauthorized");
});

test("GET /api/portfolio/net-worth returns empty totals when user has no accounts", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          };
        }
        throw new Error(\`Unexpected table \${table}\`);
      },
    }),
  });

  const response = await app.request("/api/portfolio/net-worth", {}, env);
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    totalNetWorthTwd: number;
    cashBankTwd: number;
    status: string;
  };
  assert.equal(body.status, "ok");
  assert.equal(body.totalNetWorthTwd, 0);
  assert.equal(body.cashBankTwd, 0);
});

// GET /api/portfolio/holdings
test("GET /api/portfolio/holdings returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request("/api/portfolio/holdings", {}, env);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string; status: string };
  assert.equal(body.status, "error");
  assert.equal(body.code, "unauthorized");
});

test("GET /api/portfolio/holdings returns empty list when user has no accounts", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
        }
        throw new Error(\`Unexpected table \${table}\`);
      },
    }),
  });

  const response = await app.request("/api/portfolio/holdings", {}, env);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { items: unknown[]; count: number; status: string };
  assert.equal(body.status, "ok");
  assert.equal(body.count, 0);
  assert.deepEqual(body.items, []);
});

// DELETE /api/portfolio/price-snapshots
test("DELETE /api/portfolio/price-snapshots returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request(
    "/api/portfolio/price-snapshots?ticker=AAPL&date=2026-04-01",
    { method: "DELETE" },
    env,
  );
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string; status: string };
  assert.equal(body.code, "unauthorized");
});

test("DELETE /api/portfolio/price-snapshots returns 400 when ticker is missing", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({ from: () => ({}) }),
  });
  const response = await app.request(
    "/api/portfolio/price-snapshots?date=2026-04-01",
    { method: "DELETE" },
    env,
  );
  assert.equal(response.status, 400);
  const body = (await response.json()) as { code: string; status: string };
  assert.equal(body.code, "validation_error");
});

test("DELETE /api/portfolio/price-snapshots deletes a snapshot", async () => {
  let deletedTicker: string | null = null;
  let deletedDate: string | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        assert.equal(table, "price_snapshots");
        return {
          delete: () => ({
            eq: (col: string, val: string) => {
              if (col === "ticker") deletedTicker = val;
              return {
                eq: (col2: string, val2: string) => {
                  if (col2 === "snapshot_date") deletedDate = val2;
                  return Promise.resolve({ error: null, count: 1 });
                },
              };
            },
          }),
        };
      },
    }),
  });

  const response = await app.request(
    "/api/portfolio/price-snapshots?ticker=AAPL&date=2026-04-01",
    { method: "DELETE" },
    env,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { deleted: number; status: string };
  assert.equal(body.status, "ok");
  assert.equal(body.deleted, 1);
  assert.equal(deletedTicker, "AAPL");
  assert.equal(deletedDate, "2026-04-01");
});

// DELETE /api/portfolio/fx-rates
test("DELETE /api/portfolio/fx-rates returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request(
    "/api/portfolio/fx-rates?from_currency=USD&rate_date=2026-04-01",
    { method: "DELETE" },
    env,
  );
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string; status: string };
  assert.equal(body.code, "unauthorized");
});

test("DELETE /api/portfolio/fx-rates deletes a rate", async () => {
  let deletedCurrency: string | null = null;
  let deletedDate: string | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        assert.equal(table, "fx_rates");
        return {
          delete: () => ({
            eq: (col: string, val: string) => {
              if (col === "from_currency") deletedCurrency = val;
              return {
                eq: (col2: string, val2: string) => ({
                  eq: (col3: string, val3: string) => {
                    if (col3 === "rate_date") deletedDate = val3;
                    return Promise.resolve({ error: null, count: 1 });
                  },
                }),
              };
            },
          }),
        };
      },
    }),
  });

  const response = await app.request(
    "/api/portfolio/fx-rates?from_currency=USD&rate_date=2026-04-01",
    { method: "DELETE" },
    env,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { deleted: number; status: string };
  assert.equal(body.status, "ok");
  assert.equal(body.deleted, 1);
  assert.equal(deletedCurrency, "USD");
  assert.equal(deletedDate, "2026-04-01");
});

// GET /api/report/monthly
test("GET /api/report/monthly returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request("/api/report/monthly", {}, env);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string; status: string };
  assert.equal(body.code, "unauthorized");
});

test("GET /api/report/monthly returns 400 for invalid month", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({ from: () => ({}) }),
  });
  const response = await app.request("/api/report/monthly?year=2026&month=13", {}, env);
  assert.equal(response.status, 400);
  const body = (await response.json()) as { code: string; status: string };
  assert.equal(body.code, "validation_error");
});

test("GET /api/report/monthly returns empty summary when user has no accounts", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
        }
        throw new Error(\`Unexpected table \${table}\`);
      },
    }),
  });

  const response = await app.request("/api/report/monthly?year=2026&month=3", {}, env);
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    year: number;
    month: number;
    summary: { income: number; expense: number };
    status: string;
  };
  assert.equal(body.status, "ok");
  assert.equal(body.year, 2026);
  assert.equal(body.month, 3);
  assert.equal(body.summary.income, 0);
  assert.equal(body.summary.expense, 0);
});

test("GET /api/report/monthly summarizes transactions correctly", async () => {
  const transactions = [
    { id: "t1", account_id: "acct-1", date: "2026-03-05", amount: "-500", currency: "TWD", category: "餐飲", description: "Lunch", source: null, source_hash: null, created_at: "2026-03-05T00:00:00Z" },
    { id: "t2", account_id: "acct-1", date: "2026-03-10", amount: "50000", currency: "TWD", category: null, description: "Salary", source: null, source_hash: null, created_at: "2026-03-10T00:00:00Z" },
    { id: "t3", account_id: "acct-1", date: "2026-03-15", amount: "-1200", currency: "TWD", category: "餐飲", description: "Dinner", source: null, source_hash: null, created_at: "2026-03-15T00:00:00Z" },
  ];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return { select: () => ({ eq: async () => ({ data: [{ id: "acct-1" }], error: null }) }) };
        }
        if (table === "transactions") {
          return {
            select: () => ({
              in: () => ({
                gte: () => ({
                  lte: () => ({
                    order: async () => ({ data: transactions, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(\`Unexpected table \${table}\`);
      },
    }),
  });

  const response = await app.request("/api/report/monthly?year=2026&month=3", {}, env);
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    summary: { income: number; expense: number; categories: Array<{ category: string; amount: number }> };
    status: string;
  };
  assert.equal(body.status, "ok");
  assert.equal(body.summary.income, 50000);
  assert.equal(body.summary.expense, 1700);
  const diningCategory = body.summary.categories.find((c) => c.category === "餐飲");
  assert.ok(diningCategory);
  assert.equal(diningCategory?.amount, 1700);
});

// GET /api/user-settings
test("GET /api/user-settings returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request("/api/user-settings", {}, env);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { status: string };
  assert.equal(body.status, "error");
});

test("GET /api/user-settings returns has_* flags when settings exist", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                default_pdf_password: "some-encrypted-value",
                sinopac_pdf_password: null,
                esun_pdf_password: null,
                taishin_pdf_password: null,
                gmail_connected: true,
                gmail_last_sync_at: "2026-04-01T00:00:00Z",
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  });

  const response = await app.request("/api/user-settings", {}, env);
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    settings: {
      has_default_pdf_password: boolean;
      has_sinopac_pdf_password: boolean;
      gmail_connected: boolean;
    };
    status: string;
  };
  assert.equal(body.status, "ok");
  assert.equal(body.settings.has_default_pdf_password, true);
  assert.equal(body.settings.has_sinopac_pdf_password, false);
  assert.equal(body.settings.gmail_connected, true);
});

// PUT /api/user-settings
test("PUT /api/user-settings returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request(
    "/api/user-settings",
    {
      method: "PUT",
      body: JSON.stringify({ gmail_connected: true }),
      headers: { "content-type": "application/json" },
    },
    env,
  );
  assert.equal(response.status, 401);
});

test("PUT /api/user-settings saves gmail_connected without secret key", async () => {
  let upsertedPayload: Record<string, unknown> | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: () => ({
        upsert: async (payload: Record<string, unknown>) => {
          upsertedPayload = payload;
          return { error: null };
        },
      }),
    }),
  });

  const response = await app.request(
    "/api/user-settings",
    {
      method: "PUT",
      body: JSON.stringify({ gmail_connected: true, gmail_last_sync_at: "2026-04-01T00:00:00Z" }),
      headers: { "content-type": "application/json" },
    },
    env,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { status: string };
  assert.equal(body.status, "ok");
  assert.equal(upsertedPayload?.gmail_connected, true);
  assert.equal(upsertedPayload?.gmail_last_sync_at, "2026-04-01T00:00:00Z");
  assert.equal(upsertedPayload?.user_id, "user-1");
});
`;

const testFile = "c:/Users/reiko/Hearth/apps/api/tests/auth-accounts.test.ts";
fs.appendFileSync(testFile, content, "utf-8");
const lines = fs.readFileSync(testFile, "utf-8").split("\n").length;
console.log("done, lines:", lines);
