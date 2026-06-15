-- Bootstrap snapshot for fresh projects.
-- Generated from supabase/migrations/*.sql.
-- Canonical schema history lives under supabase/migrations/.
-- migration: 20260401000000_baseline.sql
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

-- migration: 20260401010000_add_job_runs.sql
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

-- migration: 20260401020000_add_net_worth_snapshots.sql
-- Net-worth snapshots: one row per user per day, upserted whenever the
-- portfolio panel loads. Gives us a simple historical chart.

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date  date        NOT NULL,
  total_twd      bigint      NOT NULL,
  cash_bank_twd  bigint      NOT NULL,
  investments_twd bigint     NOT NULL,
  created_at     timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS net_worth_snapshots_user_date
  ON net_worth_snapshots (user_id, snapshot_date);

ALTER TABLE net_worth_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY net_worth_snapshots_owner
  ON net_worth_snapshots
  USING (user_id = auth.uid());

-- migration: 20260402000000_add_rls_user_tables.sql
-- Enable RLS on all user-owned tables.
-- The API uses the service-role admin client which bypasses RLS,
-- so these policies are defence-in-depth for any direct anon/authenticated client calls.

-- accounts -----------------------------------------------------------------
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_owner
  ON accounts
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- recurring_templates -------------------------------------------------------
ALTER TABLE recurring_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_templates_owner
  ON recurring_templates
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- user_settings -------------------------------------------------------------
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_owner
  ON user_settings
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- bank_snapshots ------------------------------------------------------------
ALTER TABLE bank_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_snapshots_owner
  ON bank_snapshots
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- transactions (owned via account) -----------------------------------------
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_owner
  ON transactions
  USING (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = transactions.account_id
        AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = transactions.account_id
        AND a.user_id = auth.uid()
    )
  );

-- investment_trades (owned via account) ------------------------------------
ALTER TABLE investment_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY investment_trades_owner
  ON investment_trades
  USING (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = investment_trades.account_id
        AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = investment_trades.account_id
        AND a.user_id = auth.uid()
    )
  );

-- holdings (owned via account) ----------------------------------------------
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY holdings_owner
  ON holdings
  USING (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = holdings.account_id
        AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = holdings.account_id
        AND a.user_id = auth.uid()
    )
  );

-- dividends (owned via account) ---------------------------------------------
ALTER TABLE dividends ENABLE ROW LEVEL SECURITY;

CREATE POLICY dividends_owner
  ON dividends
  USING (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = dividends.account_id
        AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = dividends.account_id
        AND a.user_id = auth.uid()
    )
  );

-- migration: 20260507000000_add_gmail_server_sync.sql
-- Add gmail_refresh_token to user_settings for server-side Gmail cron
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT;

-- Create gmail_sync_queue for server-detected pending bill emails
CREATE TABLE IF NOT EXISTS gmail_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank TEXT NOT NULL,
  email_id TEXT NOT NULL,
  email_subject TEXT NOT NULL,
  email_date TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  attachment_filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE(user_id, email_id, attachment_id)
);

ALTER TABLE gmail_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY gmail_sync_queue_owner
  ON gmail_sync_queue
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- migration: 20260613000000_add_auto_import.sql
-- bank_account_mapping: 銀行 → 帳戶對應表（自動匯入的安全邊界）
CREATE TABLE IF NOT EXISTS bank_account_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_key TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'credit_card', -- credit_card | bank_account
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, bank_key, source_type)
);

ALTER TABLE bank_account_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_account_mapping_owner
  ON bank_account_mapping
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- import_jobs: 每個 Gmail PDF 附件的自動匯入工作單
CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  email_subject TEXT NOT NULL,
  email_date TEXT NOT NULL,
  filename TEXT NOT NULL,
  bank_key TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'credit_card', -- credit_card | bank_account
  mapped_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending_parse',
  -- pending_parse | parsed | imported | failed | needs_review
  error_code TEXT,
  error_message TEXT,
  imported_count INT,
  skipped_count INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, gmail_message_id, attachment_id)
);

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_jobs_owner
  ON import_jobs
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- migration: 20260613000001_add_import_jobs_review_reason.sql
-- Add review_reason to import_jobs to distinguish missing_mapping vs parse_error.
-- This prevents parse_error jobs from being auto-upgraded back to pending_parse.
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS review_reason TEXT;

-- migration: 20260613000002_add_gmail_scan_timestamp.sql
-- Add gmail_last_successful_scan_at to user_settings.
-- Distinct from gmail_last_sync_at (cron ran) — only updated after Gmail list fetch succeeds.
-- Cron uses this as the scan window start (minus overlap), falling back to 35 days for first run.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gmail_last_successful_scan_at TIMESTAMPTZ;
