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
