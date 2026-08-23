/*
# Persist coupon legs: bets.events JSONB + bet_items rows

1. Ensure `bets.events` jsonb exists
2. New table `bet_items` — one row per selected outcome in a coupon
3. RLS: anon + authenticated SELECT/INSERT
*/

ALTER TABLE bets ADD COLUMN IF NOT EXISTS events jsonb;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS home_team text;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS away_team text;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS market text;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS type text DEFAULT 'single';
ALTER TABLE bets ADD COLUMN IF NOT EXISTS total_odds numeric;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS ticket_code text;

CREATE TABLE IF NOT EXISTS bet_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id uuid NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  match_id text,
  home_team text,
  away_team text,
  match_label text,
  market text,
  outcome text NOT NULL,
  odds numeric NOT NULL,
  is_live boolean DEFAULT false,
  live_status text,
  match_status text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bet_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_bet_items" ON bet_items;
CREATE POLICY "anon_select_bet_items" ON bet_items FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_bet_items" ON bet_items;
CREATE POLICY "anon_insert_bet_items" ON bet_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);
