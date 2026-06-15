import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app";

const sampleEmail = {
  id: "gmail-msg-1",
  subject: "ESUN credit card statement 2026-05",
  date: "Mon, 01 Jun 2026 10:00:00 +0800",
  bank: "esun",
  attachments: [
    { id: "att-1", filename: "esun-2026-05.pdf", mimeType: "application/pdf" },
  ],
};

test("POST /api/import-jobs/from-gmail-search creates pending jobs for mapped Gmail PDFs", async () => {
  const inserts: Array<Record<string, unknown>> = [];
  const existingJobLookups: string[][] = [];
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "user@example.com" }),
    createSupabaseAdminClient: () =>
      ({
        from(table: string) {
          if (table === "bank_account_mapping") {
            return {
              select() {
                return {
                  eq(column: string, value: string | boolean) {
                    assert.equal(column, "user_id");
                    assert.equal(value, "user-1");
                    return {
                      eq(enabledColumn: string, enabledValue: boolean) {
                        assert.equal(enabledColumn, "enabled");
                        assert.equal(enabledValue, true);
                        return Promise.resolve({
                          data: [{ bank_key: "esun", source_type: "credit_card", account_id: "account-1" }],
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          }

          if (table === "accounts") {
            return {
              select() {
                return {
                  eq(column: string, value: string) {
                    assert.equal(column, "user_id");
                    assert.equal(value, "user-1");
                    return Promise.resolve({
                      data: [{ id: "account-1", name: "ESUN card", type: "cash_credit", broker: null }],
                      error: null,
                    });
                  },
                };
              },
            };
          }

          assert.equal(table, "import_jobs");
          return {
            select() {
              return {
                eq(column: string, value: string) {
                  assert.equal(column, "user_id");
                  assert.equal(value, "user-1");
                  return {
                    in(columnName: string, values: string[]) {
                      assert.equal(columnName, "gmail_message_id");
                      existingJobLookups.push(values);
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                },
              };
            },
            insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
              inserts.push(...(Array.isArray(payload) ? payload : [payload]));
              return Promise.resolve({ error: null });
            },
          };
        },
      }) as any,
  });

  const response = await app.request(
    "/api/import-jobs/from-gmail-search",
    {
      method: "POST",
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      body: JSON.stringify({ emails: [sampleEmail] }),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, { created: 1, updated: 0, skipped: 0, status: "ok" });
  assert.deepEqual(existingJobLookups, [["gmail-msg-1"]]);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].user_id, "user-1");
  assert.equal(inserts[0].gmail_message_id, "gmail-msg-1");
  assert.equal(inserts[0].attachment_id, "att-1");
  assert.equal(inserts[0].mapped_account_id, "account-1");
  assert.equal(inserts[0].status, "pending_parse");
});

test("POST /api/import-jobs/from-gmail-search keeps existing jobs from being downgraded", async () => {
  let insertAttempted = false;
  let updateAttempted = false;
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "user@example.com" }),
    createSupabaseAdminClient: () =>
      ({
        from(table: string) {
          if (table === "bank_account_mapping") {
            return {
              select() {
                return {
                  eq() {
                    return {
                      eq() {
                        return Promise.resolve({
                          data: [{ bank_key: "esun", source_type: "credit_card", account_id: "account-1" }],
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          }

          if (table === "accounts") {
            return {
              select() {
                return {
                  eq() {
                    return Promise.resolve({
                      data: [{ id: "account-1", name: "ESUN card", type: "cash_credit", broker: null }],
                      error: null,
                    });
                  },
                };
              },
            };
          }

          assert.equal(table, "import_jobs");
          return {
            select() {
              return {
                eq() {
                  return {
                    in() {
                      return Promise.resolve({
                        data: [{
                          id: "job-1",
                          gmail_message_id: "gmail-msg-1",
                          attachment_id: "att-1",
                          status: "imported",
                          review_reason: null,
                        }],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
            insert() {
              insertAttempted = true;
              return Promise.resolve({ error: null });
            },
            update(payload: Record<string, unknown>) {
              updateAttempted = true;
              assert.equal(payload.status, "pending_parse");
              return {
                eq() { return this; },
                select() {
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
          };
        },
      }) as any,
  });

  const response = await app.request(
    "/api/import-jobs/from-gmail-search",
    {
      method: "POST",
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      body: JSON.stringify({ emails: [sampleEmail] }),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, { created: 0, updated: 0, skipped: 1, status: "ok" });
  assert.equal(insertAttempted, false);
  assert.equal(updateAttempted, false);
});

test("POST /api/import-jobs/from-gmail-search promotes existing missing-mapping jobs", async () => {
  let insertAttempted = false;
  let updatePayload: Record<string, unknown> | null = null;
  const updateFilters: Array<[string, string]> = [];
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "user@example.com" }),
    createSupabaseAdminClient: () =>
      ({
        from(table: string) {
          if (table === "bank_account_mapping") {
            return {
              select() {
                return {
                  eq() {
                    return {
                      eq() {
                        return Promise.resolve({
                          data: [{ bank_key: "esun", source_type: "credit_card", account_id: "account-1" }],
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          }

          if (table === "accounts") {
            return {
              select() {
                return {
                  eq() {
                    return Promise.resolve({
                      data: [{ id: "account-1", name: "ESUN card", type: "cash_credit", broker: null }],
                      error: null,
                    });
                  },
                };
              },
            };
          }

          assert.equal(table, "import_jobs");
          return {
            select() {
              return {
                eq() {
                  return {
                    in() {
                      return Promise.resolve({
                        data: [{
                          id: "job-1",
                          gmail_message_id: "gmail-msg-1",
                          attachment_id: "att-1",
                          status: "needs_review",
                          review_reason: "missing_mapping",
                        }],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
            insert() {
              insertAttempted = true;
              return Promise.resolve({ error: null });
            },
            update(payload: Record<string, unknown>) {
              updatePayload = payload;
              return {
                eq(column: string, value: string) {
                  updateFilters.push([column, value]);
                  return this;
                },
                select(column: string) {
                  assert.equal(column, "id");
                  return Promise.resolve({ data: [{ id: "job-1" }], error: null });
                },
              };
            },
          };
        },
      }) as any,
  });

  const response = await app.request(
    "/api/import-jobs/from-gmail-search",
    {
      method: "POST",
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      body: JSON.stringify({ emails: [sampleEmail] }),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, { created: 0, updated: 1, skipped: 0, status: "ok" });
  assert.equal(insertAttempted, false);
  assert.equal(updatePayload?.status, "pending_parse");
  assert.equal(updatePayload?.mapped_account_id, "account-1");
  assert.equal(updatePayload?.review_reason, null);
  assert.deepEqual(updateFilters, [
    ["id", "job-1"],
    ["user_id", "user-1"],
    ["status", "needs_review"],
    ["review_reason", "missing_mapping"],
  ]);
});

test("POST /api/import-jobs/from-gmail-search auto-resolves a unique existing bank account", async () => {
  const inserts: Array<Record<string, unknown>> = [];
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "user@example.com" }),
    createSupabaseAdminClient: () =>
      ({
        from(table: string) {
          if (table === "bank_account_mapping") {
            return {
              select() {
                return {
                  eq() {
                    return {
                      eq() {
                        return Promise.resolve({ data: [], error: null });
                      },
                    };
                  },
                };
              },
            };
          }

          if (table === "accounts") {
            return {
              select() {
                return {
                  eq(column: string, value: string) {
                    assert.equal(column, "user_id");
                    assert.equal(value, "user-1");
                    return Promise.resolve({
                      data: [
                        { id: "account-esun-card", name: "ESUN card", type: "cash_credit", broker: null },
                        { id: "account-esun-bank", name: "ESUN bank", type: "cash_bank", broker: null },
                        { id: "account-sinopac-card", name: "Sinopac card", type: "cash_credit", broker: null },
                      ],
                      error: null,
                    });
                  },
                };
              },
            };
          }

          assert.equal(table, "import_jobs");
          return {
            select() {
              return {
                eq() {
                  return {
                    in() {
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                },
              };
            },
            insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
              inserts.push(...(Array.isArray(payload) ? payload : [payload]));
              return Promise.resolve({ error: null });
            },
          };
        },
      }) as any,
  });

  const response = await app.request(
    "/api/import-jobs/from-gmail-search",
    {
      method: "POST",
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      body: JSON.stringify({ emails: [sampleEmail] }),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, { created: 1, updated: 0, skipped: 0, status: "ok" });
  assert.equal(inserts[0].mapped_account_id, "account-esun-card");
  assert.equal(inserts[0].status, "pending_parse");
  assert.equal(inserts[0].review_reason, null);
});

test("POST /api/import-jobs/from-gmail-search creates a bank-labeled account when none exists", async () => {
  const accountInserts: Array<Record<string, unknown>> = [];
  const jobInserts: Array<Record<string, unknown>> = [];
  const app = createApp({
    resolveAuthenticatedUser: async () => ({ id: "user-1", email: "user@example.com" }),
    createSupabaseAdminClient: () =>
      ({
        from(table: string) {
          if (table === "bank_account_mapping") {
            return {
              select() {
                return {
                  eq() {
                    return {
                      eq() {
                        return Promise.resolve({ data: [], error: null });
                      },
                    };
                  },
                };
              },
            };
          }

          if (table === "accounts") {
            return {
              select() {
                return {
                  eq() {
                    return Promise.resolve({ data: [], error: null });
                  },
                };
              },
              insert(payload: Record<string, unknown>) {
                accountInserts.push(payload);
                return {
                  select() {
                    return {
                      single() {
                        return Promise.resolve({
                          data: {
                            id: "created-esun-card",
                            name: payload.name,
                            type: payload.type,
                            broker: payload.broker,
                          },
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          }

          assert.equal(table, "import_jobs");
          return {
            select() {
              return {
                eq() {
                  return {
                    in() {
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                },
              };
            },
            insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
              jobInserts.push(...(Array.isArray(payload) ? payload : [payload]));
              return Promise.resolve({ error: null });
            },
          };
        },
      }) as any,
  });

  const response = await app.request(
    "/api/import-jobs/from-gmail-search",
    {
      method: "POST",
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      body: JSON.stringify({ emails: [sampleEmail] }),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, { created: 1, updated: 0, skipped: 0, status: "ok" });
  assert.equal(accountInserts.length, 1);
  assert.equal(accountInserts[0].user_id, "user-1");
  assert.equal(accountInserts[0].name, "玉山 信用卡");
  assert.equal(accountInserts[0].type, "cash_credit");
  assert.equal(accountInserts[0].currency, "TWD");
  assert.equal(accountInserts[0].broker, "esun");
  assert.equal(jobInserts[0].mapped_account_id, "created-esun-card");
  assert.equal(jobInserts[0].status, "pending_parse");
  assert.equal(jobInserts[0].review_reason, null);
});
