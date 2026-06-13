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
