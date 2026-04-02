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
