/*
# Sports line ingestion: providers_mapping + write policies

1. New Tables
- `providers_mapping` — maps an external provider entity to our match/markets
  - `provider_name` + `provider_entity_id` (unique)
  - `match_id`, `tournament_id`, `market_1x2_id`, `market_totals_id`

2. Constraints
- Unique odds per (market_id, outcome) so the worker can upsert coefficients

3. Security
- Single-tenant no-auth app: allow anon + authenticated SELECT/INSERT/UPDATE
  on tournaments, matches, markets, odds, providers_mapping
*/

CREATE TABLE IF NOT EXISTS providers_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL,
  provider_entity_id text NOT NULL,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  tournament_id uuid REFERENCES tournaments(id) ON DELETE SET NULL,
  market_1x2_id uuid REFERENCES markets(id) ON DELETE SET NULL,
  market_totals_id uuid REFERENCES markets(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (provider_name, provider_entity_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS odds_market_outcome_uidx ON odds (market_id, outcome);

ALTER TABLE providers_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_providers_mapping" ON providers_mapping;
CREATE POLICY "anon_select_providers_mapping" ON providers_mapping FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_providers_mapping" ON providers_mapping;
CREATE POLICY "anon_insert_providers_mapping" ON providers_mapping FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_providers_mapping" ON providers_mapping;
CREATE POLICY "anon_update_providers_mapping" ON providers_mapping FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert_tournaments" ON tournaments;
CREATE POLICY "anon_insert_tournaments" ON tournaments FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_tournaments" ON tournaments;
CREATE POLICY "anon_update_tournaments" ON tournaments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert_matches" ON matches;
CREATE POLICY "anon_insert_matches" ON matches FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_matches" ON matches;
CREATE POLICY "anon_update_matches" ON matches FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert_markets" ON markets;
CREATE POLICY "anon_insert_markets" ON markets FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_markets" ON markets;
CREATE POLICY "anon_update_markets" ON markets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert_odds" ON odds;
CREATE POLICY "anon_insert_odds" ON odds FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_odds" ON odds;
CREATE POLICY "anon_update_odds" ON odds FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
