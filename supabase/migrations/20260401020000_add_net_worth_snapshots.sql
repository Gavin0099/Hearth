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
