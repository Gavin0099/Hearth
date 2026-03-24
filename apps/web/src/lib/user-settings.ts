import { apiFetch } from "./api";

export type UserSettings = {
  default_pdf_password: string | null;
  sinopac_pdf_password: string | null;
  esun_pdf_password: string | null;
  gmail_connected: boolean;
  gmail_last_sync_at: string | null;
};

const DEFAULT_USER_SETTINGS: UserSettings = {
  default_pdf_password: null,
  sinopac_pdf_password: null,
  esun_pdf_password: null,
  gmail_connected: false,
  gmail_last_sync_at: null,
};

export async function fetchUserSettings(): Promise<UserSettings> {
  try {
    const response = await apiFetch("/api/user-settings");
    const data = await response.json() as { settings?: UserSettings; status: string };
    return data.settings ?? DEFAULT_USER_SETTINGS;
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export async function saveUserSettings(settings: Partial<UserSettings>): Promise<void> {
  await apiFetch("/api/user-settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
}
