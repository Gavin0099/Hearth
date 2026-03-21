import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./supabase";

export async function signInWithGoogle() {
  const client = getSupabaseBrowserClient();
  if (!client) {
    throw new Error("Supabase client is not configured.");
  }

  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
    },
  });

  if (error) {
    throw error;
  }
}

export async function signOut() {
  const client = getSupabaseBrowserClient();
  if (!client) {
    throw new Error("Supabase client is not configured.");
  }

  const { error } = await client.auth.signOut();
  if (error) {
    throw error;
  }
}

export async function getCurrentSession(): Promise<Session | null> {
  const client = getSupabaseBrowserClient();
  if (!client) {
    return null;
  }

  const { data } = await client.auth.getSession();
  return data.session;
}
