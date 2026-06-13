-- Add review_reason to import_jobs to distinguish missing_mapping vs parse_error.
-- This prevents parse_error jobs from being auto-upgraded back to pending_parse.
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS review_reason TEXT;
