import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app";

test("GET /api/ops/job-runs/latest returns latest run for authenticated user", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "ops@example.com" }),
    createSupabaseAdminClient: () =>
      ({
        from(table: string) {
          assert.equal(table, "job_runs");
          return {
            select() {
              return {
                eq(column: string, value: string) {
                  assert.equal(column, "job_name");
                  assert.equal(value, "daily-update");
                  return {
                    order(orderColumn: string, options: { ascending: boolean }) {
                      assert.equal(orderColumn, "run_finished_at");
                      assert.equal(options.ascending, false);
                      return {
                        limit(count: number) {
                          assert.equal(count, 1);
                          return Promise.resolve({
                            data: [
                              {
                                id: "run-1",
                                job_name: "daily-update",
                                run_started_at: "2026-04-01T06:00:00.000Z",
                                run_finished_at: "2026-04-01T06:00:05.000Z",
                                status: "ok",
                                report: { fxRates: { upserted: 2 } },
                                created_at: "2026-04-01T06:00:05.000Z",
                              },
                            ],
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      }) as any,
  });

  const response = await app.request("/api/ops/job-runs/latest?job_name=daily-update", {
    headers: { Authorization: "Bearer valid-token" },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ok");
  assert.equal(payload.item.job_name, "daily-update");
  assert.equal(payload.item.status, "ok");
  assert.equal(payload.healthy, true);
  assert.equal(payload.reason, "latest job run is acceptable");
});

test("GET /api/ops/job-runs/latest returns 401 when auth is missing", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => null,
  });

  const response = await app.request("/api/ops/job-runs/latest");
  assert.equal(response.status, 401);

  const payload = await response.json();
  assert.equal(payload.status, "error");
  assert.equal(payload.code, "unauthorized");
});

test("GET /api/ops/job-runs/latest reports unhealthy when latest status mismatches requirement", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "ops@example.com" }),
    createSupabaseAdminClient: () =>
      ({
        from() {
          return {
            select() {
              return {
                eq() {
                  return {
                    order() {
                      return {
                        limit() {
                          return Promise.resolve({
                            data: [
                              {
                                id: "run-2",
                                job_name: "daily-update",
                                run_started_at: "2026-04-01T06:00:00.000Z",
                                run_finished_at: "2026-04-01T06:00:05.000Z",
                                status: "error",
                                report: {},
                                created_at: "2026-04-01T06:00:05.000Z",
                              },
                            ],
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      }) as any,
  });

  const response = await app.request("/api/ops/job-runs/latest?job_name=daily-update&require_status=ok", {
    headers: { Authorization: "Bearer valid-token" },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ok");
  assert.equal(payload.healthy, false);
  assert.equal(
    payload.reason,
    "latest job run status mismatch. expected=ok actual=error",
  );
});

test("GET /api/ops/job-runs/latest reports unhealthy when report sections contain errors", async () => {
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "ops@example.com" }),
    createSupabaseAdminClient: () =>
      ({
        from() {
          return {
            select() {
              return {
                eq() {
                  return {
                    order() {
                      return {
                        limit() {
                          return Promise.resolve({
                            data: [
                              {
                                id: "run-3",
                                job_name: "daily-update",
                                run_started_at: "2026-04-01T06:00:00.000Z",
                                run_finished_at: "2026-04-01T06:00:05.000Z",
                                status: "ok",
                                report: {
                                  priceSnapshots: { errors: [] },
                                  fxRates: { errors: ["FX API 503"] },
                                },
                                created_at: "2026-04-01T06:00:05.000Z",
                              },
                            ],
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      }) as any,
  });

  const response = await app.request(
    "/api/ops/job-runs/latest?job_name=daily-update&require_status=ok&require_zero_errors=true",
    {
      headers: { Authorization: "Bearer valid-token" },
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ok");
  assert.equal(payload.healthy, false);
  assert.equal(
    payload.reason,
    "latest job run report contains section errors: fxRates",
  );
});
