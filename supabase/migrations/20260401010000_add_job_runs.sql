create table if not exists job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  run_started_at timestamptz not null,
  run_finished_at timestamptz not null,
  status text not null,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_runs_job_name_run_finished_at
  on job_runs (job_name, run_finished_at desc);
