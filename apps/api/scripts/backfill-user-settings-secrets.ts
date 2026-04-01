import { createClient } from "@supabase/supabase-js";
import {
  buildUserSettingsSecretUpgradePayload,
  getUserSettingsSecret,
  USER_SETTINGS_SECRET_FIELDS,
  type UserSettingsSecretRecord,
} from "../src/lib/secrets";

const PAGE_SIZE = 500;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function main() {
  const write = process.argv.includes("--write");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  getUserSettingsSecret({
    APP_ENV: "script",
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
    USER_SETTINGS_SECRET_KEY: process.env.USER_SETTINGS_SECRET_KEY,
  });

  const env = {
    APP_ENV: "script",
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
    USER_SETTINGS_SECRET_KEY: process.env.USER_SETTINGS_SECRET_KEY,
  };

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let from = 0;
  let scannedRows = 0;
  let candidateRows = 0;
  let updatedRows = 0;
  let updatedFields = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("user_settings")
      .select(["id", "user_id", ...USER_SETTINGS_SECRET_FIELDS].join(", "))
      .order("user_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch user_settings rows: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    scannedRows += data.length;

    for (const row of data) {
      const upgrades = await buildUserSettingsSecretUpgradePayload(row as UserSettingsSecretRecord, env);
      if (Object.keys(upgrades).length === 0) {
        continue;
      }

      candidateRows += 1;
      updatedFields += Object.keys(upgrades).length;

      if (!write) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("user_settings")
        .update({
          ...upgrades,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", row.user_id);

      if (updateError) {
        throw new Error(`Failed to update user_settings for user ${row.user_id}: ${updateError.message}`);
      }

      updatedRows += 1;
    }

    if (data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  console.log(JSON.stringify({
    mode: write ? "write" : "dry-run",
    scannedRows,
    candidateRows,
    updatedRows,
    updatedFields,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
