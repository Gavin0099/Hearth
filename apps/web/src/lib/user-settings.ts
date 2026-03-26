import { apiFetch } from "./api";

export type UserSettings = {
  default_pdf_password: string | null;
  sinopac_pdf_password: string | null;
  esun_pdf_password: string | null;
  taishin_pdf_password: string | null;
  gmail_connected: boolean;
  gmail_last_sync_at: string | null;
};

const DEFAULT_USER_SETTINGS: UserSettings = {
  default_pdf_password: null,
  sinopac_pdf_password: null,
  esun_pdf_password: null,
  taishin_pdf_password: null,
  gmail_connected: false,
  gmail_last_sync_at: null,
};

async function readSettingsError(response: Response): Promise<string> {
  try {
    const data = await response.json() as { error?: string };
    if (data.error) {
      return data.error;
    }
  } catch {
    // Fall through to the generic HTTP error.
  }

  return `user-settings request failed: ${response.status} ${response.statusText}`;
}

export async function fetchUserSettings(): Promise<UserSettings> {
  const response = await apiFetch("/api/user-settings");
  if (!response.ok) {
    throw new Error(await readSettingsError(response));
  }

  const data = await response.json() as { settings?: UserSettings; status: string };
  return data.settings ?? DEFAULT_USER_SETTINGS;
}

export async function saveUserSettings(settings: Partial<UserSettings>): Promise<void> {
  const response = await apiFetch("/api/user-settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error(await readSettingsError(response));
  }
}
