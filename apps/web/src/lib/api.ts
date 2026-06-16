import { env } from "../env";
import { getSupabaseBrowserClient } from "./supabase";

type ApiRequestInit = RequestInit & {
  auth?: boolean;
};

const API_FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`API timeout after ${API_FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

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
    firstResponse = await fetchWithTimeout(requestUrl, {
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
    return await fetchWithTimeout(requestUrl, {
      ...init,
      headers: retryHeaders,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Failed to fetch";
    throw new Error(`${reason} (${requestUrl})`);
  }
}
