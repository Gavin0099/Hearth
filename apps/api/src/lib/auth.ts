import { createSupabaseUserClient } from "./supabase";
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

export async function resolveAuthenticatedUser(
  request: Request,
  env: WorkerBindings,
): Promise<AuthenticatedUser | null> {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return null;
  }

  const supabase = createSupabaseUserClient(env);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
}
