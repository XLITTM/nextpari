/*
# Wallets + LIVE matches catalog (single-tenant, no auth)

1. New Tables
- `wallets` — user balance shown in the header pill
  - `id` (uuid, primary key)
  - `balance` (numeric, TMTM)
  - `currency` (text, default 'TMTM')
  - `created_at` / `updated_at` (timestamptz)
- `tournaments` — championships for matches
  - `id`, `name`, `country`, `sport`
- `matches` — live / line events
  - teams, score, live flags, `tournament_id`
- `markets` — betting markets per match (e.g. 1X2)
- `odds` — coefficients per market outcome

2. Security
- Enable RLS on all tables.
- Allow anon + authenticated SELECT (and wallets update) because the app is single-tenant with no sign-in.
*/

CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  balance numeric(12, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TMTM',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text NOT NULL DEFAULT '',
  sport text NOT NULL DEFAULT 'football',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES tournaments(id) ON DELETE SET NULL,
  team1 text NOT NULL,
  team2 text NOT NULL,
  team1_color text,
  team2_color text,
  start_time timestamptz NOT NULL DEFAULT now(),
  is_live boolean NOT NULL DEFAULT false,
  live_status text,
  score_team1 integer NOT NULL DEFAULT 0,
  score_team2 integer NOT NULL DEFAULT 0,
  extra_markets integer NOT NULL DEFAULT 0,
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '1X2',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS odds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  outcome text NOT NULL,
  value numeric(8, 2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE odds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_wallets" ON wallets;
CREATE POLICY "anon_select_wallets" ON wallets FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_update_wallets" ON wallets;
CREATE POLICY "anon_update_wallets" ON wallets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_insert_wallets" ON wallets;
CREATE POLICY "anon_insert_wallets" ON wallets FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_tournaments" ON tournaments;
CREATE POLICY "anon_select_tournaments" ON tournaments FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_matches" ON matches;
CREATE POLICY "anon_select_matches" ON matches FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_markets" ON markets;
CREATE POLICY "anon_select_markets" ON markets FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_odds" ON odds;
CREATE POLICY "anon_select_odds" ON odds FOR SELECT TO anon, authenticated USING (true);

INSERT INTO wallets (balance, currency)
SELECT 9.64, 'TMTM'
WHERE NOT EXISTS (SELECT 1 FROM wallets);

INSERT INTO tournaments (id, name, country, sport) VALUES
  ('11111111-1111-1111-1111-111111111111', 'АПЛ', 'Англия', 'football'),
  ('22222222-2222-2222-2222-222222222222', 'NBA', 'США', 'basketball'),
  ('33333333-3333-3333-3333-333333333333', 'ATP 1000', 'Мадрид', 'tennis'),
  ('44444444-4444-4444-4444-444444444444', 'КХЛ', 'Россия', 'hockey')
ON CONFLICT (id) DO NOTHING;

INSERT INTO matches (
  id, tournament_id, team1, team2, team1_color, team2_color,
  start_time, is_live, live_status, score_team1, score_team2, extra_markets, featured
) VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '11111111-1111-1111-1111-111111111111',
    'Манчестер Сити', 'Арсенал', '#6CABDD', '#EF0107',
    now() - interval '45 minutes', true, '1-й тайм, прошло 24:01', 2, 1, 184, true
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    '22222222-2222-2222-2222-222222222222',
    'Лейкерс', 'Бостон', '#552583', '#007A33',
    now() - interval '60 minutes', true, '3-я четверть, 04:32', 78, 82, 142, false
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    '33333333-3333-3333-3333-333333333333',
    'Алькарас', 'Синнер', '#E5A00D', '#EF4444',
    now() - interval '30 minutes', true, '2-й сет, 4:3', 1, 1, 56, false
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    '44444444-4444-4444-4444-444444444444',
    'ЦСКА', 'СКА', '#1D4ED8', '#111827',
    now() - interval '20 minutes', true, '2-й период, 12:18', 2, 2, 98, false
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO markets (id, match_id, name) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '1X2'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Победитель матча'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Победитель матча'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '1X2'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Тотал'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Тотал')
ON CONFLICT (id) DO NOTHING;

INSERT INTO odds (id, market_id, outcome, value) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddd01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '1', 1.45),
  ('dddddddd-dddd-dddd-dddd-dddddddddd02', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'X', 4.20),
  ('dddddddd-dddd-dddd-dddd-dddddddddd03', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '2', 5.50),
  ('dddddddd-dddd-dddd-dddd-dddddddddd04', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '1', 2.10),
  ('dddddddd-dddd-dddd-dddd-dddddddddd05', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '2', 1.75),
  ('dddddddd-dddd-dddd-dddd-dddddddddd06', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '1', 1.85),
  ('dddddddd-dddd-dddd-dddd-dddddddddd07', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '2', 1.95),
  ('dddddddd-dddd-dddd-dddd-dddddddddd08', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', '1', 2.40),
  ('dddddddd-dddd-dddd-dddd-dddddddddd09', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', 'X', 3.30),
  ('dddddddd-dddd-dddd-dddd-dddddddddd10', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', '2', 2.90),
  ('dddddddd-dddd-dddd-dddd-dddddddddd11', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'ТБ 2.5', 1.72),
  ('dddddddd-dddd-dddd-dddd-dddddddddd12', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'ТМ 2.5', 2.10),
  ('dddddddd-dddd-dddd-dddd-dddddddddd13', 'cccccccc-cccc-cccc-cccc-ccccccccccc2', 'ТБ 215.5', 1.90),
  ('dddddddd-dddd-dddd-dddd-dddddddddd14', 'cccccccc-cccc-cccc-cccc-ccccccccccc2', 'ТМ 215.5', 1.90)
ON CONFLICT (id) DO NOTHING;
