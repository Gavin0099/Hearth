import { env } from "../env";
import { getSupabaseBrowserClient } from "./supabase";

type ApiRequestInit = RequestInit & {
  auth?: boolean;
};

export async function apiFetch(path: string, init: ApiRequestInit = {}) {
  const headers = new Headers(init.headers);
  const shouldAttachAuth = init.auth !== false;
  const client = shouldAttachAuth ? getSupabaseBrowserClient() : null;

  if (shouldAttachAuth && client) {
    const session = await client.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (accessToken) {
      headers.set("authorization", `Bearer ${accessToken}`);
    }
  }

  const requestUrl = `${env.apiBaseUrl}${path}`;
  let firstResponse: Response;
  try {
    firstResponse = await fetch(requestUrl, {
      ...init,
      headers,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Failed to fetch";
    throw new Error(`${reason} (${requestUrl})`);
  }

  if (!shouldAttachAuth || firstResponse.status !== 401 || !client) {
    return firstResponse;
  }

  const refreshed = await client.auth.refreshSession();
  const refreshedToken = refreshed.data.session?.access_token;
  if (!refreshedToken) {
    return firstResponse;
  }

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("authorization", `Bearer ${refreshedToken}`);

  try {
    return await fetch(requestUrl, {
      ...init,
      headers: retryHeaders,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Failed to fetch";
    throw new Error(`${reason} (${requestUrl})`);
  }
}
