import test from "node:test";
import assert from "node:assert/strict";
import { createApp, type AuthenticatedUser, type SupabaseAdminClient } from "../src/app";
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
