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

          assert.equal(table, "import_jobs");
          return {
            insert(payload: Record<string, unknown>) {
              inserts.push(payload);
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
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].user_id, "user-1");
  assert.equal(inserts[0].gmail_message_id, "gmail-msg-1");
  assert.equal(inserts[0].attachment_id, "att-1");
  assert.equal(inserts[0].mapped_account_id, "account-1");
  assert.equal(inserts[0].status, "pending_parse");
});

test("POST /api/import-jobs/from-gmail-search keeps existing jobs from being downgraded", async () => {
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

          assert.equal(table, "import_jobs");
          return {
            insert() {
              return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
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
  assert.equal(updateAttempted, true);
});
