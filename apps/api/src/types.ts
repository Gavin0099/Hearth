export type WorkerBindings = {
  APP_ENV: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
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
      from: (table: string) => {
        select: (columns: string) => unknown;
        insert: (values: Record<string, unknown>) => unknown;
      };
    };
  };
};
