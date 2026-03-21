export type WorkerBindings = {
  APP_ENV: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export type ApiEnv = {
  Bindings: WorkerBindings;
};
