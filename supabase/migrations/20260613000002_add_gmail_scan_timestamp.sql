-- Add gmail_last_successful_scan_at to user_settings.
-- Distinct from gmail_last_sync_at (cron ran) — only updated after Gmail list fetch succeeds.
-- Cron uses this as the scan window start (minus overlap), falling back to 35 days for first run.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gmail_last_successful_scan_at TIMESTAMPTZ;
