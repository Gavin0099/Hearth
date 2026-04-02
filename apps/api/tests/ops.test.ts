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

test("GET /api/ops/job-runs/summary returns recent status and report-error totals", async () => {
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
                          assert.equal(count, 3);
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
                                  fxRates: { errors: [] },
                                },
                                created_at: "2026-04-01T06:00:05.000Z",
                              },
                              {
                                id: "run-2",
                                job_name: "daily-update",
                                run_started_at: "2026-03-31T06:00:00.000Z",
                                run_finished_at: "2026-03-31T06:00:05.000Z",
                                status: "error",
                                report: {
                                  priceSnapshots: { errors: ["TWSE API 503"] },
                                  fxRates: { errors: [] },
                                },
                                created_at: "2026-03-31T06:00:05.000Z",
                              },
                              {
                                id: "run-1",
                                job_name: "daily-update",
                                run_started_at: "2026-03-30T06:00:00.000Z",
                                run_finished_at: "2026-03-30T06:00:05.000Z",
                                status: "ok",
                                report: {
                                  priceSnapshots: { errors: [] },
                                  fxRates: { errors: ["FX API 500"] },
                                },
                                created_at: "2026-03-30T06:00:05.000Z",
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

  const response = await app.request("/api/ops/job-runs/summary?job_name=daily-update&limit=3", {
    headers: { Authorization: "Bearer valid-token" },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ok");
  assert.equal(payload.job_name, "daily-update");
  assert.equal(payload.limit, 3);
  assert.equal(payload.verdict, "healthy");
  assert.deepEqual(payload.reasons, []);
  assert.equal(payload.latest.id, "run-3");
  assert.deepEqual(payload.latest.report_error_sections, []);
  assert.equal(typeof payload.latest.age_minutes, "number");
  assert.deepEqual(payload.totals, {
    runs: 3,
    ok: 2,
    error: 1,
    with_report_errors: 2,
    consecutive_status_errors: 0,
    consecutive_report_error_runs: 0,
  });
});

test("GET /api/ops/job-runs/summary reports critical when latest runs are stale and consecutively failing", async () => {
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
                                id: "run-5",
                                job_name: "daily-update",
                                run_started_at: "2026-03-28T06:00:00.000Z",
                                run_finished_at: "2026-03-28T06:00:05.000Z",
                                status: "error",
                                report: { fxRates: { errors: ["FX API 500"] } },
                                created_at: "2026-03-28T06:00:05.000Z",
                              },
                              {
                                id: "run-4",
                                job_name: "daily-update",
                                run_started_at: "2026-03-27T06:00:00.000Z",
                                run_finished_at: "2026-03-27T06:00:05.000Z",
                                status: "error",
                                report: { priceSnapshots: { errors: ["TWSE 503"] } },
                                created_at: "2026-03-27T06:00:05.000Z",
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
    "/api/ops/job-runs/summary?job_name=daily-update&limit=2&max_age_minutes=60&consecutive_failure_threshold=2&consecutive_report_error_threshold=2",
    {
      headers: { Authorization: "Bearer valid-token" },
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ok");
  assert.equal(payload.verdict, "critical");
  assert.equal(payload.latest.status, "error");
  assert.deepEqual(payload.totals, {
    runs: 2,
    ok: 0,
    error: 2,
    with_report_errors: 2,
    consecutive_status_errors: 2,
    consecutive_report_error_runs: 2,
  });
  assert.match(payload.reasons.join(" | "), /older than 60 minute/);
  assert.match(payload.reasons.join(" | "), /latest 2 run\(s\) ended with status=error/);
  assert.match(payload.reasons.join(" | "), /latest 2 run\(s\) contain report section errors/);
});
