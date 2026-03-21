import test from "node:test";
import assert from "node:assert/strict";
import { createApp, type AuthenticatedUser, type SupabaseAdminClient } from "../src/app";
import { buildTransactionSourceHash } from "../src/lib/transaction-hash";
import type { WorkerBindings } from "../src/types";

const env: WorkerBindings = {
  APP_ENV: "test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

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
            insert: async (values: Array<Record<string, unknown>>) => {
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
            insert: async (values: Array<Record<string, unknown>>) => {
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
      category: "其他",
      description: "退款",
      source: "sinopac_bank",
      source_hash: insertedRows[1]?.source_hash,
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
            insert: async (values: Array<Record<string, unknown>>) => {
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
  });
  assert.deepEqual(insertedRows, []);
});
