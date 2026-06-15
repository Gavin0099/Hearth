export type WorkerBindings = {
  APP_ENV: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  USER_SETTINGS_SECRET_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OPS_ADMIN_EMAILS?: string;
  OPS_ADMIN_USER_IDS?: string;
};

export type ApiEnv = {
  Bindings: WorkerBindings;
  Variables: {
    resolveAuthenticatedUser: (
      request: Request,
      env: WorkerBindings,
    ) => Promise<{ id: string; email: string | null } | null>;
    createSupabaseAdminClient: (
      env: WorkerBindings,
    ) => {
      from: (table: string) => any;
    };
  };
};
