import { Hono } from "hono";
import type { ApiEnv } from "../types";

type CategoryRuleRow = {
  id: string;
  user_id: string;
  scope: string;
  direction: string;
  normalized_description: string;
  raw_description: string;
  category: string;
  updated_at: string;
};

type RulesResponse =
  | { items: CategoryRuleRow[]; status: "ok" }
  | { code: "unauthorized" | "validation_error" | "database_error"; error: string; status: "error" };

export const categorizationRulesRoutes = new Hono<ApiEnv>();

categorizationRulesRoutes.get("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<RulesResponse>({ code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" }, 401);
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);
  const { data, error } = await supabase
    .from("categorization_rules")
    .select("id, user_id, scope, direction, normalized_description, raw_description, category, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return c.json<RulesResponse>({ code: "database_error", error: error.message, status: "error" }, 500);
  }

  return c.json<RulesResponse>({ items: (data ?? []) as CategoryRuleRow[], status: "ok" });
});

categorizationRulesRoutes.post("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<RulesResponse>({ code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" }, 401);
  }

  let payload: {
    scope: string;
    direction: string;
    normalized_description: string;
    raw_description: string;
    category: string;
  };
  try {
    payload = await c.req.json();
  } catch {
    return c.json<RulesResponse>({ code: "validation_error", error: "Invalid JSON body.", status: "error" }, 400);
  }

  const { scope, direction, normalized_description, raw_description, category } = payload;
  if (!scope || !direction || !normalized_description || !category) {
    return c.json<RulesResponse>({ code: "validation_error", error: "scope, direction, normalized_description, category are required.", status: "error" }, 400);
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);
  const { data, error } = await supabase
    .from("categorization_rules")
    .upsert(
      {
        user_id: user.id,
        scope,
        direction,
        normalized_description,
        raw_description: raw_description ?? "",
        category,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,scope,direction,normalized_description" },
    )
    .select("id, user_id, scope, direction, normalized_description, raw_description, category, updated_at")
    .single();

  if (error) {
    return c.json<RulesResponse>({ code: "database_error", error: error.message, status: "error" }, 500);
  }

  return c.json<RulesResponse>({ items: [data as CategoryRuleRow], status: "ok" }, 201);
});

categorizationRulesRoutes.delete("/:id", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<RulesResponse>({ code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" }, 401);
  }

  const id = c.req.param("id");
  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);
  const { error } = await supabase
    .from("categorization_rules")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return c.json<RulesResponse>({ code: "database_error", error: error.message, status: "error" }, 500);
  }

  return c.json({ status: "ok" });
});
