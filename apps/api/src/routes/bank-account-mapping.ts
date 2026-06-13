import { Hono } from "hono";
import type { ApiEnv } from "../types";

export type BankAccountMappingRecord = {
  id: string;
  bank_key: string;
  source_type: "credit_card" | "bank_account";
  account_id: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export const bankAccountMappingRoutes = new Hono<ApiEnv>();

bankAccountMappingRoutes.get("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "unauthorized", status: "error" }, 401);

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  const { data, error } = await supabase
    .from("bank_account_mapping")
    .select("id, bank_key, source_type, account_id, enabled, created_at, updated_at")
    .eq("user_id", user.id)
    .order("bank_key", { ascending: true });

  if (error) return c.json({ error: error.message, status: "error" }, 500);
  return c.json({ items: data ?? [], status: "ok" });
});

bankAccountMappingRoutes.put("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "unauthorized", status: "error" }, 401);

  const body = await c.req.json<{
    bank_key: string;
    source_type: "credit_card" | "bank_account";
    account_id: string;
    enabled?: boolean;
  }>();

  if (!body.bank_key || !body.source_type || !body.account_id) {
    return c.json({ error: "bank_key, source_type, account_id are required", status: "error" }, 400);
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  const { error } = await supabase.from("bank_account_mapping").upsert(
    {
      user_id: user.id,
      bank_key: body.bank_key,
      source_type: body.source_type,
      account_id: body.account_id,
      enabled: body.enabled ?? true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,bank_key,source_type" },
  );

  if (error) return c.json({ error: error.message, status: "error" }, 500);
  return c.json({ status: "ok" });
});

bankAccountMappingRoutes.delete("/:id", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "unauthorized", status: "error" }, 401);

  const id = c.req.param("id");
  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);

  const { error } = await supabase
    .from("bank_account_mapping")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return c.json({ error: error.message, status: "error" }, 500);
  return c.json({ status: "ok" });
});
