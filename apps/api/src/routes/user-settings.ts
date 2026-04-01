import { Hono } from "hono";
import {
  decryptSecretValue,
  encryptSecretValue,
  getUserSettingsSecret,
  isEncryptedSecretValue,
} from "../lib/secrets";
import type { ApiEnv } from "../types";

export const userSettingsRoutes = new Hono<ApiEnv>();

function noStore(c: { header: (name: string, value: string) => void }) {
  c.header("Cache-Control", "no-store");
}

async function maybeUpgradePlaintextSecrets(
  settings: {
    default_pdf_password?: string | null;
    sinopac_pdf_password?: string | null;
    esun_pdf_password?: string | null;
    taishin_pdf_password?: string | null;
  } | null,
  userId: string,
  env: ApiEnv["Bindings"],
  createSupabaseAdminClient: ApiEnv["Variables"]["createSupabaseAdminClient"],
) {
  if (!settings) {
    return;
  }

  const upgrades: Record<string, string | null> = {};
  if (settings.default_pdf_password && !isEncryptedSecretValue(settings.default_pdf_password)) {
    upgrades.default_pdf_password = await encryptSecretValue(settings.default_pdf_password, env);
  }
  if (settings.sinopac_pdf_password && !isEncryptedSecretValue(settings.sinopac_pdf_password)) {
    upgrades.sinopac_pdf_password = await encryptSecretValue(settings.sinopac_pdf_password, env);
  }
  if (settings.esun_pdf_password && !isEncryptedSecretValue(settings.esun_pdf_password)) {
    upgrades.esun_pdf_password = await encryptSecretValue(settings.esun_pdf_password, env);
  }
  if (settings.taishin_pdf_password && !isEncryptedSecretValue(settings.taishin_pdf_password)) {
    upgrades.taishin_pdf_password = await encryptSecretValue(settings.taishin_pdf_password, env);
  }

  if (Object.keys(upgrades).length === 0) {
    return;
  }

  const supabase = createSupabaseAdminClient(env);
  await supabase.from("user_settings").upsert({
    user_id: userId,
    updated_at: new Date().toISOString(),
    ...upgrades,
  }, { onConflict: "user_id" });
}

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
    .select("default_pdf_password, sinopac_pdf_password, esun_pdf_password, taishin_pdf_password, gmail_connected, gmail_last_sync_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message, status: "error" }, 500);
  }

  noStore(c);
  return c.json({
    settings: data ?? {
      has_default_pdf_password: false,
      has_sinopac_pdf_password: false,
      has_esun_pdf_password: false,
      has_taishin_pdf_password: false,
      gmail_connected: false,
      gmail_last_sync_at: null,
    },
    ...(data
      ? {
          settings: {
            has_default_pdf_password: Boolean(data.default_pdf_password),
            has_sinopac_pdf_password: Boolean(data.sinopac_pdf_password),
            has_esun_pdf_password: Boolean(data.esun_pdf_password),
            has_taishin_pdf_password: Boolean(data.taishin_pdf_password),
            gmail_connected: Boolean(data.gmail_connected),
            gmail_last_sync_at: data.gmail_last_sync_at,
          },
        }
      : {}),
    status: "ok",
  });
});

userSettingsRoutes.get("/pdf-passwords", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json({ error: "Unauthorized", status: "error" }, 401);
  }

  const supabase = createSupabaseAdminClient(c.env);
  const { data, error } = await supabase
    .from("user_settings")
    .select("default_pdf_password, sinopac_pdf_password, esun_pdf_password, taishin_pdf_password")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message, status: "error" }, 500);
  }

  try {
    getUserSettingsSecret(c.env);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Secret key unavailable.", status: "error" },
      500,
    );
  }

  await maybeUpgradePlaintextSecrets(data, user.id, c.env, createSupabaseAdminClient);

  noStore(c);
  return c.json({
    settings: data
      ? {
          default_pdf_password: await decryptSecretValue(data.default_pdf_password, c.env),
          sinopac_pdf_password: await decryptSecretValue(data.sinopac_pdf_password, c.env),
          esun_pdf_password: await decryptSecretValue(data.esun_pdf_password, c.env),
          taishin_pdf_password: await decryptSecretValue(data.taishin_pdf_password, c.env),
        }
      : {
          default_pdf_password: null,
          sinopac_pdf_password: null,
          esun_pdf_password: null,
          taishin_pdf_password: null,
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
    default_pdf_password?: string | null;
    sinopac_pdf_password?: string | null;
    esun_pdf_password?: string | null;
    taishin_pdf_password?: string | null;
    clear_default_pdf_password?: boolean;
    clear_sinopac_pdf_password?: boolean;
    clear_esun_pdf_password?: boolean;
    clear_taishin_pdf_password?: boolean;
    gmail_connected?: boolean;
    gmail_last_sync_at?: string | null;
  }>();

  const payload: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };

  const wantsPasswordWrite = [
    body.default_pdf_password,
    body.sinopac_pdf_password,
    body.esun_pdf_password,
    body.taishin_pdf_password,
  ].some((value) => value !== undefined);

  if (wantsPasswordWrite) {
    try {
      getUserSettingsSecret(c.env);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Secret key unavailable.", status: "error" },
        500,
      );
    }
  }

  if (body.default_pdf_password !== undefined) {
    payload.default_pdf_password = body.default_pdf_password === null
      ? null
      : await encryptSecretValue(body.default_pdf_password, c.env);
  } else if (body.clear_default_pdf_password) {
    payload.default_pdf_password = null;
  }

  if (body.sinopac_pdf_password !== undefined) {
    payload.sinopac_pdf_password = body.sinopac_pdf_password === null
      ? null
      : await encryptSecretValue(body.sinopac_pdf_password, c.env);
  } else if (body.clear_sinopac_pdf_password) {
    payload.sinopac_pdf_password = null;
  }

  if (body.esun_pdf_password !== undefined) {
    payload.esun_pdf_password = body.esun_pdf_password === null
      ? null
      : await encryptSecretValue(body.esun_pdf_password, c.env);
  } else if (body.clear_esun_pdf_password) {
    payload.esun_pdf_password = null;
  }

  if (body.taishin_pdf_password !== undefined) {
    payload.taishin_pdf_password = body.taishin_pdf_password === null
      ? null
      : await encryptSecretValue(body.taishin_pdf_password, c.env);
  } else if (body.clear_taishin_pdf_password) {
    payload.taishin_pdf_password = null;
  }

  if (body.gmail_connected !== undefined) {
    payload.gmail_connected = body.gmail_connected;
  }

  if (body.gmail_last_sync_at !== undefined) {
    payload.gmail_last_sync_at = body.gmail_last_sync_at;
  }

  const supabase = createSupabaseAdminClient(c.env);
  const { error } = await supabase
    .from("user_settings")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    return c.json({ error: error.message, status: "error" }, 500);
  }

  noStore(c);
  return c.json({ status: "ok" });
});
