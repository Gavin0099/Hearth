import { apiFetch } from "./api";
import { env } from "../env";

export type UserSettings = {
  has_default_pdf_password: boolean;
  has_sinopac_pdf_password: boolean;
  has_esun_pdf_password: boolean;
  has_taishin_pdf_password: boolean;
  gmail_connected: boolean;
  gmail_last_sync_at: string | null;
};

export type UserSettingsSecrets = {
  default_pdf_password: string | null;
  sinopac_pdf_password: string | null;
  esun_pdf_password: string | null;
  taishin_pdf_password: string | null;
};

export type SaveUserSettingsInput = Partial<UserSettingsSecrets> & {
  clear_default_pdf_password?: boolean;
  clear_sinopac_pdf_password?: boolean;
  clear_esun_pdf_password?: boolean;
  clear_taishin_pdf_password?: boolean;
  gmail_connected?: boolean;
  gmail_last_sync_at?: string | null;
};

const DEFAULT_USER_SETTINGS: UserSettings = {
  has_default_pdf_password: false,
  has_sinopac_pdf_password: false,
  has_esun_pdf_password: false,
  has_taishin_pdf_password: false,
  gmail_connected: false,
  gmail_last_sync_at: null,
};

const DEFAULT_USER_SETTINGS_SECRETS: UserSettingsSecrets = {
  default_pdf_password: null,
  sinopac_pdf_password: null,
  esun_pdf_password: null,
  taishin_pdf_password: null,
};

async function readSettingsError(response: Response): Promise<string> {
  const apiBase = env.apiBaseUrl;
  try {
    const data = await response.json() as { error?: string };
    if (data.error) {
      return `${data.error} (api: ${apiBase})`;
    }
  } catch {
    // Fall through to the generic HTTP error.
  }

  return `user-settings request failed: ${response.status} ${response.statusText} (api: ${apiBase})`;
}

export async function fetchUserSettings(): Promise<UserSettings> {
  const response = await apiFetch("/api/user-settings");
  if (!response.ok) {
    throw new Error(await readSettingsError(response));
  }

  const data = await response.json() as { settings?: UserSettings; status: string };
  return data.settings ?? DEFAULT_USER_SETTINGS;
}

export async function fetchUserSettingsSecrets(): Promise<UserSettingsSecrets> {
  const response = await apiFetch("/api/user-settings/pdf-passwords");
  if (!response.ok) {
    throw new Error(await readSettingsError(response));
  }

  const data = await response.json() as { settings?: UserSettingsSecrets; status: string };
  return data.settings ?? DEFAULT_USER_SETTINGS_SECRETS;
}

export async function saveUserSettings(settings: SaveUserSettingsInput): Promise<void> {
  const response = await apiFetch("/api/user-settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error(await readSettingsError(response));
  }
}
