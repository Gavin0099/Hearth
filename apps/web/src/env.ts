const defaultApiBaseUrl =
  typeof window !== "undefined" &&
  (window.location.hostname.endsWith(".pages.dev") || window.location.hostname === "hearth-web.pages.dev")
    ? "https://hearth-api.reiko0099.workers.dev"
    : "http://127.0.0.1:8787";

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  webRuntime: "Cloudflare Pages",
};
