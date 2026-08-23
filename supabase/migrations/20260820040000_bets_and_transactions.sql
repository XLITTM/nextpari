/*
# Bets extras + transactions ledger (single-tenant, no auth)

1. Extend `bets` with coupon fields used by the app
2. Create `transactions` for wallet movements (`bet_placed`, …)
3. RLS: anon + authenticated SELECT/INSERT
*/

ALTER TABLE bets ADD COLUMN IF NOT EXISTS home_team text;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS away_team text;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS market text;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS type text DEFAULT 'single';
ALTER TABLE bets ADD COLUMN IF NOT EXISTS total_odds numeric;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS events jsonb;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS ticket_code text;

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  bet_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_bets" ON bets;
CREATE POLICY "anon_select_bets" ON bets FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_bets" ON bets;
CREATE POLICY "anon_insert_bets" ON bets FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
CREATE POLICY "anon_select_transactions" ON transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions" ON transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
