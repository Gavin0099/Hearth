import { env } from "../env";
import { getSupabaseBrowserClient } from "./supabase";

type ApiRequestInit = RequestInit & {
  auth?: boolean;
};

export async function apiFetch(path: string, init: ApiRequestInit = {}) {
  const headers = new Headers(init.headers);

  if (init.auth !== false) {
    const client = getSupabaseBrowserClient();
    const session = client ? await client.auth.getSession() : { data: { session: null } };
    const accessToken = session.data.session?.access_token;
    if (accessToken) {
      headers.set("authorization", `Bearer ${accessToken}`);
    }
  }

  return fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    headers,
  });
}
