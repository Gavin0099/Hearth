import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUserSettingsSecretUpgradePayload,
  isEncryptedSecretValue,
} from "../src/lib/secrets";
import type { WorkerBindings } from "../src/types";

const env: WorkerBindings = {
  APP_ENV: "test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  USER_SETTINGS_SECRET_KEY: "test-user-settings-secret",
};

test("buildUserSettingsSecretUpgradePayload only encrypts legacy plaintext secret fields", async () => {
  const upgrades = await buildUserSettingsSecretUpgradePayload(
    {
      default_pdf_password: "legacy-default",
      sinopac_pdf_password: null,
      esun_pdf_password: "v1.already.encrypted.value",
      taishin_pdf_password: "legacy-taishin",
    },
    env,
  );

  assert.deepEqual(Object.keys(upgrades).sort(), ["default_pdf_password", "taishin_pdf_password"]);
  assert.equal(isEncryptedSecretValue(upgrades.default_pdf_password), true);
  assert.equal(isEncryptedSecretValue(upgrades.taishin_pdf_password), true);
  assert.equal("esun_pdf_password" in upgrades, false);
});
