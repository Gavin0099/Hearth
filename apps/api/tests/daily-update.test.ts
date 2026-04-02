import assert from "node:assert/strict";
import test from "node:test";
import { runDailyUpdate } from "../src/cron/daily-update";
import type { WorkerBindings } from "../src/types";

const env: WorkerBindings = {
  APP_ENV: "test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

function createSupabaseStub(options?: {
  holdingsError?: string;
  accountsError?: string;
  priceUpsertError?: string;
  fxUpsertError?: string;
  jobRunsError?: string;
}) {
  const state = {
    priceSnapshots: [] as any[],
    fxRates: [] as any[],
    jobRuns: [] as any[],
    jobRunsPrunedCutoffs: [] as string[],
  };

  const supabase = {
    from(table: string) {
      if (table === "holdings") {
        return {
          select() {
            return Promise.resolve(
              options?.holdingsError
                ? { data: null, error: { message: options.holdingsError } }
                : {
                    data: [
                      { ticker: "2330", currency: "TWD" },
                      { ticker: "AAPL", currency: "USD" },
                      { ticker: "0050", currency: "twd" },
                    ],
                    error: null,
                  },
            );
          },
        };
      }

      if (table === "accounts") {
        return {
          select() {
            return Promise.resolve(
              options?.accountsError
                ? { data: null, error: { message: options.accountsError } }
                : {
                    data: [
                      { currency: "usd" },
                      { currency: "jpy" },
                      { currency: "TWD" },
                    ],
                    error: null,
                  },
            );
          },
        };
      }

      if (table === "price_snapshots") {
        return {
          upsert(rows: any[]) {
            state.priceSnapshots = rows;
            return Promise.resolve(
              options?.priceUpsertError
                ? { error: { message: options.priceUpsertError } }
                : { error: null },
            );
          },
        };
      }

      if (table === "fx_rates") {
        return {
          upsert(rows: any[]) {
            state.fxRates = rows;
            return Promise.resolve(
              options?.fxUpsertError
                ? { error: { message: options.fxUpsertError } }
                : { error: null },
            );
          },
        };
      }

      if (table === "job_runs") {
        return {
          insert(row: any) {
            state.jobRuns.push(row);
            return Promise.resolve(
              options?.jobRunsError
                ? { error: { message: options.jobRunsError } }
                : { error: null },
            );
          },
          delete() {
            return {
              lt(column: string, value: string) {
                if (column === "run_finished_at") state.jobRunsPrunedCutoffs.push(value);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, state };
}

test("runDailyUpdate returns execution summary and upserts normalized TWSE + FX rows", async () => {
  const { supabase, state } = createSupabaseStub();
  const logs: string[] = [];
  const errors: string[] = [];

  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("STOCK_DAY_ALL")) {
      return new Response(
        JSON.stringify([
          { Code: "2330", ClosingPrice: "912.00", Date: "20260401" },
          { Code: "0050", ClosingPrice: "180.50", Date: "2026-04-01" },
          { Code: "9999", ClosingPrice: "0", Date: "20260401" },
        ]),
        { status: 200 },
      );
    }

    if (url.includes("open.er-api.com")) {
      return new Response(
        JSON.stringify({
          result: "success",
          base_code: "TWD",
          time_last_update_utc: "Wed, 01 Apr 2026 00:00:00 +0000",
          rates: { USD: 0.03125, JPY: 4.8 },
        }),
        { status: 200 },
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const report = await runDailyUpdate(env, {
    supabase,
    fetchImpl,
    logger: {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message),
    },
  });

  assert.equal(report.priceSnapshots.attempted, 2);
  assert.equal(report.priceSnapshots.upserted, 2);
  assert.equal(report.priceSnapshots.skipped, 0);
  assert.deepEqual(report.priceSnapshots.errors, []);

  assert.equal(report.fxRates.attempted, 2);
  assert.equal(report.fxRates.upserted, 2);
  assert.equal(report.fxRates.skipped, 0);
  assert.deepEqual(report.fxRates.errors, []);

  assert.deepEqual(state.priceSnapshots, [
    { ticker: "2330", snapshot_date: "2026-04-01", close_price: 912, currency: "TWD" },
    { ticker: "0050", snapshot_date: "2026-04-01", close_price: 180.5, currency: "TWD" },
  ]);
  assert.deepEqual(state.fxRates, [
    { from_currency: "USD", to_currency: "TWD", rate_date: "2026-04-01", rate: 32 },
    { from_currency: "JPY", to_currency: "TWD", rate_date: "2026-04-01", rate: 0.20833333333333334 },
  ]);
  assert.equal(errors.length, 0);
  assert.equal(logs.some((message) => message.includes("daily-update complete")), true);
  assert.equal(state.jobRuns.length, 1);
  assert.equal(state.jobRuns[0].job_name, "daily-update");
  assert.equal(state.jobRuns[0].status, "ok");
});

test("runDailyUpdate records partial failures without dropping the whole cron summary", async () => {
  const { supabase, state } = createSupabaseStub({ accountsError: "accounts down" });
  const errors: string[] = [];

  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("STOCK_DAY_ALL")) {
      return new Response(
        JSON.stringify([{ Code: "2330", ClosingPrice: "912.00", Date: "20260401" }]),
        { status: 200 },
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const report = await runDailyUpdate(env, {
    supabase,
    fetchImpl,
    logger: {
      log: () => {},
      error: (message: string) => errors.push(message),
    },
  });

  assert.equal(report.priceSnapshots.upserted, 1);
  assert.equal(report.fxRates.attempted, 1);
  assert.equal(report.fxRates.upserted, 0);
  assert.equal(report.fxRates.errors.some((message) => message.includes("accounts fetch error")), true);
  assert.equal(report.fxRates.errors.some((message) => message.includes("FX fetch failed")), true);
  assert.deepEqual(state.priceSnapshots, [
    { ticker: "2330", snapshot_date: "2026-04-01", close_price: 912, currency: "TWD" },
  ]);
  assert.deepEqual(state.fxRates, []);
  assert.equal(state.jobRuns.length, 1);
  assert.equal(state.jobRuns[0].status, "error");
  assert.equal(errors.some((message) => message.includes("accounts fetch error: accounts down")), true);
});

test("runDailyUpdate prunes job_runs older than 90 days after persisting the run", async () => {
  const { supabase, state } = createSupabaseStub();
  const fixedNow = new Date("2026-04-01T06:00:05.000Z");

  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("STOCK_DAY_ALL")) return new Response(JSON.stringify([]), { status: 200 });
    if (url.includes("open.er-api.com")) {
      return new Response(
        JSON.stringify({ result: "success", base_code: "TWD", time_last_update_utc: "Wed, 01 Apr 2026 00:00:00 +0000", rates: {} }),
        { status: 200 },
      );
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  await runDailyUpdate(env, {
    supabase,
    fetchImpl,
    logger: { log: () => {}, error: () => {} },
    now: () => fixedNow,
  });

  assert.equal(state.jobRunsPrunedCutoffs.length, 1);
  const expectedCutoff = new Date(fixedNow.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(state.jobRunsPrunedCutoffs[0], expectedCutoff);
});
