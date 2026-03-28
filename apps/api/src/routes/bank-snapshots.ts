import { Hono } from "hono";
import type { ApiEnv } from "../types";

export const bankSnapshotsRoutes = new Hono<ApiEnv>();

bankSnapshotsRoutes.get("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json({ error: "Unauthorized", status: "error" }, 401);
  }

  const supabase = createSupabaseAdminClient(c.env);
  const { data, error } = await supabase
    .from("bank_snapshots")
    .select("id, bank, type, statement_date, data, created_at, updated_at")
    .eq("user_id", user.id)
    .order("statement_date", { ascending: false });

  if (error) {
    return c.json({ error: error.message, status: "error" }, 500);
  }

  return c.json({ items: data ?? [], status: "ok" });
});

bankSnapshotsRoutes.put("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json({ error: "Unauthorized", status: "error" }, 401);
  }

  const body = await c.req.json<{
    bank: string;
    type: string;
    statement_date: string;
    data: unknown;
  }>();

  const supabase = createSupabaseAdminClient(c.env);
  const { error } = await supabase
    .from("bank_snapshots")
    .upsert(
      {
        user_id: user.id,
        bank: body.bank,
        type: body.type,
        statement_date: body.statement_date,
        data: body.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,bank,type,statement_date" },
    );

  if (error) {
    return c.json({ error: error.message, status: "error" }, 500);
  }

  return c.json({ status: "ok" });
});

bankSnapshotsRoutes.delete("/:id", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json({ error: "Unauthorized", status: "error" }, 401);
  }

  const id = c.req.param("id");
  const supabase = createSupabaseAdminClient(c.env);
  const { error } = await supabase
    .from("bank_snapshots")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return c.json({ error: error.message, status: "error" }, 500);
  }

  return c.json({ status: "ok" });
});
