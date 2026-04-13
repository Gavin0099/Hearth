const PRODUCTION_API_BASE_URL = "https://hearth-api.reiko0099.workers.dev";
const LOCAL_API_BASE_URL = "http://127.0.0.1:8787";

function resolveDefaultApiBaseUrl() {
  if (typeof window === "undefined") {
    return LOCAL_API_BASE_URL;
  }

  const { hostname } = window.location;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  return isLocalhost ? LOCAL_API_BASE_URL : PRODUCTION_API_BASE_URL;
}

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? resolveDefaultApiBaseUrl(),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  authRedirectUrl:
    import.meta.env.VITE_AUTH_REDIRECT_URL ??
    "https://hearth-web.pages.dev",
  webRuntime: "Cloudflare Pages",
};
