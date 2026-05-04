import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { createApp, type AuthenticatedUser, type SupabaseAdminClient } from "../src/app";
import { buildTransactionSourceHash } from "../src/lib/transaction-hash";
import type { WorkerBindings } from "../src/types";

const env: WorkerBindings = {
  APP_ENV: "test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  USER_SETTINGS_SECRET_KEY: "test-user-settings-secret",
};

function createExcelMonthlyFile(rows: unknown[][]) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "March");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new File([buffer], "monthly.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function createExcelMonthlyWorkbook(
  sheets: Array<{
    name: string;
    rows: unknown[][];
    merges?: string[];
  }>,
) {
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, rows, merges }) => {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    if (merges?.length) {
      worksheet["!merges"] = merges.map((range) => XLSX.utils.decode_range(range));
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  });
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new File([buffer], "monthly.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function createTestApp(options?: {
  user?: AuthenticatedUser | null;
  accounts?: Array<Record<string, unknown>>;
  insertResult?: Record<string, unknown> | null;
}) {
  const accounts = options?.accounts ?? [];
  const insertResult = options?.insertResult ?? {
    id: "account-2",
    user_id: "user-1",
    name: "永豐台股",
    type: "investment_tw",
    currency: "TWD",
    broker: "Sinopac",
    created_at: "2026-03-21T00:00:00Z",
  };

  const createSupabaseAdminClient = (): SupabaseAdminClient => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: accounts,
            error: null,
          }),
        }),
        insert: (_values: Record<string, unknown>) => ({
          select: () => ({
            single: async () => ({
              data: insertResult,
              error: null,
            }),
          }),
        }),
      }),
      insert: (_values: Record<string, unknown>) => ({
        select: () => ({
          single: async () => ({
            data: insertResult,
            error: null,
          }),
        }),
      }),
      eq: () => ({
        order: async () => ({
          data: accounts,
          error: null,
        }),
      }),
      order: async () => ({
        data: accounts,
        error: null,
      }),
    }),
  });

  return createApp({
    resolveAuthenticatedUser: async () => options?.user ?? null,
    createSupabaseAdminClient,
  });
}

test("GET /api/auth/me returns 401 when no bearer user resolves", async () => {
  const app = createTestApp({ user: null });
  const response = await app.request("/api/auth/me", {}, env);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Missing or invalid Supabase bearer token.",
    status: "error",
  });
});

test("GET /api/auth/me returns resolved user when token is valid", async () => {
  const app = createTestApp({
    user: {
      id: "user-1",
      email: "reiko0099@gmail.com",
    },
  });
  const response = await app.request("/api/auth/me", {}, env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    user: {
      id: "user-1",
      email: "reiko0099@gmail.com",
    },
  });
});

test("GET /api/accounts returns user-scoped account list", async () => {
  const app = createTestApp({
    user: {
      id: "user-1",
      email: "reiko0099@gmail.com",
    },
    accounts: [
      {
        id: "account-1",
        user_id: "user-1",
        name: "永豐銀行",
        type: "cash_bank",
        currency: "TWD",
        broker: null,
        created_at: "2026-03-21T00:00:00Z",
      },
    ],
  });

  const response = await app.request("/api/accounts", {}, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    count: 1,
    items: [
      {
        id: "account-1",
        user_id: "user-1",
        name: "永豐銀行",
        type: "cash_bank",
        currency: "TWD",
        broker: null,
        created_at: "2026-03-21T00:00:00Z",
      },
    ],
    status: "ok",
  });
});

test("POST /api/accounts validates missing account name", async () => {
  const app = createTestApp({
    user: {
      id: "user-1",
      email: "reiko0099@gmail.com",
    },
  });

  const response = await app.request(
    "/api/accounts",
    {
      method: "POST",
      body: JSON.stringify({
        name: "   ",
        type: "cash_bank",
      }),
      headers: {
        "content-type": "application/json",
      },
    },
    env,
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    code: "validation_error",
    error: "Account name is required.",
    status: "error",
  });
});

test("POST /api/accounts creates a new account", async () => {
  const app = createTestApp({
    user: {
      id: "user-1",
      email: "reiko0099@gmail.com",
    },
  });

  const response = await app.request(
    "/api/accounts",
    {
      method: "POST",
      body: JSON.stringify({
        name: "永豐台股",
        type: "investment_tw",
        currency: "twd",
        broker: "Sinopac",
      }),
      headers: {
        "content-type": "application/json",
      },
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    count: 1,
    items: [
      {
        id: "account-2",
        user_id: "user-1",
        name: "永豐台股",
        type: "investment_tw",
        currency: "TWD",
        broker: "Sinopac",
        created_at: "2026-03-21T00:00:00Z",
      },
    ],
    status: "ok",
  });
});

test("DELETE /api/accounts/:id deletes an owned account", async () => {
  let deletedId: string | null = null;
  let deletedUserId: string | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        assert.equal(table, "accounts");
        return {
          delete: () => ({
            eq: (col: string, val: string) => ({
              eq: async (col2: string, val2: string) => {
                if (col === "id") deletedId = val;
                if (col2 === "user_id") deletedUserId = val2;
                return { error: null };
              },
            }),
          }),
        };
      },
    }),
  });

  const response = await app.request("/api/accounts/account-1", { method: "DELETE" }, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(deletedId, "account-1");
  assert.equal(deletedUserId, "user-1");
});

test("DELETE /api/accounts/:id returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request("/api/accounts/account-1", { method: "DELETE" }, env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    code: "unauthorized",
    error: "Missing or invalid Supabase bearer token.",
    status: "error",
  });
});

test("GET /api/report/monthly summarizes income, expense, categories, and daily totals", async () => {
  const transactions = [
    {
      id: "txn-1",
      account_id: "account-1",
      date: "2026-03-02",
      amount: -120,
      currency: "TWD",
      category: "餐飲",
      description: "Lunch",
      source: "manual",
      source_hash: null,
      created_at: "2026-03-21T00:00:00Z",
    },
    {
      id: "txn-2",
      account_id: "account-1",
      date: "2026-03-02",
      amount: 5000,
      currency: "TWD",
      category: "薪資",
      description: "Income",
      source: "manual",
      source_hash: null,
      created_at: "2026-03-21T00:00:00Z",
    },
    {
      id: "txn-3",
      account_id: "account-1",
      date: "2026-03-03",
      amount: -80,
      currency: "TWD",
      category: "交通",
      description: "Metro",
      source: "manual",
      source_hash: null,
      created_at: "2026-03-21T00:00:00Z",
    },
  ];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: () => ({
                gte: () => ({
                  lte: () => ({
                    order: async () => ({
                      data: transactions,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/report/monthly?year=2026&month=3", {}, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    year: 2026,
    month: 3,
    provider: "supabase",
    status: "ok",
    summary: {
      income: 5000,
      expense: 200,
      transactionCount: 3,
      categories: [
        { category: "餐飲", amount: 120 },
        { category: "交通", amount: 80 },
      ],
      dailySeries: [
        { date: "2026-03-02", expense: 120, income: 5000 },
        { date: "2026-03-03", expense: 80, income: 0 },
      ],
    },
  });
});

test("GET /api/portfolio/holdings returns 401 when no bearer user resolves", async () => {
  const app = createTestApp({ user: null });
  const response = await app.request("/api/portfolio/holdings", {}, env);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    code: "unauthorized",
    error: "Missing or invalid Supabase bearer token.",
    status: "error",
  });
});

test("GET /api/portfolio/holdings returns owned holdings", async () => {
  const holdings = [
    {
      id: "holding-1",
      account_id: "account-1",
      ticker: "2330",
      name: "台積電",
      total_shares: 12.5,
      avg_cost: 610.25,
      currency: "TWD",
      updated_at: "2026-03-22T00:00:00Z",
      close_price: 912,
      price_as_of: "2026-03-31",
    },
  ];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "holdings") {
          return {
            select: () => ({
              in: () => ({
                order: async () => ({
                  data: holdings.map(({ close_price: _closePrice, price_as_of: _priceAsOf, ...holding }) => holding),
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "price_snapshots") {
          return {
            select: () => ({
              in: () => ({
                order: async () => ({
                  data: [{ ticker: "2330", close_price: 912, snapshot_date: "2026-03-31" }],
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/portfolio/holdings", {}, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: holdings,
    count: 1,
    provider: "supabase",
    status: "ok",
  });
});

test("GET /api/portfolio/dividends returns owned dividends ordered newest first", async () => {
  const dividends = [
    {
      id: "div-2",
      account_id: "account-1",
      ticker: "0056",
      pay_date: "2026-03-15",
      gross_amount: 1200,
      tax_withheld: 120,
      net_amount: 1080,
      currency: "TWD",
      created_at: "2026-03-16T00:00:00Z",
    },
    {
      id: "div-1",
      account_id: "account-1",
      ticker: "00919",
      pay_date: "2026-02-20",
      gross_amount: 900,
      tax_withheld: 0,
      net_amount: 900,
      currency: "TWD",
      created_at: "2026-02-21T00:00:00Z",
    },
  ];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "dividends") {
          return {
            select: () => ({
              in: () => ({
                order: () => ({
                  order: async () => ({
                    data: dividends,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/portfolio/dividends", {}, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: dividends,
    count: 2,
    provider: "supabase",
    status: "ok",
  });
});

test("GET /api/user-settings returns secret presence flags instead of raw PDF passwords", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "user_settings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    default_pdf_password: "secret-default",
                    sinopac_pdf_password: null,
                    esun_pdf_password: "secret-esun",
                    taishin_pdf_password: "secret-taishin",
                    gmail_connected: true,
                    gmail_last_sync_at: "2026-03-31T12:00:00Z",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/user-settings", {}, env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    settings: {
      has_default_pdf_password: true,
      has_sinopac_pdf_password: false,
      has_esun_pdf_password: true,
      has_taishin_pdf_password: true,
      gmail_connected: true,
      gmail_last_sync_at: "2026-03-31T12:00:00Z",
    },
    status: "ok",
  });
});

test("GET /api/user-settings/pdf-passwords returns raw PDF passwords only on explicit secret fetch", async () => {
  let savedRows: Array<Record<string, unknown>> = [];
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "user_settings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: savedRows[0] ?? null,
                  error: null,
                }),
              }),
            }),
            upsert: async (value: Record<string, unknown>) => {
              savedRows = [value];
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const putResponse = await app.request(
    "/api/user-settings",
    {
      method: "PUT",
      body: JSON.stringify({
        default_pdf_password: "secret-default",
        sinopac_pdf_password: "secret-sinopac",
        taishin_pdf_password: "secret-taishin",
      }),
      headers: {
        "content-type": "application/json",
      },
    },
    env,
  );

  assert.equal(putResponse.status, 200);
  assert.equal(typeof savedRows[0]?.default_pdf_password, "string");
  assert.notEqual(savedRows[0]?.default_pdf_password, "secret-default");
  assert.match(String(savedRows[0]?.default_pdf_password), /^v1\./);

  const response = await app.request("/api/user-settings/pdf-passwords", {}, env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    settings: {
      default_pdf_password: "secret-default",
      sinopac_pdf_password: "secret-sinopac",
      esun_pdf_password: null,
      taishin_pdf_password: "secret-taishin",
    },
    status: "ok",
  });
});

test("GET /api/user-settings/pdf-passwords upgrades legacy plaintext rows after reading them", async () => {
  const initialRow = {
    user_id: "user-1",
    default_pdf_password: "legacy-default",
    sinopac_pdf_password: null,
    esun_pdf_password: "legacy-esun",
    taishin_pdf_password: null,
  };
  let storedRow: Record<string, unknown> | null = initialRow;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "user_settings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: storedRow,
                  error: null,
                }),
              }),
            }),
            upsert: async (value: Record<string, unknown>) => {
              storedRow = { ...storedRow, ...value };
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/user-settings/pdf-passwords", {}, env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    settings: {
      default_pdf_password: "legacy-default",
      sinopac_pdf_password: null,
      esun_pdf_password: "legacy-esun",
      taishin_pdf_password: null,
    },
    status: "ok",
  });
  assert.match(String(storedRow?.default_pdf_password), /^v1\./);
  assert.match(String(storedRow?.esun_pdf_password), /^v1\./);
  assert.notEqual(storedRow?.default_pdf_password, "legacy-default");
  assert.notEqual(storedRow?.esun_pdf_password, "legacy-esun");
});

test("GET /api/user-settings/pdf-passwords fails when secret key is unavailable", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "user_settings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/user-settings/pdf-passwords", {}, {
    ...env,
    USER_SETTINGS_SECRET_KEY: undefined,
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "USER_SETTINGS_SECRET_KEY is not configured.",
    status: "error",
  });
});

test("PUT /api/user-settings fails cleanly when secret key is unavailable", async () => {
  let upsertCalled = false;
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "user_settings") {
          return {
            upsert: async () => {
              upsertCalled = true;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request(
    "/api/user-settings",
    {
      method: "PUT",
      body: JSON.stringify({
        default_pdf_password: "secret-default",
      }),
      headers: {
        "content-type": "application/json",
      },
    },
    {
      ...env,
      USER_SETTINGS_SECRET_KEY: undefined,
    },
  );

  assert.equal(response.status, 500);
  assert.equal(upsertCalled, false);
  assert.deepEqual(await response.json(), {
    error: "USER_SETTINGS_SECRET_KEY is not configured.",
    status: "error",
  });
});

test("GET /api/report/monthly excludes out-of-month rows and aggregates same-day totals across accounts", async () => {
  const transactions = [
    {
      id: "txn-a",
      account_id: "account-1",
      date: "2026-03-01",
      amount: -100,
      currency: "TWD",
      category: "餐飲",
      description: "Breakfast",
      source: "manual",
      source_hash: null,
      created_at: "2026-03-21T00:00:00Z",
    },
    {
      id: "txn-b",
      account_id: "account-2",
      date: "2026-03-01",
      amount: -200,
      currency: "TWD",
      category: "交通",
      description: "Taxi",
      source: "manual",
      source_hash: null,
      created_at: "2026-03-21T00:00:00Z",
    },
    {
      id: "txn-c",
      account_id: "account-2",
      date: "2026-03-15",
      amount: 5000,
      currency: "TWD",
      category: "薪資",
      description: "Salary",
      source: "manual",
      source_hash: null,
      created_at: "2026-03-21T00:00:00Z",
    },
  ];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }, { id: "account-2" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: () => ({
                gte: (_column: string, start: string) => ({
                  lte: (_lteColumn: string, end: string) => ({
                    order: async () => ({
                      data: [
                        ...transactions,
                        {
                          id: "txn-outside",
                          account_id: "account-1",
                          date: "2026-04-01",
                          amount: -999,
                          currency: "TWD",
                          category: "餐飲",
                          description: "Should be excluded",
                          source: "manual",
                          source_hash: null,
                          created_at: "2026-03-21T00:00:00Z",
                        },
                      ].filter((item) => item.date >= start && item.date <= end),
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/report/monthly?year=2026&month=3", {}, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    year: 2026,
    month: 3,
    provider: "supabase",
    status: "ok",
    summary: {
      income: 5000,
      expense: 300,
      transactionCount: 3,
      categories: [
        { category: "交通", amount: 200 },
        { category: "餐飲", amount: 100 },
      ],
      dailySeries: [
        { date: "2026-03-01", expense: 300, income: 0 },
        { date: "2026-03-15", expense: 0, income: 5000 },
      ],
    },
  });
});

test("GET /api/portfolio/net-worth includes FX-adjusted holdings plus dividend summary", async () => {
  let savedSnapshot: Record<string, unknown> | null = null;
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { id: "account-bank", type: "cash_bank", currency: "TWD" },
                  { id: "account-foreign", type: "investment_foreign", currency: "USD" },
                ],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  { account_id: "account-bank", amount: 20000 },
                  { account_id: "account-foreign", amount: 1000 },
                ],
                error: null,
              }),
            }),
          };
        }

        if (table === "holdings") {
          return {
            select: () => ({
              in: () => ({
                data: [
                  {
                    account_id: "account-foreign",
                    ticker: "NVDA",
                    total_shares: 2,
                    avg_cost: 100,
                    currency: "USD",
                  },
                ],
                error: null,
              }),
            }),
          };
        }

        if (table === "price_snapshots") {
          return {
            select: () => ({
              in: () => ({
                order: async () => ({
                  data: [{ ticker: "NVDA", close_price: 120, snapshot_date: "2026-03-31" }],
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "fx_rates") {
          return {
            select: () => ({
              in: () => ({
                eq: () => ({
                  order: async () => ({
                    data: [{ from_currency: "USD", rate: 32.5, rate_date: "2026-03-31" }],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === "dividends") {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  { pay_date: "2026-03-15", net_amount: 12, currency: "USD" },
                  { pay_date: "2025-12-20", net_amount: 300, currency: "TWD" },
                ],
                error: null,
              }),
            }),
          };
        }

        if (table === "net_worth_snapshots") {
          return {
            upsert: async (value: Record<string, unknown>) => {
              savedSnapshot = value;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/portfolio/net-worth", {}, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    cashBankTwd: 20000,
    cashCreditTwd: 0,
    investmentsTwd: 7800,
    dividendsReceivedTwd: 690,
    dividendsYearToDateTwd: 390,
    totalNetWorthTwd: 27800,
    priceAsOf: "2026-03-31",
    status: "ok",
  });
  assert.deepEqual(savedSnapshot, {
    user_id: "user-1",
    snapshot_date: new Date().toISOString().slice(0, 10),
    total_twd: 27800,
    cash_bank_twd: 20000,
    investments_twd: 7800,
  });
});

test("GET /api/portfolio/net-worth returns database_error when price snapshot lookup fails", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1", type: "investment_tw", currency: "TWD" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
          };
        }

        if (table === "holdings") {
          return {
            select: () => ({
              in: () => ({
                data: [
                  {
                    account_id: "account-1",
                    ticker: "2330",
                    total_shares: 1,
                    avg_cost: 600,
                    currency: "TWD",
                  },
                ],
                error: null,
              }),
            }),
          };
        }

        if (table === "price_snapshots") {
          return {
            select: () => ({
              in: () => ({
                order: async () => ({
                  data: null,
                  error: { message: "price lookup failed" },
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/portfolio/net-worth", {}, env);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    code: "database_error",
    error: "price lookup failed",
    status: "error",
  });
});

test("GET /api/portfolio/net-worth returns database_error when snapshot upsert fails", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-bank", type: "cash_bank", currency: "TWD" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ account_id: "account-bank", amount: 20000 }],
                error: null,
              }),
            }),
          };
        }

        if (table === "holdings") {
          return {
            select: () => ({
              in: () => ({
                data: [],
                error: null,
              }),
            }),
          };
        }

        if (table === "dividends") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
          };
        }

        if (table === "net_worth_snapshots") {
          return {
            upsert: async () => ({
              error: { message: "snapshot upsert failed" },
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/portfolio/net-worth", {}, env);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    code: "database_error",
    error: "snapshot upsert failed",
    status: "error",
  });
});

test("GET /api/portfolio/net-worth-history returns owned snapshot history", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "net_worth_snapshots") {
          return {
            select: () => ({
              eq: () => ({
                gte: () => ({
                  order: async () => ({
                    data: [
                      {
                        snapshot_date: "2026-03-30",
                        total_twd: "26000",
                        cash_bank_twd: "20000",
                        investments_twd: "6000",
                      },
                      {
                        snapshot_date: "2026-03-31",
                        total_twd: "27800",
                        cash_bank_twd: "20000",
                        investments_twd: "7800",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/portfolio/net-worth-history?days=90", {}, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    snapshots: [
      {
        snapshot_date: "2026-03-30",
        total_twd: 26000,
        cash_bank_twd: 20000,
        investments_twd: 6000,
      },
      {
        snapshot_date: "2026-03-31",
        total_twd: 27800,
        cash_bank_twd: 20000,
        investments_twd: 7800,
      },
    ],
    status: "ok",
  });
});

test("GET /api/portfolio/trade-costs aggregates fee and tax per ticker and currency", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }, { id: "account-2" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "investment_trades") {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  { ticker: "2330", fee: 20, tax: 60, currency: "TWD" },
                  { ticker: "2330", fee: 15, tax: 45, currency: "TWD" },
                  { ticker: "0050", fee: 12, tax: 0, currency: "TWD" },
                  { ticker: "AAPL", fee: 8, tax: 0, currency: "USD" },
                ],
                error: null,
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/portfolio/trade-costs", {}, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: [
      { ticker: "2330", currency: "TWD", total_fee: 35, total_tax: 105, trade_count: 2 },
      { ticker: "0050", currency: "TWD", total_fee: 12, total_tax: 0, trade_count: 1 },
      { ticker: "AAPL", currency: "USD", total_fee: 8, total_tax: 0, trade_count: 1 },
    ],
    status: "ok",
  });
});

test("GET /api/portfolio/fx-rates returns database_error when holdings lookup fails", async () => {
  let accountSelectCount = 0;
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => {
                accountSelectCount += 1;
                return {
                  data:
                    accountSelectCount === 1
                      ? [{ currency: "USD" }]
                      : [{ id: "account-1" }],
                  error: null,
                };
              },
            }),
          };
        }

        if (table === "holdings") {
          return {
            select: () => ({
              in: async () => ({
                data: null,
                error: { message: "holdings lookup failed" },
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/portfolio/fx-rates", {}, env);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    code: "database_error",
    error: "holdings lookup failed",
    status: "error",
  });
});

test("POST /api/transactions creates a manual transaction for an owned account", async () => {
  const createdTransaction = {
    id: "txn-9",
    account_id: "account-1",
    date: "2026-03-21",
    amount: -180,
    currency: "TWD",
    category: "餐飲",
    description: "Dinner",
    source: "manual",
    source_hash: null,
    created_at: "2026-03-21T00:00:00Z",
  };

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: createdTransaction,
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request(
    "/api/transactions",
    {
      method: "POST",
      body: JSON.stringify({
        account_id: "account-1",
        date: "2026-03-21",
        amount: -180,
        category: "餐飲",
        description: "Dinner",
      }),
      headers: {
        "content-type": "application/json",
      },
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    count: 1,
    items: [createdTransaction],
    status: "ok",
  });
});

test("GET /api/transactions supports account/date/category/keyword filters", async () => {
  const transactions = [
    {
      id: "txn-1",
      account_id: "account-1",
      date: "2026-03-10",
      amount: -100,
      currency: "TWD",
      category: "餐飲",
      description: "Lunch",
      source: "manual",
      source_hash: null,
      created_at: "2026-03-22T00:00:00Z",
    },
    {
      id: "txn-2",
      account_id: "account-1",
      date: "2026-03-11",
      amount: -200,
      currency: "TWD",
      category: "交通",
      description: "Taxi",
      source: "manual",
      source_hash: null,
      created_at: "2026-03-22T00:00:00Z",
    },
    {
      id: "txn-3",
      account_id: "account-2",
      date: "2026-03-12",
      amount: -300,
      currency: "TWD",
      category: "餐飲",
      description: "Dinner",
      source: "manual",
      source_hash: null,
      created_at: "2026-03-22T00:00:00Z",
    },
  ];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }, { id: "account-2" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          let filtered = [...transactions];
          return {
            select: () => ({
              in: (_column: string, ids: string[]) => {
                filtered = filtered.filter((item) => ids.includes(item.account_id));
                return {
                  eq: (_eqColumn: string, value: string) => {
                    filtered = filtered.filter((item) => String((item as Record<string, unknown>)[_eqColumn]) === value);
                    return {
                      gte: (_gteColumn: string, gteValue: string) => {
                        filtered = filtered.filter((item) => String((item as Record<string, unknown>)[_gteColumn]) >= gteValue);
                        return {
                          lte: (_lteColumn: string, lteValue: string) => {
                            filtered = filtered.filter((item) => String((item as Record<string, unknown>)[_lteColumn]) <= lteValue);
                            return {
                              ilike: (_ilikeColumn: string, pattern: string) => {
                                const keyword = pattern.replace(/%/g, "").toLowerCase();
                                filtered = filtered.filter((item) =>
                                  String((item as Record<string, unknown>)[_ilikeColumn] ?? "")
                                    .toLowerCase()
                                    .includes(keyword),
                                );
                                return {
                                  order: async () => ({
                                    data: filtered,
                                    error: null,
                                  }),
                                };
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                  gte: (_gteColumn: string, gteValue: string) => {
                    filtered = filtered.filter((item) => String((item as Record<string, unknown>)[_gteColumn]) >= gteValue);
                    return {
                      lte: (_lteColumn: string, lteValue: string) => {
                        filtered = filtered.filter((item) => String((item as Record<string, unknown>)[_lteColumn]) <= lteValue);
                        return {
                          ilike: (_ilikeColumn: string, pattern: string) => {
                            const keyword = pattern.replace(/%/g, "").toLowerCase();
                            filtered = filtered.filter((item) =>
                              String((item as Record<string, unknown>)[_ilikeColumn] ?? "")
                                .toLowerCase()
                                .includes(keyword),
                            );
                            return {
                              order: async () => ({
                                data: filtered,
                                error: null,
                              }),
                            };
                          },
                        };
                      },
                    };
                  },
                  order: async () => ({
                    data: filtered,
                    error: null,
                  }),
                };
              },
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request(
    "/api/transactions?account_id=account-1&category=%E9%A4%90%E9%A3%B2&date_from=2026-03-01&date_to=2026-03-31&q=Lunch",
    {},
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    count: 1,
    items: [transactions[0]],
    status: "ok",
  });
});

test("DELETE /api/transactions/:transactionId deletes an owned transaction", async () => {
  const deletedTransaction = {
    id: "txn-9",
    account_id: "account-1",
    date: "2026-03-21",
    amount: -180,
    currency: "TWD",
    category: "餐飲",
    description: "Dinner",
    source: "manual",
    source_hash: null,
    created_at: "2026-03-21T00:00:00Z",
  };

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            delete: () => ({
              eq: () => ({
                in: () => ({
                  select: async () => ({
                    data: [deletedTransaction],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request(
    "/api/transactions/txn-9",
    {
      method: "DELETE",
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    count: 1,
    items: [deletedTransaction],
    status: "ok",
  });
});

test("PUT /api/transactions/:transactionId updates an owned transaction", async () => {
  const updatedTransaction = {
    id: "txn-9",
    account_id: "account-1",
    date: "2026-03-25",
    amount: -220,
    currency: "TWD",
    category: "餐飲",
    description: "Updated dinner",
    source: "manual",
    source_hash: null,
    created_at: "2026-03-21T00:00:00Z",
  };

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            update: () => ({
              eq: () => ({
                in: () => ({
                  select: async () => ({
                    data: [updatedTransaction],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request(
    "/api/transactions/txn-9",
    {
      method: "PUT",
      body: JSON.stringify({
        date: "2026-03-25",
        amount: -220,
        category: "餐飲",
        description: "Updated dinner",
      }),
      headers: {
        "content-type": "application/json",
      },
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    count: 1,
    items: [updatedTransaction],
    status: "ok",
  });
});

test("PUT /api/transactions/:transactionId rejects transactions outside the user's owned accounts", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            update: () => ({
              eq: () => ({
                in: () => ({
                  select: async () => ({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request(
    "/api/transactions/txn-404",
    {
      method: "PUT",
      body: JSON.stringify({
        amount: -300,
      }),
      headers: {
        "content-type": "application/json",
      },
    },
    env,
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    code: "validation_error",
    error: "Transaction does not belong to the current user.",
    status: "error",
  });
});

test("DELETE /api/transactions/:transactionId rejects transactions outside the user's owned accounts", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            delete: () => ({
              eq: () => ({
                in: () => ({
                  select: async () => ({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request(
    "/api/transactions/txn-404",
    {
      method: "DELETE",
    },
    env,
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    code: "validation_error",
    error: "Transaction does not belong to the current user.",
    status: "error",
  });
});

test("POST /api/import/transactions-csv imports normalized transaction csv rows", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    new File(
      [
        "date,amount,currency,category,description\n2026-03-10,-150,TWD,餐飲,Dinner\n2026-03-11,3000,TWD,薪資,Bonus\n",
      ],
      "transactions.csv",
      { type: "text/csv" },
    ),
  );

  const response = await app.request(
    "/api/import/transactions-csv",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "transactions-csv",
    imported: 2,
    skipped: 0,
    failed: 0,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
    warnings: [],
    recurringCandidates: [],
  });
  assert.deepEqual(insertedRows, [
    {
      account_id: "account-1",
      date: "2026-03-10",
      amount: -150,
      currency: "TWD",
      category: "餐飲",
      description: "Dinner",
      source: "csv_import",
      source_hash: insertedRows[0]?.source_hash,
    },
    {
      account_id: "account-1",
      date: "2026-03-11",
      amount: 3000,
      currency: "TWD",
      category: "薪資",
      description: "Bonus",
      source: "csv_import",
      source_hash: insertedRows[1]?.source_hash,
    },
  ]);
});

test("POST /api/import/preview returns parser-backed preview for normalized transaction csv", async () => {
  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set("import_mode", "transactions-csv");
  formData.set(
    "file",
    new File(
      [
        "date,amount,currency,category,description\n2026-03-10,-150,TWD,Food,Dinner\n2026-03-11,0,TWD,Bonus,Invalid\n",
      ],
      "transactions.csv",
      { type: "text/csv" },
    ),
  );

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/import/preview", { method: "POST", body: formData }, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "transactions-csv",
    validRows: 1,
    failedRows: 1,
    skipped: 0,
    estimatedRows: 2,
    columns: ["date", "amount", "currency", "category", "description", "source"],
    sampleRows: [["2026-03-10", "-150", "TWD", "Food", "Dinner", "csv_import"]],
    errors: ["line 3: amount must be a non-zero number"],
    status: "ok",
  });
});

test("POST /api/import/preview returns unauthorized when bearer user is missing", async () => {
  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set("import_mode", "transactions-csv");
  formData.set(
    "file",
    new File(["date,amount,currency,category,description\n2026-03-10,-150,TWD,Food,Dinner\n"], "preview.csv", {
      type: "text/csv",
    }),
  );

  const app = createApp({
    resolveAuthenticatedUser: async () => null,
  });

  const response = await app.request("/api/import/preview", { method: "POST", body: formData }, env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    code: "unauthorized",
    error: "Missing or invalid Supabase bearer token.",
    status: "error",
  });
});

test("POST /api/import/preview validates missing import_mode", async () => {
  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    new File(["date,amount,currency,category,description\n2026-03-10,-150,TWD,Food,Dinner\n"], "preview.csv", {
      type: "text/csv",
    }),
  );

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
  });

  const response = await app.request("/api/import/preview", { method: "POST", body: formData }, env);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    code: "validation_error",
    error: "import_mode is required.",
    status: "error",
  });
});

test("POST /api/import/preview validates missing account_id", async () => {
  const formData = new FormData();
  formData.set("import_mode", "transactions-csv");
  formData.set(
    "file",
    new File(["date,amount,currency,category,description\n2026-03-10,-150,TWD,Food,Dinner\n"], "preview.csv", {
      type: "text/csv",
    }),
  );

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
  });

  const response = await app.request("/api/import/preview", { method: "POST", body: formData }, env);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    code: "validation_error",
    error: "account_id is required.",
    status: "error",
  });
});

test("POST /api/import/preview returns parser-backed preview for sinopac-tw", async () => {
  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set("import_mode", "sinopac-tw");
  formData.set(
    "file",
    new File(
      [
        "日期,金額,摘要,幣別,收支別\n2026/03/12,120,午餐,TWD,支出\n小計,,,,\n2026/03/13,1500,退款,TWD,收入\n",
      ],
      "sinopac-preview.csv",
      { type: "text/csv" },
    ),
  );

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/import/preview", { method: "POST", body: formData }, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "sinopac-tw",
    validRows: 2,
    failedRows: 0,
    skipped: 1,
    estimatedRows: 3,
    columns: ["date", "amount", "currency", "category", "description", "source"],
    sampleRows: [
      ["2026-03-12", "-120", "TWD", "餐飲", "午餐", "sinopac_bank"],
      ["2026-03-13", "1500", "TWD", "退款", "退款", "sinopac_bank"],
    ],
    warnings: [],
    errors: [],
    recurringCandidates: [],
    status: "ok",
  });
});

test("POST /api/import/preview returns parser-backed preview for credit-card-tw", async () => {
  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set("import_mode", "credit-card-tw");
  formData.set(
    "file",
    new File(
      [
        "交易日期,金額,摘要,幣別,交易類型\n2026/03/20,320,Uber Eats,TWD,一般消費\n2026/03/21,320,退刷,TWD,退款\n小計,,,,\n",
      ],
      "credit-card-preview.csv",
      { type: "text/csv" },
    ),
  );

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/import/preview", { method: "POST", body: formData }, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "credit-card-tw",
    validRows: 2,
    failedRows: 0,
    skipped: 1,
    estimatedRows: 3,
    columns: ["date", "amount", "currency", "category", "description", "source"],
    sampleRows: [
      ["2026-03-20", "-320", "TWD", "餐飲", "Uber Eats", "credit_card_tw"],
      ["2026-03-21", "320", "TWD", "退款", "退刷", "credit_card_tw"],
    ],
    warnings: [],
    errors: [],
    recurringCandidates: [],
    status: "ok",
  });
});

test("POST /api/import/preview rejects accounts outside the authenticated user's scope", async () => {
  const formData = new FormData();
  formData.set("account_id", "account-2");
  formData.set("import_mode", "transactions-csv");
  formData.set(
    "file",
    new File(["date,amount,currency,category,description\n2026-03-10,-150,TWD,Food,Dinner\n"], "preview.csv", {
      type: "text/csv",
    }),
  );

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/import/preview", { method: "POST", body: formData }, env);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    code: "validation_error",
    error: "Selected account does not belong to the current user.",
    status: "error",
  });
});

test("POST /api/import/preview returns database_error when account lookup fails", async () => {
  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set("import_mode", "transactions-csv");
  formData.set(
    "file",
    new File(["date,amount,currency,category,description\n2026-03-10,-150,TWD,Food,Dinner\n"], "preview.csv", {
      type: "text/csv",
    }),
  );

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: null,
                error: { message: "accounts lookup failed" },
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/import/preview", { method: "POST", body: formData }, env);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    code: "database_error",
    error: "accounts lookup failed",
    status: "error",
  });
});

test("POST /api/import/sinopac-tw maps minimal Sinopac csv rows into transactions", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    new File(
      [
        "日期,金額,摘要,幣別,收支別\n2026/03/12,120,午餐,TWD,支出\n小計,,,,\n2026/03/13,1500,退款,TWD,收入\n",
      ],
      "sinopac.csv",
      { type: "text/csv" },
    ),
  );

  const response = await app.request(
    "/api/import/sinopac-tw",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "sinopac-tw",
    imported: 2,
    skipped: 1,
    failed: 0,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
    warnings: [],
    recurringCandidates: [],
  });
  assert.deepEqual(insertedRows, [
    {
      account_id: "account-1",
      date: "2026-03-12",
      amount: -120,
      currency: "TWD",
      category: "餐飲",
      description: "午餐",
      source: "sinopac_bank",
      source_hash: insertedRows[0]?.source_hash,
    },
    {
      account_id: "account-1",
      date: "2026-03-13",
      amount: 1500,
      currency: "TWD",
      category: "退款",
      description: "退款",
      source: "sinopac_bank",
      source_hash: insertedRows[1]?.source_hash,
    },
  ]);
});

test("POST /api/import/credit-card-tw maps minimal credit card csv rows into transactions", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    new File(
      [
        "交易日期,金額,摘要,幣別,交易類型\n2026/03/20,320,Uber Eats,TWD,一般消費\n2026/03/21,320,退刷,TWD,退款\n小計,,,,\n",
      ],
      "credit-card.csv",
      { type: "text/csv" },
    ),
  );

  const response = await app.request(
    "/api/import/credit-card-tw",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "credit-card-tw",
    imported: 2,
    skipped: 1,
    failed: 0,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
    warnings: [],
    recurringCandidates: [],
  });
  assert.deepEqual(insertedRows, [
    {
      account_id: "account-1",
      date: "2026-03-20",
      amount: -320,
      currency: "TWD",
      category: "餐飲",
      description: "Uber Eats",
      source: "credit_card_tw",
      source_hash: insertedRows[0]?.source_hash,
    },
    {
      account_id: "account-1",
      date: "2026-03-21",
      amount: 320,
      currency: "TWD",
      category: "退款",
      description: "退刷",
      source: "credit_card_tw",
      source_hash: insertedRows[1]?.source_hash,
    },
  ]);
});

test("POST /api/import/credit-card-tw prefers posted date over transaction date", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    new File(
      [
        "消費日,入帳起息日,金額,摘要,幣別,交易類型\n2026/03/31,2026/04/02,500,超商,TWD,一般消費\n",
      ],
      "credit-card-posted-date.csv",
      { type: "text/csv" },
    ),
  );

  const response = await app.request(
    "/api/import/credit-card-tw",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "credit-card-tw",
    imported: 1,
    skipped: 0,
    failed: 0,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
    warnings: [],
    recurringCandidates: [],
  });
  assert.deepEqual(insertedRows, [
    {
      account_id: "account-1",
      date: "2026-04-02",
      amount: -500,
      currency: "TWD",
      category: "其他",
      description: "超商",
      source: "credit_card_tw",
      source_hash: insertedRows[0]?.source_hash,
    },
  ]);
});

test("POST /api/import/transactions-csv skips duplicate rows by source hash", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];
  const existingHash = buildTransactionSourceHash({
    account_id: "account-1",
    date: "2026-03-10",
    amount: -150,
    currency: "TWD",
    category: "餐飲",
    description: "Dinner",
    source: "csv_import",
  });

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ source_hash: existingHash }],
                error: null,
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    new File(
      ["date,amount,currency,category,description\n2026-03-10,-150,TWD,餐飲,Dinner\n"],
      "transactions.csv",
      { type: "text/csv" },
    ),
  );
  const response = await app.request(
    "/api/import/transactions-csv",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "transactions-csv",
    imported: 0,
    skipped: 1,
    failed: 0,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
    warnings: [],
    recurringCandidates: [],
  });
  assert.deepEqual(insertedRows, []);
});

test("POST /api/import/transactions-csv dedupes duplicate rows within the same upload batch", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    new File(
      [
        "date,amount,currency,category,description\n2026-03-01,-120,TWD,擗ㄡ,Lunch\n2026-03-01,-120,TWD,擗ㄡ,Lunch\n2026-03-02,5000,TWD,薪資,Salary\n",
      ],
      "duplicate-batch.csv",
      { type: "text/csv" },
    ),
  );

  const response = await app.request(
    "/api/import/transactions-csv",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "transactions-csv",
    imported: 2,
    skipped: 1,
    failed: 0,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
    warnings: [],
    recurringCandidates: [],
  });
  assert.equal(insertedRows.length, 2);
});

test("POST /api/import/excel-monthly imports simplified calendar workbook rows", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    createExcelMonthlyFile([
      ["分類", "項目", "2026/03/01", "2026/03/02"],
      ["飲食費用", "早餐", 80, 120],
      ["交通花費", "捷運", "", 50],
      ["生活雜費", "日用品", 300, ""],
    ]),
  );

  const response = await app.request(
    "/api/import/excel-monthly",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "excel-monthly",
    imported: 4,
    skipped: 0,
    failed: 0,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
    warnings: [],
    recurringCandidates: [],
  });
  assert.deepEqual(insertedRows, [
    {
      account_id: "account-1",
      date: "2026-03-01",
      amount: -80,
      currency: "TWD",
      category: "餐飲",
      description: "早餐",
      source: "excel_monthly",
      source_hash: insertedRows[0]?.source_hash,
    },
    {
      account_id: "account-1",
      date: "2026-03-02",
      amount: -120,
      currency: "TWD",
      category: "餐飲",
      description: "早餐",
      source: "excel_monthly",
      source_hash: insertedRows[1]?.source_hash,
    },
    {
      account_id: "account-1",
      date: "2026-03-02",
      amount: -50,
      currency: "TWD",
      category: "交通",
      description: "捷運",
      source: "excel_monthly",
      source_hash: insertedRows[2]?.source_hash,
    },
    {
      account_id: "account-1",
      date: "2026-03-01",
      amount: -300,
      currency: "TWD",
      category: "生活購物",
      description: "日用品",
      source: "excel_monthly",
      source_hash: insertedRows[3]?.source_hash,
    },
  ]);
});

test("POST /api/import/excel-monthly imports horizontal calendar workbook with category boundary rows", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    createExcelMonthlyFile([
      ["分類", "", "2026/03/01", "", "2026/03/02", ""],
      ["", "", "項目", "金額", "項目", "金額"],
      ["飲食費用", "", "", "", "", ""],
      ["", "", "早餐", 80, "午餐", 120],
      ["交通花費", "", "", "", "", ""],
      ["", "", "捷運", 50, "", ""],
    ]),
  );

  const response = await app.request(
    "/api/import/excel-monthly",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "excel-monthly",
    imported: 3,
    skipped: 2,
    failed: 0,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
    warnings: [],
    recurringCandidates: [],
  });
  assert.deepEqual(insertedRows, [
    {
      account_id: "account-1",
      date: "2026-03-01",
      amount: -80,
      currency: "TWD",
      category: "餐飲",
      description: "早餐",
      source: "excel_monthly",
      source_hash: insertedRows[0]?.source_hash,
    },
    {
      account_id: "account-1",
      date: "2026-03-02",
      amount: -120,
      currency: "TWD",
      category: "餐飲",
      description: "午餐",
      source: "excel_monthly",
      source_hash: insertedRows[1]?.source_hash,
    },
    {
      account_id: "account-1",
      date: "2026-03-01",
      amount: -50,
      currency: "TWD",
      category: "交通",
      description: "捷運",
      source: "excel_monthly",
      source_hash: insertedRows[2]?.source_hash,
    },
  ]);
});

test("POST /api/import/preview returns parser-backed preview for excel-monthly", async () => {
  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set("import_mode", "excel-monthly");
  formData.set(
    "file",
    createExcelMonthlyFile([
      ["Category", "Label", "2026/03/01", "2026/03/02"],
      ["Food", "Breakfast", 80, 120],
      ["Income", "Salary", "", 3000],
    ]),
  );

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/import/preview", { method: "POST", body: formData }, env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ok");
  assert.equal(payload.source, "excel-monthly");
  assert.equal(payload.validRows, 3);
  assert.equal(payload.failedRows, 0);
  assert.deepEqual(payload.columns, ["date", "amount", "currency", "category", "description", "source"]);
  assert.equal(Array.isArray(payload.sampleRows), true);
  assert.equal(payload.sampleRows.length, 3);
});

test("POST /api/import/preview returns parser-backed preview for sinopac-stock", async () => {
  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set("import_mode", "sinopac-stock");
  formData.set(
    "file",
    new File(
      [
        "date,ticker,name,action,shares,price,fee,tax,currency\n2026-03-11,2330,TSMC,buy,2,612,20,0,TWD\n2026/03/12,0050,ETF,sell,1,150,10,0,TWD\n",
      ],
      "sinopac-stock.csv",
      { type: "text/csv" },
    ),
  );

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/import/preview", { method: "POST", body: formData }, env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ok");
  assert.equal(payload.source, "sinopac-stock");
  assert.equal(payload.validRows, 2);
  assert.equal(payload.failedRows, 0);
  assert.equal(payload.skipped, 0);
  assert.equal(payload.estimatedRows, 2);
  assert.deepEqual(payload.columns, ["trade_date", "ticker", "action", "shares", "price", "fee", "tax", "currency"]);
  assert.deepEqual(payload.sampleRows, [
    ["2026-03-11", "2330", "buy", "2", "612", "20", "0", "TWD"],
    ["2026-03-12", "0050", "sell", "1", "150", "10", "0", "TWD"],
  ]);
  assert.deepEqual(payload.errors, []);
});

test("POST /api/import/preview returns parser-backed preview for foreign-stock-csv", async () => {
  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set("import_mode", "foreign-stock-csv");
  formData.set(
    "file",
    new File(
      [
        "date,ticker,name,action,shares,price,fee,tax,currency\n2026-03-11,AAPL,Apple,buy,3,185.5,1.2,0,USD\n,MSFT,Microsoft,buy,1,410,1,0,USD\n",
      ],
      "foreign-stock.csv",
      { type: "text/csv" },
    ),
  );

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/import/preview", { method: "POST", body: formData }, env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ok");
  assert.equal(payload.source, "foreign-stock-csv");
  assert.equal(payload.validRows, 1);
  assert.equal(payload.failedRows, 1);
  assert.equal(payload.skipped, 0);
  assert.equal(payload.estimatedRows, 2);
  assert.deepEqual(payload.columns, ["trade_date", "ticker", "action", "shares", "price", "fee", "tax", "currency"]);
  assert.deepEqual(payload.sampleRows, [["2026-03-11", "AAPL", "buy", "3", "185.5", "1.2", "0", "USD"]]);
  assert.equal(payload.errors.length, 1);
});

test("POST /api/import/preview returns parser-backed preview for dividends-csv", async () => {
  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set("import_mode", "dividends-csv");
  formData.set(
    "file",
    new File(
      [
        "ticker,pay_date,net_amount,gross_amount,tax_withheld,currency\n00919,2026-03-20,900,900,0,TWD\n0056,2026/03/15,1080,1200,120,TWD\n",
      ],
      "dividends.csv",
      { type: "text/csv" },
    ),
  );

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/import/preview", { method: "POST", body: formData }, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "dividends-csv",
    validRows: 1,
    failedRows: 1,
    skipped: 0,
    estimatedRows: 2,
    columns: ["ticker", "pay_date", "gross_amount", "tax_withheld", "net_amount", "currency"],
    sampleRows: [["00919", "2026-03-20", "900", "0", "900", "TWD"]],
    errors: ['line 3: invalid pay_date "2026/03/15"'],
    status: "ok",
  });
});

test("POST /api/import/excel-monthly aggregates parsable rows across multiple monthly sheets and ignores sidebar rows", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    createExcelMonthlyWorkbook([
      {
        name: "Summary",
        rows: [
          ["年度總表", "", ""],
          ["備註", "這頁不該被匯入", ""],
        ],
      },
      {
        name: "March",
        rows: [
          ["固定支出", "房租", "", "", "", ""],
          ["分類", "", "2026/03/01", "", "2026/03/02", ""],
          ["", "", "項目", "金額", "項目", "金額"],
          ["飲食費用", "", "", "", "", ""],
          ["", "", "早餐", 80, "午餐", 120],
          ["週期支出", "幼稚園", "", "", "", ""],
        ],
      },
      {
        name: "April",
        rows: [
          ["分類", "項目", "2026/04/01"],
          ["交通花費", "捷運", 60],
        ],
      },
    ]),
  );

  const response = await app.request(
    "/api/import/excel-monthly",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "excel-monthly",
    imported: 3,
    skipped: 2,
    failed: 0,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
    warnings: [
      "[March] ignored recurring/sidebar row: 週期支出 / 幼稚園",
    ],
    recurringCandidates: [
      {
        sheet: "March",
        kind: "recurring_sidebar",
        section: "週期支出",
        label: "幼稚園",
        amount: null,
      },
    ],
  });
  assert.deepEqual(insertedRows, [
    {
      account_id: "account-1",
      date: "2026-03-01",
      amount: -80,
      currency: "TWD",
      category: "餐飲",
      description: "早餐",
      source: "excel_monthly",
      source_hash: insertedRows[0]?.source_hash,
    },
    {
      account_id: "account-1",
      date: "2026-03-02",
      amount: -120,
      currency: "TWD",
      category: "餐飲",
      description: "午餐",
      source: "excel_monthly",
      source_hash: insertedRows[1]?.source_hash,
    },
    {
      account_id: "account-1",
      date: "2026-04-01",
      amount: -60,
      currency: "TWD",
      category: "交通",
      description: "捷運",
      source: "excel_monthly",
      source_hash: insertedRows[2]?.source_hash,
    },
  ]);
});

test("POST /api/import/excel-monthly expands merged header and category cells before parsing", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    createExcelMonthlyWorkbook([
      {
        name: "March",
        rows: [
          ["分類", "", "2026/03/01", "", "2026/03/02", ""],
          ["", "", "項目", "金額", "項目", "金額"],
          ["飲食費用", "", "", "", "", ""],
          ["", "", "早餐", 80, "午餐", 120],
        ],
        merges: ["A3:B3", "C1:D1", "E1:F1"],
      },
    ]),
  );

  const response = await app.request(
    "/api/import/excel-monthly",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "excel-monthly",
    imported: 2,
    skipped: 1,
    failed: 0,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
    warnings: [],
    recurringCandidates: [],
  });
  assert.deepEqual(insertedRows, [
    {
      account_id: "account-1",
      date: "2026-03-01",
      amount: -80,
      currency: "TWD",
      category: "餐飲",
      description: "早餐",
      source: "excel_monthly",
      source_hash: insertedRows[0]?.source_hash,
    },
    {
      account_id: "account-1",
      date: "2026-03-02",
      amount: -120,
      currency: "TWD",
      category: "餐飲",
      description: "午餐",
      source: "excel_monthly",
      source_hash: insertedRows[1]?.source_hash,
    },
  ]);
});

test("POST /api/import/excel-monthly infers year and month from sheet name when headers use day-only dates", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    createExcelMonthlyWorkbook([
      {
        name: "2026-05",
        rows: [
          ["固定支出", "房租", ""],
          ["分類", "項目", "1", "2"],
          ["飲食費用", "早餐", 70, 90],
        ],
      },
    ]),
  );

  const response = await app.request(
    "/api/import/excel-monthly",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "excel-monthly",
    imported: 2,
    skipped: 0,
    failed: 0,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
    warnings: [],
    recurringCandidates: [],
  });
  assert.deepEqual(insertedRows, [
    {
      account_id: "account-1",
      date: "2026-05-01",
      amount: -70,
      currency: "TWD",
      category: "餐飲",
      description: "早餐",
      source: "excel_monthly",
      source_hash: insertedRows[0]?.source_hash,
    },
    {
      account_id: "account-1",
      date: "2026-05-02",
      amount: -90,
      currency: "TWD",
      category: "餐飲",
      description: "早餐",
      source: "excel_monthly",
      source_hash: insertedRows[1]?.source_hash,
    },
  ]);
});

test("POST /api/import/foreign-stock-csv imports foreign brokerage trades and recalculates holdings", async () => {
  let insertedTrades: Array<Record<string, unknown>> = [];
  let upsertedHolding: Record<string, unknown> | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-foreign" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "investment_trades") {
          return {
            select: () => ({
              in: () => ({
                data: [],
                error: null,
              }),
              eq: () => ({
                eq: () => ({
                  order: async () => ({
                    data: [
                      {
                        action: "buy",
                        shares: 3,
                        price_per_share: 25.5,
                        name: "Vanguard S&P 500 ETF",
                        currency: "USD",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedTrades = values;
              return { error: null };
            },
          };
        }

        if (table === "holdings") {
          return {
            upsert: async (value: Record<string, unknown>) => {
              upsertedHolding = value;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-foreign");
  formData.set(
    "file",
    new File(
      [
        "date,ticker,name,action,shares,price,fee,tax,currency\n2026-03-28,VOO,Vanguard S&P 500 ETF,buy,3,25.5,1,0,USD\n",
      ],
      "foreign-stock.csv",
      { type: "text/csv" },
    ),
  );

  const response = await app.request(
    "/api/import/foreign-stock-csv",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "foreign-stock-csv",
    imported: 1,
    skipped: 0,
    failed: 0,
    holdingsRecalculated: 1,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
  });
  assert.equal(insertedTrades[0]?.currency, "USD");
  assert.equal(insertedTrades[0]?.source, "foreign-stock-csv");
  assert.deepEqual(upsertedHolding, {
    account_id: "account-foreign",
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    total_shares: 3,
    avg_cost: 25.5,
    currency: "USD",
    updated_at: upsertedHolding?.updated_at,
  });
});

test("POST /api/import/foreign-stock-csv dedupes duplicate trade rows within the same upload batch", async () => {
  let insertedTrades: Array<Record<string, unknown>> = [];
  let upsertedHolding: Record<string, unknown> | null = null;
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-foreign" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "investment_trades") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
              eq: () => ({
                eq: () => ({
                  order: async () => ({
                    data: [
                      {
                        action: "buy",
                        shares: 3,
                        price_per_share: 25.5,
                        name: "Vanguard S&P 500 ETF",
                        currency: "USD",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedTrades = values;
              return { error: null };
            },
          };
        }

        if (table === "holdings") {
          return {
            upsert: async (value: Record<string, unknown>) => {
              upsertedHolding = value;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-foreign");
  formData.set(
    "file",
    new File(
      [
        "date,ticker,name,action,shares,price,fee,tax,currency\n2026-03-28,VOO,Vanguard S&P 500 ETF,buy,3,25.5,1,0,USD\n2026-03-28,VOO,Vanguard S&P 500 ETF,buy,3,25.5,1,0,USD\n",
      ],
      "foreign-stock-duplicates.csv",
      { type: "text/csv" },
    ),
  );

  const response = await app.request(
    "/api/import/foreign-stock-csv",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "foreign-stock-csv",
    imported: 1,
    skipped: 1,
    failed: 0,
    holdingsRecalculated: 1,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
  });
  assert.equal(insertedTrades.length, 1);
  assert.equal(upsertedHolding?.total_shares, 3);
});

test("POST /api/import/foreign-stock-csv keeps valid trades while surfacing row errors", async () => {
  let insertedTrades: Array<Record<string, unknown>> = [];
  let upsertedHolding: Record<string, unknown> | null = null;
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-stock" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "investment_trades") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
              eq: (_column: string, _value: string) => ({
                eq: (_column2: string, _value2: string) => ({
                  order: async () => ({
                    data: [
                      {
                        account_id: "account-stock",
                        trade_date: "2026-03-29",
                        ticker: "QQQ",
                        name: "Invesco QQQ",
                        action: "buy",
                        shares: 5,
                        price_per_share: 420,
                        fee: 1,
                        tax: 0,
                        currency: "USD",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedTrades = values;
              return { error: null };
            },
          };
        }

        if (table === "holdings") {
          return {
            upsert: async (value: Record<string, unknown>) => {
              upsertedHolding = value;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-stock");
  formData.set(
    "file",
    new File(
      [
        "date,ticker,name,action,shares,price,fee,tax,currency\nbad-date,2330,TSMC,buy,2,610,1,0,TWD\n2026-03-28,,VOO,buy,3,25.5,1,0,USD\n2026-03-29,QQQ,Invesco QQQ,buy,5,420,1,0,USD\n",
      ],
      "foreign-stock-validation.csv",
      { type: "text/csv" },
    ),
  );

  const response = await app.request(
    "/api/import/foreign-stock-csv",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.source, "foreign-stock-csv");
  assert.equal(payload.imported, 1);
  assert.equal(payload.skipped, 0);
  assert.equal(payload.failed, 2);
  assert.equal(payload.holdingsRecalculated, 1);
  assert.equal(payload.runtime, "cloudflare-worker");
  assert.equal(payload.persistence, "supabase");
  assert.equal(payload.status, "ok");
  assert.equal(Array.isArray(payload.errors), true);
  assert.equal(payload.errors.length, 2);
  assert.deepEqual(insertedTrades, [
    {
      account_id: "account-stock",
      trade_date: "2026-03-29",
      ticker: "QQQ",
      name: "Invesco QQQ",
      action: "buy",
      shares: 5,
      price_per_share: 420,
      fee: 1,
      tax: 0,
      currency: "USD",
      source: "foreign-stock-csv",
      source_hash: insertedTrades[0]?.source_hash,
    },
  ]);
  assert.equal(upsertedHolding?.ticker, "QQQ");
  assert.equal(upsertedHolding?.currency, "USD");
  assert.equal(upsertedHolding?.total_shares, 5);
});

test("POST /api/import/dividends-csv skips duplicate dividend rows by source hash", async () => {
  let insertedDividends: Array<Record<string, unknown>> = [];
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "dividends") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ source_hash: "ZGl2aWRlbmRzfGFjY291bnQtMXwwMDU2fDIwMjYtMDMtMTV8MTA4MA" }],
                error: null,
              }),
            }),
            insert: async (values: Array<Record<string, unknown>>) => {
              insertedDividends = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    new File(
      [
        "ticker,pay_date,net_amount,gross_amount,tax_withheld,currency\n0056,2026-03-15,1080,1200,120,TWD\n00919,2026-03-20,900,900,0,TWD\n",
      ],
      "dividends.csv",
      { type: "text/csv" },
    ),
  );

  const response = await app.request(
    "/api/import/dividends-csv",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "dividends-csv",
    imported: 1,
    skipped: 1,
    failed: 0,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
  });
  assert.deepEqual(insertedDividends, [
    {
      account_id: "account-1",
      ticker: "00919",
      pay_date: "2026-03-20",
      net_amount: 900,
      gross_amount: 900,
      tax_withheld: 0,
      currency: "TWD",
      source_hash: insertedDividends[0]?.source_hash,
    },
  ]);
});

test("POST /api/import/dividends-csv dedupes duplicate rows within the same upload batch", async () => {
  let insertedDividends: Array<Record<string, unknown>> = [];
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "dividends") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
            insert: async (values: Array<Record<string, unknown>>) => {
              insertedDividends = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    new File(
      [
        "ticker,pay_date,net_amount,gross_amount,tax_withheld,currency\n0056,2026-03-15,1080,1200,120,TWD\n0056,2026-03-15,1080,1200,120,TWD\n00919,2026-03-20,900,900,0,TWD\n",
      ],
      "dividends-duplicates.csv",
      { type: "text/csv" },
    ),
  );

  const response = await app.request(
    "/api/import/dividends-csv",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "dividends-csv",
    imported: 2,
    skipped: 1,
    failed: 0,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
  });
  assert.equal(insertedDividends.length, 2);
});

test("POST /api/import/dividends-csv keeps valid rows while surfacing validation errors", async () => {
  let insertedDividends: Array<Record<string, unknown>> = [];
  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "dividends") {
          return {
            select: () => ({
              in: async () => ({
                data: [],
                error: null,
              }),
            }),
            insert: async (values: Array<Record<string, unknown>>) => {
              insertedDividends = values;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-1");
  formData.set(
    "file",
    new File(
      [
        "ticker,pay_date,net_amount,gross_amount,tax_withheld,currency\n,2026-03-15,1080,1200,120,TWD\n0056,2026/03/15,1080,1200,120,TWD\n00919,2026-03-20,900,900,0,TWD\n",
      ],
      "dividends-validation.csv",
      { type: "text/csv" },
    ),
  );

  const response = await app.request(
    "/api/import/dividends-csv",
    {
      method: "POST",
      body: formData,
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "dividends-csv",
    imported: 1,
    skipped: 0,
    failed: 2,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [
      "line 2: missing ticker",
      "line 3: invalid pay_date \"2026/03/15\"",
    ],
  });
  assert.deepEqual(insertedDividends, [
    {
      account_id: "account-1",
      ticker: "00919",
      pay_date: "2026-03-20",
      net_amount: 900,
      gross_amount: 900,
      tax_withheld: 0,
      currency: "TWD",
      source_hash: insertedDividends[0]?.source_hash,
    },
  ]);
});

// --- Import write route contract: unauthorized + missing account_id ---

const minimalCsv = () => new File(["a,b\n1,2\n"], "t.csv", { type: "text/csv" });

function makeWriteFormData(opts: { withAccountId?: boolean } = {}) {
  const fd = new FormData();
  if (opts.withAccountId !== false) fd.set("account_id", "account-1");
  fd.set("file", minimalCsv());
  return fd;
}

for (const route of [
  "transactions-csv",
  "sinopac-tw",
  "credit-card-tw",
  "excel-monthly",
  "sinopac-stock",
  "foreign-stock-csv",
  "dividends-csv",
] as const) {
  test(`POST /api/import/${route} returns 401 when bearer user is missing`, async () => {
    const app = createApp({ resolveAuthenticatedUser: async () => null });
    const response = await app.request(
      `/api/import/${route}`,
      { method: "POST", body: makeWriteFormData() },
      env,
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      code: "unauthorized",
      error: "Missing or invalid Supabase bearer token.",
      status: "error",
    });
  });

  test(`POST /api/import/${route} returns validation_error when account_id is missing`, async () => {
    const app = createApp({
      resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    });
    const response = await app.request(
      `/api/import/${route}`,
      { method: "POST", body: makeWriteFormData({ withAccountId: false }) },
      env,
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      code: "validation_error",
      error: "account_id is required.",
      status: "error",
    });
  });

  test(`POST /api/import/${route} rejects accounts outside the authenticated user's scope`, async () => {
    const app = createApp({
      resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
      createSupabaseAdminClient: () => ({
        from: (table: string) => {
          if (table === "accounts") {
            return {
              select: () => ({
                eq: async () => ({
                  data: [{ id: "account-1" }],
                  error: null,
                }),
              }),
            };
          }

          throw new Error(`Unexpected table ${table}`);
        },
      }),
    });
    const fd = new FormData();
    fd.set("account_id", "account-2");
    fd.set("file", route === "excel-monthly" ? createExcelMonthlyFile([["Category", "Label", "2026/03/01"], ["Food", "Breakfast", 80]]) : minimalCsv());
    const response = await app.request(`/api/import/${route}`, { method: "POST", body: fd }, env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      code: "validation_error",
      error: "Selected account does not belong to the current user.",
      status: "error",
    });
  });

  test(`POST /api/import/${route} returns database_error when account lookup fails`, async () => {
    const app = createApp({
      resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
      createSupabaseAdminClient: () => ({
        from: (table: string) => {
          if (table === "accounts") {
            return {
              select: () => ({
                eq: async () => ({
                  data: null,
                  error: { message: "accounts lookup failed" },
                }),
              }),
            };
          }

          throw new Error(`Unexpected table ${table}`);
        },
      }),
    });
    const response = await app.request(
      `/api/import/${route}`,
      { method: "POST", body: makeWriteFormData() },
      env,
    );
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      code: "database_error",
      error: "accounts lookup failed",
      status: "error",
    });
  });
}

// --- End import write route contract tests ---

test("GET /api/recurring-templates returns user-scoped recurring template list", async () => {
  const recurringTemplates = [
    {
      id: "rt-1",
      user_id: "user-1",
      account_id: "account-1",
      name: "房租",
      category: "固定支出",
      amount: 12000,
      currency: "TWD",
      cadence: "monthly",
      anchor_day: 5,
      source_kind: "manual",
      source_section: null,
      notes: null,
      created_at: "2026-03-21T00:00:00Z",
    },
  ];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "recurring_templates") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: recurringTemplates,
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/recurring-templates", {}, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    count: 1,
    items: recurringTemplates,
    status: "ok",
  });
});

test("POST /api/recurring-templates creates a recurring template", async () => {
  const createdTemplate = {
    id: "rt-2",
    user_id: "user-1",
    account_id: "account-1",
    name: "幼稚園",
    category: "教育",
    amount: 11000,
    currency: "TWD",
    cadence: "monthly",
    anchor_day: 10,
    source_kind: "excel_sidebar",
    source_section: "週期支出",
    notes: "from excel candidate",
    created_at: "2026-03-21T00:00:00Z",
  };

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "recurring_templates") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: createdTemplate,
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request(
    "/api/recurring-templates",
    {
      method: "POST",
      body: JSON.stringify({
        account_id: "account-1",
        name: "幼稚園",
        category: "教育",
        amount: 11000,
        anchor_day: 10,
        source_kind: "excel_sidebar",
        source_section: "週期支出",
        notes: "from excel candidate",
      }),
      headers: {
        "content-type": "application/json",
      },
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    count: 1,
    items: [createdTemplate],
    status: "ok",
  });
});

test("POST /api/recurring-templates/from-import-candidates creates templates from excel candidates", async () => {
  const createdTemplates = [
    {
      id: "rt-3",
      user_id: "user-1",
      account_id: "account-1",
      name: "房租",
      category: "固定支出",
      amount: null,
      currency: "TWD",
      cadence: "monthly",
      anchor_day: null,
      source_kind: "excel_sidebar",
      source_section: "固定支出",
      notes: "Imported from Excel sheet: March",
      created_at: "2026-03-21T00:00:00Z",
    },
    {
      id: "rt-4",
      user_id: "user-1",
      account_id: "account-1",
      name: "幼稚園",
      category: "週期支出",
      amount: null,
      currency: "TWD",
      cadence: "monthly",
      anchor_day: null,
      source_kind: "excel_sidebar",
      source_section: "週期支出",
      notes: "Imported from Excel sheet: March",
      created_at: "2026-03-21T00:00:00Z",
    },
  ];
  let insertedRows: Array<Record<string, unknown>> = [];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "recurring_templates") {
          return {
            select: () => ({
              eq: async () => ({
                data: [],
                error: null,
              }),
            }),
            insert: (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return {
                select: async () => ({
                  data: createdTemplates,
                  error: null,
                }),
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request(
    "/api/recurring-templates/from-import-candidates",
    {
      method: "POST",
      body: JSON.stringify({
        account_id: "account-1",
        candidates: [
          {
            sheet: "March",
            kind: "recurring_sidebar",
            section: "固定支出",
            label: "房租",
          },
          {
            sheet: "March",
            kind: "recurring_sidebar",
            section: "週期支出",
            label: "幼稚園",
          },
        ],
      }),
      headers: {
        "content-type": "application/json",
      },
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    count: 2,
    items: createdTemplates,
    skipped: 0,
    status: "ok",
  });
  assert.deepEqual(insertedRows, [
    {
      user_id: "user-1",
      account_id: "account-1",
      name: "房租",
      category: "固定支出",
      amount: null,
      currency: "TWD",
      cadence: "monthly",
      anchor_day: null,
      source_kind: "excel_sidebar",
      source_section: "固定支出",
      notes: "Imported from Excel sheet: March",
    },
    {
      user_id: "user-1",
      account_id: "account-1",
      name: "幼稚園",
      category: "週期支出",
      amount: null,
      currency: "TWD",
      cadence: "monthly",
      anchor_day: null,
      source_kind: "excel_sidebar",
      source_section: "週期支出",
      notes: "Imported from Excel sheet: March",
    },
  ]);
});

test("POST /api/recurring-templates/from-import-candidates skips duplicates already present or repeated in payload", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "recurring_templates") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ name: "房租", source_section: "固定支出", account_id: "account-1" }],
                error: null,
              }),
            }),
            insert: (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return {
                select: async () => ({
                  data: [
                    {
                      id: "rt-5",
                      user_id: "user-1",
                      account_id: "account-1",
                      name: "幼稚園",
                      category: "週期支出",
                      amount: null,
                      currency: "TWD",
                      cadence: "monthly",
                      anchor_day: null,
                      source_kind: "excel_sidebar",
                      source_section: "週期支出",
                      notes: "Imported from Excel sheet: March",
                      created_at: "2026-03-21T00:00:00Z",
                    },
                  ],
                  error: null,
                }),
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request(
    "/api/recurring-templates/from-import-candidates",
    {
      method: "POST",
      body: JSON.stringify({
        account_id: "account-1",
        candidates: [
          {
            sheet: "March",
            kind: "recurring_sidebar",
            section: "固定支出",
            label: "房租",
          },
          {
            sheet: "March",
            kind: "recurring_sidebar",
            section: "週期支出",
            label: "幼稚園",
          },
          {
            sheet: "April",
            kind: "recurring_sidebar",
            section: "週期支出",
            label: "幼稚園",
          },
        ],
      }),
      headers: {
        "content-type": "application/json",
      },
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    count: 1,
    items: [
      {
        id: "rt-5",
        user_id: "user-1",
        account_id: "account-1",
        name: "幼稚園",
        category: "週期支出",
        amount: null,
        currency: "TWD",
        cadence: "monthly",
        anchor_day: null,
        source_kind: "excel_sidebar",
        source_section: "週期支出",
        notes: "Imported from Excel sheet: March",
        created_at: "2026-03-21T00:00:00Z",
      },
    ],
    skipped: 2,
    status: "ok",
  });
  assert.deepEqual(insertedRows, [
    {
      user_id: "user-1",
      account_id: "account-1",
      name: "幼稚園",
      category: "週期支出",
      amount: null,
      currency: "TWD",
      cadence: "monthly",
      anchor_day: null,
      source_kind: "excel_sidebar",
      source_section: "週期支出",
      notes: "Imported from Excel sheet: March",
    },
  ]);
});

test("POST /api/recurring-templates/from-import-candidates carries candidate amount into template", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "recurring_templates") {
          return {
            select: () => ({
              eq: async () => ({
                data: [],
                error: null,
              }),
            }),
            insert: (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return {
                select: async () => ({
                  data: [
                    {
                      id: "rt-6",
                      user_id: "user-1",
                      account_id: "account-1",
                      name: "房租",
                      category: "固定支出",
                      amount: -18000,
                      currency: "TWD",
                      cadence: "monthly",
                      anchor_day: null,
                      source_kind: "excel_sidebar",
                      source_section: "固定支出",
                      notes: "Imported from Excel sheet: March",
                      created_at: "2026-03-21T00:00:00Z",
                    },
                  ],
                  error: null,
                }),
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request(
    "/api/recurring-templates/from-import-candidates",
    {
      method: "POST",
      body: JSON.stringify({
        account_id: "account-1",
        candidates: [
          {
            sheet: "March",
            kind: "recurring_sidebar",
            section: "固定支出",
            label: "房租",
            amount: -18000,
          },
        ],
      }),
      headers: {
        "content-type": "application/json",
      },
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    count: 1,
    items: [
      {
        id: "rt-6",
        user_id: "user-1",
        account_id: "account-1",
        name: "房租",
        category: "固定支出",
        amount: -18000,
        currency: "TWD",
        cadence: "monthly",
        anchor_day: null,
        source_kind: "excel_sidebar",
        source_section: "固定支出",
        notes: "Imported from Excel sheet: March",
        created_at: "2026-03-21T00:00:00Z",
      },
    ],
    skipped: 0,
    status: "ok",
  });
  assert.deepEqual(insertedRows, [
    {
      user_id: "user-1",
      account_id: "account-1",
      name: "房租",
      category: "固定支出",
      amount: -18000,
      currency: "TWD",
      cadence: "monthly",
      anchor_day: null,
      source_kind: "excel_sidebar",
      source_section: "固定支出",
      notes: "Imported from Excel sheet: March",
    },
  ]);
});

test("POST /api/recurring-templates/apply creates this month's recurring transactions and skips duplicates", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];
  const createdTransactions = [
    {
      id: "txn-rt-1",
      account_id: "account-1",
      date: "2026-03-05",
      amount: -12000,
      currency: "TWD",
      category: "固定支出",
      description: "房租",
      source: "recurring_template",
      source_hash: "hash-room-rent",
      created_at: "2026-03-22T00:00:00Z",
    },
  ];

  const existingDuplicateHash = buildTransactionSourceHash({
    account_id: "account-1",
    date: "2026-03-10",
    amount: -11000,
    currency: "TWD",
    category: "教育",
    description: "幼稚園",
    source: "recurring_template",
  });

  const app = createApp({
    resolveAuthenticatedUser: async () => ({
      id: "user-1",
      email: "reiko0099@gmail.com",
    }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "account-1" }],
                error: null,
              }),
            }),
          };
        }

        if (table === "recurring_templates") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  {
                    id: "rt-1",
                    user_id: "user-1",
                    account_id: "account-1",
                    name: "房租",
                    category: "固定支出",
                    amount: -12000,
                    currency: "TWD",
                    cadence: "monthly",
                    anchor_day: 5,
                    source_kind: "manual",
                    source_section: "固定支出",
                    notes: null,
                    created_at: "2026-03-21T00:00:00Z",
                  },
                  {
                    id: "rt-2",
                    user_id: "user-1",
                    account_id: "account-1",
                    name: "幼稚園",
                    category: "教育",
                    amount: -11000,
                    currency: "TWD",
                    cadence: "monthly",
                    anchor_day: 10,
                    source_kind: "excel_sidebar",
                    source_section: "週期支出",
                    notes: null,
                    created_at: "2026-03-21T00:00:00Z",
                  },
                ],
                error: null,
              }),
            }),
          };
        }

        if (table === "transactions") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ source_hash: existingDuplicateHash }],
                error: null,
              }),
            }),
            insert: (values: Array<Record<string, unknown>>) => {
              insertedRows = values;
              return {
                select: async () => ({
                  data: createdTransactions,
                  error: null,
                }),
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request(
    "/api/recurring-templates/apply",
    {
      method: "POST",
      body: JSON.stringify({
        year: 2026,
        month: 3,
      }),
      headers: {
        "content-type": "application/json",
      },
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: createdTransactions,
    count: 1,
    skipped: 1,
    status: "ok",
  });
  assert.deepEqual(insertedRows, [
    {
      account_id: "account-1",
      date: "2026-03-05",
      amount: -12000,
      currency: "TWD",
      category: "固定支出",
      description: "房租",
      source: "recurring_template",
      source_hash: insertedRows[0]?.source_hash,
    },
  ]);
});

// ─── F1: sinopac-stock write happy path ──────────────────────────────────────

test("POST /api/import/sinopac-stock imports Taiwan stock trades and recalculates holdings", async () => {
  let insertedTrades: Array<Record<string, unknown>> = [];
  let upsertedHolding: Record<string, unknown> | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({ data: [{ id: "account-tw" }], error: null }),
            }),
          };
        }

        if (table === "investment_trades") {
          return {
            select: () => ({
              in: () => ({ data: [], error: null }),
              eq: () => ({
                eq: () => ({
                  order: async () => ({
                    data: [{ action: "buy", shares: 2, price_per_share: 612, name: "台積電", currency: "TWD" }],
                    error: null,
                  }),
                }),
              }),
            }),
            upsert: async (values: Array<Record<string, unknown>>) => {
              insertedTrades = values;
              return { error: null };
            },
          };
        }

        if (table === "holdings") {
          return {
            upsert: async (value: Record<string, unknown>) => {
              upsertedHolding = value;
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const formData = new FormData();
  formData.set("account_id", "account-tw");
  formData.set(
    "file",
    new File(
      ["date,ticker,name,action,shares,price,fee,tax,currency\n2026-03-11,2330,台積電,buy,2,612,20,0,TWD\n"],
      "sinopac-stock.csv",
      { type: "text/csv" },
    ),
  );

  const response = await app.request("/api/import/sinopac-stock", { method: "POST", body: formData }, env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "sinopac-stock",
    imported: 1,
    skipped: 0,
    failed: 0,
    holdingsRecalculated: 1,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors: [],
  });
  assert.equal(insertedTrades[0]?.ticker, "2330");
  assert.equal(insertedTrades[0]?.currency, "TWD");
  assert.equal(insertedTrades[0]?.source, "sinopac-stock");
  assert.ok(upsertedHolding, "holdings upsert was called");
});

// ─── F2: bank-snapshots ───────────────────────────────────────────────────────

test("GET /api/bank-snapshots returns user-scoped snapshot list", async () => {
  const snapshots = [
    {
      id: "snap-1",
      bank: "sinopac",
      type: "loan",
      statement_date: "2026-03-01",
      data: { remaining: 2327230 },
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    },
  ];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        assert.equal(table, "bank_snapshots");
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: snapshots, error: null }),
            }),
          }),
        };
      },
    }),
  });

  const response = await app.request("/api/bank-snapshots", {}, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: snapshots, status: "ok" });
});

test("GET /api/bank-snapshots returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request("/api/bank-snapshots", {}, env);
  assert.equal(response.status, 401);
});

test("PUT /api/bank-snapshots upserts a snapshot for the authenticated user", async () => {
  let upserted: Record<string, unknown> | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        assert.equal(table, "bank_snapshots");
        return {
          upsert: async (value: Record<string, unknown>) => {
            upserted = value;
            return { error: null };
          },
        };
      },
    }),
  });

  const response = await app.request(
    "/api/bank-snapshots",
    {
      method: "PUT",
      body: JSON.stringify({ bank: "sinopac", type: "loan", statement_date: "2026-03-01", data: { remaining: 2327230 } }),
      headers: { "content-type": "application/json" },
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(upserted?.user_id, "user-1");
  assert.equal(upserted?.bank, "sinopac");
  assert.equal(upserted?.type, "loan");
});

test("PUT /api/bank-snapshots returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request(
    "/api/bank-snapshots",
    { method: "PUT", body: JSON.stringify({ bank: "sinopac", type: "loan", statement_date: "2026-03-01", data: {} }), headers: { "content-type": "application/json" } },
    env,
  );
  assert.equal(response.status, 401);
});

test("DELETE /api/bank-snapshots/:id deletes an owned snapshot", async () => {
  let deletedId: string | null = null;
  let deletedUserId: string | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        assert.equal(table, "bank_snapshots");
        return {
          delete: () => ({
            eq: (col: string, val: string) => ({
              eq: async (col2: string, val2: string) => {
                if (col === "id") deletedId = val;
                if (col2 === "user_id") deletedUserId = val2;
                return { error: null };
              },
            }),
          }),
        };
      },
    }),
  });

  const response = await app.request("/api/bank-snapshots/snap-1", { method: "DELETE" }, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(deletedId, "snap-1");
  assert.equal(deletedUserId, "user-1");
});

test("DELETE /api/bank-snapshots/:id returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request("/api/bank-snapshots/snap-1", { method: "DELETE" }, env);
  assert.equal(response.status, 401);
});

// ─── F3: categorization-rules ─────────────────────────────────────────────────

test("GET /api/categorization-rules returns user-scoped rule list", async () => {
  const rules = [
    {
      id: "rule-1",
      user_id: "user-1",
      scope: "gmail_pdf_sinopac",
      direction: "expense",
      normalized_description: "超市",
      raw_description: "全聯",
      category: "日常雜貨",
      updated_at: "2026-03-01T00:00:00Z",
    },
  ];

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        assert.equal(table, "categorization_rules");
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: rules, error: null }),
            }),
          }),
        };
      },
    }),
  });

  const response = await app.request("/api/categorization-rules", {}, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: rules, status: "ok" });
});

test("GET /api/categorization-rules returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request("/api/categorization-rules", {}, env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" });
});

test("POST /api/categorization-rules upserts a categorization rule", async () => {
  const createdRule = {
    id: "rule-2",
    user_id: "user-1",
    scope: "gmail_pdf_sinopac",
    direction: "expense",
    normalized_description: "咖啡",
    raw_description: "路易莎",
    category: "餐飲",
    updated_at: "2026-04-01T00:00:00Z",
  };

  let upserted: Record<string, unknown> | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        assert.equal(table, "categorization_rules");
        return {
          upsert: (value: Record<string, unknown>) => {
            upserted = value;
            return {
              select: () => ({
                single: async () => ({ data: createdRule, error: null }),
              }),
            };
          },
        };
      },
    }),
  });

  const response = await app.request(
    "/api/categorization-rules",
    {
      method: "POST",
      body: JSON.stringify({
        scope: "gmail_pdf_sinopac",
        direction: "expense",
        normalized_description: "咖啡",
        raw_description: "路易莎",
        category: "餐飲",
      }),
      headers: { "content-type": "application/json" },
    },
    env,
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { items: [createdRule], status: "ok" });
  assert.equal(upserted?.user_id, "user-1");
  assert.equal(upserted?.category, "餐飲");
});

test("POST /api/categorization-rules returns 400 when required fields are missing", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
  });

  const response = await app.request(
    "/api/categorization-rules",
    {
      method: "POST",
      body: JSON.stringify({ scope: "gmail_pdf_sinopac" }),
      headers: { "content-type": "application/json" },
    },
    env,
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json() as { status: string }).status, "error");
});

test("DELETE /api/categorization-rules/:id deletes an owned rule", async () => {
  let deletedId: string | null = null;
  let deletedUserId: string | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        assert.equal(table, "categorization_rules");
        return {
          delete: () => ({
            eq: (col: string, val: string) => ({
              eq: async (col2: string, val2: string) => {
                if (col === "id") deletedId = val;
                if (col2 === "user_id") deletedUserId = val2;
                return { error: null };
              },
            }),
          }),
        };
      },
    }),
  });

  const response = await app.request("/api/categorization-rules/rule-1", { method: "DELETE" }, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(deletedId, "rule-1");
  assert.equal(deletedUserId, "user-1");
});

test("DELETE /api/categorization-rules/:id returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request("/api/categorization-rules/rule-1", { method: "DELETE" }, env);
  assert.equal(response.status, 401);
});

// ─── F4: DELETE /api/transactions (bulk by account_id) ───────────────────────

test("DELETE /api/transactions deletes all transactions for an owned account", async () => {
  let deletedAccountId: string | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({ data: [{ id: "account-1" }], error: null }),
            }),
          };
        }
        if (table === "transactions") {
          return {
            delete: () => ({
              eq: async (_col: string, val: string) => {
                deletedAccountId = val;
                return { error: null };
              },
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/transactions?account_id=account-1", { method: "DELETE" }, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], count: 0, status: "ok" });
  assert.equal(deletedAccountId, "account-1");
});

test("DELETE /api/transactions returns 400 when account_id is missing", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
  });
  const response = await app.request("/api/transactions", { method: "DELETE" }, env);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: "validation_error", error: "account_id is required.", status: "error" });
});

test("DELETE /api/transactions returns 400 when account does not belong to user", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              eq: async () => ({ data: [{ id: "account-other" }], error: null }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    }),
  });

  const response = await app.request("/api/transactions?account_id=account-1", { method: "DELETE" }, env);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    code: "validation_error",
    error: "Account does not belong to the current user.",
    status: "error",
  });
});

// ─── M1+M2: accounts and recurring-templates DELETE contract ─────────────────

test("DELETE /api/recurring-templates/:id deletes an owned template", async () => {
  let deletedId: string | null = null;
  let deletedUserId: string | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        assert.equal(table, "recurring_templates");
        return {
          delete: () => ({
            eq: (col: string, val: string) => ({
              eq: async (col2: string, val2: string) => {
                if (col === "id") deletedId = val;
                if (col2 === "user_id") deletedUserId = val2;
                return { error: null };
              },
            }),
          }),
        };
      },
    }),
  });

  const response = await app.request("/api/recurring-templates/rt-1", { method: "DELETE" }, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(deletedId, "rt-1");
  assert.equal(deletedUserId, "user-1");
});

test("DELETE /api/recurring-templates/:id returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request("/api/recurring-templates/rt-1", { method: "DELETE" }, env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    code: "unauthorized",
    error: "Missing or invalid Supabase bearer token.",
    status: "error",
  });
});


// ---------------------------------------------------------------------------
// PUT /api/accounts/:id
// ---------------------------------------------------------------------------

test("PUT /api/accounts/:id updates name, currency, broker", async () => {
  const updatedAccount = {
    id: "acct-1",
    user_id: "user-1",
    name: "Renamed Account",
    type: "bank",
    currency: "USD",
    broker: null,
    created_at: "2026-01-01T00:00:00Z",
  };

  let updatedPayload: Record<string, unknown> | null = null;
  let updatedId: string | null = null;
  let updatedUserId: string | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        assert.equal(table, "accounts");
        return {
          update: (payload: Record<string, unknown>) => {
            updatedPayload = payload;
            return {
              eq: (col: string, val: string) => {
                if (col === "id") updatedId = val;
                return {
                  eq: (col2: string, val2: string) => {
                    if (col2 === "user_id") updatedUserId = val2;
                    return {
                      select: () => ({
                        single: async () => ({ data: updatedAccount, error: null }),
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    }),
  });

  const response = await app.request(
    "/api/accounts/acct-1",
    {
      method: "PUT",
      body: JSON.stringify({ name: "Renamed Account", currency: "USD" }),
      headers: { "content-type": "application/json" },
    },
    env,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { items: unknown[]; count: number; status: string };
  assert.equal(body.status, "ok");
  assert.equal(body.count, 1);
  assert.equal(updatedPayload?.name, "Renamed Account");
  assert.equal(updatedPayload?.currency, "USD");
  assert.equal(updatedId, "acct-1");
  assert.equal(updatedUserId, "user-1");
});

test("PUT /api/accounts/:id returns 400 when no fields provided", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({ from: () => ({}) }),
  });

  const response = await app.request(
    "/api/accounts/acct-1",
    {
      method: "PUT",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    },
    env,
  );
  assert.equal(response.status, 400);
  const body = (await response.json()) as { code: string; status: string };
  assert.equal(body.status, "error");
  assert.equal(body.code, "validation_error");
});

test("PUT /api/accounts/:id returns 400 when name is empty string", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({ from: () => ({}) }),
  });

  const response = await app.request(
    "/api/accounts/acct-1",
    {
      method: "PUT",
      body: JSON.stringify({ name: "   " }),
      headers: { "content-type": "application/json" },
    },
    env,
  );
  assert.equal(response.status, 400);
  const body = (await response.json()) as { code: string; status: string };
  assert.equal(body.status, "error");
  assert.equal(body.code, "validation_error");
});

test("PUT /api/accounts/:id returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request(
    "/api/accounts/acct-1",
    {
      method: "PUT",
      body: JSON.stringify({ name: "x" }),
      headers: { "content-type": "application/json" },
    },
    env,
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    code: "unauthorized",
    error: "Missing or invalid Supabase bearer token.",
    status: "error",
  });
});

// ---------------------------------------------------------------------------
// PUT /api/recurring-templates/:id
// ---------------------------------------------------------------------------

test("PUT /api/recurring-templates/:id updates name and amount", async () => {
  const updatedTemplate = {
    id: "rt-1",
    user_id: "user-1",
    account_id: "acct-1",
    name: "Updated Template",
    category: null,
    amount: 500,
    currency: "TWD",
    cadence: "monthly",
    anchor_day: null,
    source_kind: "manual",
    source_section: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
  };

  let updatedPayload: Record<string, unknown> | null = null;
  let updatedId: string | null = null;
  let updatedUserId: string | null = null;

  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        assert.equal(table, "recurring_templates");
        return {
          update: (payload: Record<string, unknown>) => {
            updatedPayload = payload;
            return {
              eq: (col: string, val: string) => {
                if (col === "id") updatedId = val;
                return {
                  eq: (col2: string, val2: string) => {
                    if (col2 === "user_id") updatedUserId = val2;
                    return {
                      select: () => ({
                        single: async () => ({ data: updatedTemplate, error: null }),
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    }),
  });

  const response = await app.request(
    "/api/recurring-templates/rt-1",
    {
      method: "PUT",
      body: JSON.stringify({ name: "Updated Template", amount: 500 }),
      headers: { "content-type": "application/json" },
    },
    env,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { items: unknown[]; count: number; status: string };
  assert.equal(body.status, "ok");
  assert.equal(body.count, 1);
  assert.equal(updatedPayload?.name, "Updated Template");
  assert.equal(updatedPayload?.amount, 500);
  assert.equal(updatedId, "rt-1");
  assert.equal(updatedUserId, "user-1");
});

test("PUT /api/recurring-templates/:id returns 400 when no fields provided", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({ from: () => ({}) }),
  });

  const response = await app.request(
    "/api/recurring-templates/rt-1",
    {
      method: "PUT",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    },
    env,
  );
  assert.equal(response.status, 400);
  const body = (await response.json()) as { code: string; status: string };
  assert.equal(body.status, "error");
  assert.equal(body.code, "validation_error");
});

test("PUT /api/recurring-templates/:id returns 400 when anchor_day is out of range", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "reiko0099@gmail.com" }),
    createSupabaseAdminClient: () => ({ from: () => ({}) }),
  });

  const response = await app.request(
    "/api/recurring-templates/rt-1",
    {
      method: "PUT",
      body: JSON.stringify({ anchor_day: 32 }),
      headers: { "content-type": "application/json" },
    },
    env,
  );
  assert.equal(response.status, 400);
  const body = (await response.json()) as { code: string; status: string };
  assert.equal(body.status, "error");
  assert.equal(body.code, "validation_error");
});

test("PUT /api/recurring-templates/:id returns 401 when bearer user is missing", async () => {
  const app = createApp({ resolveAuthenticatedUser: async () => null });
  const response = await app.request(
    "/api/recurring-templates/rt-1",
    {
      method: "PUT",
      body: JSON.stringify({ name: "x" }),
      headers: { "content-type": "application/json" },
    },
    env,
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    code: "unauthorized",
    error: "Missing or invalid Supabase bearer token.",
    status: "error",
  });
});
