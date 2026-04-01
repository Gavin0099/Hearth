-- Bootstrap snapshot for fresh projects.
-- Canonical schema history now lives under supabase/migrations/.

create extension if not exists pgcrypto;

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  name text not null,
  type text not null,
  currency text not null default 'TWD',
  broker text,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts,
  date date not null,
  amount numeric(12, 2) not null,
  currency text not null default 'TWD',
  category text,
  description text,
  source text,
  source_hash text unique,
  created_at timestamptz not null default now()
);

create table if not exists investment_trades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts,
  trade_date date not null,
  ticker text not null,
  name text,
  action text not null,
  shares numeric(14, 6) not null,
  price_per_share numeric(12, 4) not null,
  fee numeric(10, 2) not null default 0,
  tax numeric(10, 2) not null default 0,
  currency text not null default 'TWD',
  source text,
  source_hash text unique,
  created_at timestamptz not null default now()
);

create table if not exists holdings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts,
  ticker text not null,
  name text,
  total_shares numeric(14, 6) not null,
  avg_cost numeric(12, 4) not null,
  currency text not null default 'TWD',
  updated_at timestamptz not null default now(),
  unique (account_id, ticker)
);

create table if not exists price_snapshots (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  snapshot_date date not null,
  close_price numeric(12, 4) not null,
  currency text not null default 'TWD',
  unique (ticker, snapshot_date)
);

create table if not exists fx_rates (
  id uuid primary key default gen_random_uuid(),
  from_currency text not null,
  to_currency text not null default 'TWD',
  rate_date date not null,
  rate numeric(10, 4) not null,
  unique (from_currency, to_currency, rate_date)
);

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

create table if not exists dividends (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts,
  ticker text not null,
  pay_date date not null,
  gross_amount numeric(12, 4),
  tax_withheld numeric(12, 4) not null default 0,
  net_amount numeric(12, 4) not null,
  currency text not null default 'TWD',
  source_hash text unique,
  created_at timestamptz not null default now()
);

create table if not exists recurring_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  account_id uuid not null references accounts,
  name text not null,
  category text,
  amount numeric(12, 2),
  currency text not null default 'TWD',
  cadence text not null default 'monthly',
  anchor_day integer,
  source_kind text not null default 'manual',
  source_section text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users unique,
  default_pdf_password text,
  sinopac_pdf_password text,
  esun_pdf_password text,
  taishin_pdf_password text,
  gmail_connected boolean not null default false,
  gmail_last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_settings
  add column if not exists taishin_pdf_password text;

create table if not exists categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  scope text not null,
  direction text not null,
  normalized_description text not null,
  raw_description text not null,
  category text not null,
  updated_at timestamptz not null default now(),
  unique(user_id, scope, direction, normalized_description)
);

alter table categorization_rules enable row level security;

create policy "Users can manage their own categorization rules"
  on categorization_rules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists bank_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  bank text not null,
  type text not null,
  statement_date date not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, bank, type, statement_date)
);
