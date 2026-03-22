import { Hono } from "hono";
import type { ApiEnv } from "../app";

export const userSettingsRoutes = new Hono<ApiEnv>();

userSettingsRoutes.get("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json({ error: "Unauthorized", status: "error" }, 401);
  }

  const supabase = createSupabaseAdminClient(c.env);
  const { data, error } = await supabase
    .from("user_settings")
    .select("sinopac_pdf_password, esun_pdf_password, gmail_connected, gmail_last_sync_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message, status: "error" }, 500);
  }

  return c.json({
    settings: data ?? {
      sinopac_pdf_password: null,
      esun_pdf_password: null,
      gmail_connected: false,
      gmail_last_sync_at: null,
    },
    status: "ok",
  });
});

userSettingsRoutes.put("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json({ error: "Unauthorized", status: "error" }, 401);
  }

  const body = await c.req.json<{
    sinopac_pdf_password?: string | null;
    esun_pdf_password?: string | null;
    gmail_connected?: boolean;
    gmail_last_sync_at?: string | null;
  }>();

  const supabase = createSupabaseAdminClient(c.env);
  const { error } = await supabase
    .from("user_settings")
    .upsert(
      {
        user_id: user.id,
        ...body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    return c.json({ error: error.message, status: "error" }, 500);
  }

  return c.json({ status: "ok" });
});
