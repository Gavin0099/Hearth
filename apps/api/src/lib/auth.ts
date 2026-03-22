import { createSupabaseAdminClient } from "./supabase";
import type { WorkerBindings } from "../types";

const BEARER_PREFIX = "Bearer ";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.startsWith(BEARER_PREFIX)) {
    return "";
  }

  return authorization.slice(BEARER_PREFIX.length).trim();
}

export function getTokenIssuer(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4 !== 0) {
      payload += "=";
    }
    const json = atob(payload);
    const parsed = JSON.parse(json) as { iss?: string };
    return parsed.iss ?? null;
  } catch {
    return null;
  }
}

export async function resolveAuthenticatedUser(
  request: Request,
  env: WorkerBindings,
): Promise<AuthenticatedUser | null> {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return null;
  }

  const supabase = createSupabaseAdminClient(env);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
}
