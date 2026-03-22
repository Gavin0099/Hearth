import { apiFetch } from "./api";

export type UserSettings = {
  sinopac_pdf_password: string | null;
  esun_pdf_password: string | null;
  gmail_connected: boolean;
  gmail_last_sync_at: string | null;
};

export async function fetchUserSettings(): Promise<UserSettings> {
  const response = await apiFetch("/api/user-settings");
  const data = await response.json() as { settings: UserSettings; status: string };
  return data.settings;
}

export async function saveUserSettings(settings: Partial<UserSettings>): Promise<void> {
  await apiFetch("/api/user-settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
}
