/*
  Owner backoffice: player CRM (profiles, wallets block flag, game history, adjust/block RPCs).
*/

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS usdt_balance numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid,
  public_id text,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  is_blocked boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_id uuid;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS profiles_public_id_idx ON profiles (public_id);
CREATE INDEX IF NOT EXISTS profiles_wallet_id_idx ON profiles (wallet_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'anon_select_profiles'
  ) THEN
    CREATE POLICY "anon_select_profiles" ON profiles FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'anon_update_profiles'
  ) THEN
    CREATE POLICY "anon_update_profiles" ON profiles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'anon_insert_profiles'
  ) THEN
    CREATE POLICY "anon_insert_profiles" ON profiles FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  INSERT INTO profiles (wallet_id, public_id, phone, email, created_at)
  SELECT w.id, w.public_id, coalesce(pd.phone, ''), coalesce(pd.email, ''), coalesce(w.created_at, now())
  FROM wallets w
  LEFT JOIN LATERAL (
    SELECT phone, email FROM personal_data ORDER BY created_at DESC NULLS LAST LIMIT 1
  ) pd ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.wallet_id = w.id OR p.id = w.id
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS game_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid,
  player_public_id text,
  game text NOT NULL,
  stake numeric(14, 2) NOT NULL CHECK (stake >= 0),
  multiplier numeric(12, 4) NOT NULL DEFAULT 0,
  payout numeric(14, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_history_wallet_idx ON game_history (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS game_history_player_idx ON game_history (player_public_id, created_at DESC);

ALTER TABLE game_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'game_history' AND policyname = 'anon_select_game_history'
  ) THEN
    CREATE POLICY "anon_select_game_history" ON game_history FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'game_history' AND policyname = 'anon_insert_game_history'
  ) THEN
    CREATE POLICY "anon_insert_game_history" ON game_history FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $$;

INSERT INTO game_history (wallet_id, player_public_id, game, stake, multiplier, payout, created_at)
SELECT
  w.id,
  w.public_id,
  v.game,
  v.stake,
  v.multiplier,
  v.payout,
  now() - (v.hours || ' hours')::interval
FROM (
  SELECT id, public_id FROM wallets ORDER BY created_at ASC NULLS LAST, id ASC LIMIT 1
) w
CROSS JOIN (
  VALUES
    ('Apple of Fortune', 20.00, 2.40, 48.00, 3),
    ('Crystal', 15.00, 0.00, 0.00, 8),
    ('Aviator', 25.00, 1.87, 46.75, 14),
    ('Apple of Fortune', 10.00, 0.00, 0.00, 22),
    ('Aviator', 40.00, 3.12, 124.80, 30)
) AS v(game, stake, multiplier, payout, hours)
WHERE NOT EXISTS (SELECT 1 FROM game_history LIMIT 1);

CREATE OR REPLACE FUNCTION resolve_player_wallet(p_player_id text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  wallet uuid;
  as_uuid uuid;
BEGIN
  BEGIN
    as_uuid := p_player_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    as_uuid := NULL;
  END;

  IF as_uuid IS NOT NULL THEN
    SELECT id INTO wallet FROM wallets WHERE id = as_uuid LIMIT 1;
    IF FOUND THEN RETURN wallet; END IF;
    SELECT wallet_id INTO wallet FROM profiles WHERE id = as_uuid LIMIT 1;
    IF wallet IS NOT NULL THEN RETURN wallet; END IF;
  END IF;

  SELECT id INTO wallet FROM wallets WHERE public_id = p_player_id LIMIT 1;
  IF FOUND THEN RETURN wallet; END IF;
  SELECT wallet_id INTO wallet FROM profiles WHERE public_id = p_player_id LIMIT 1;
  RETURN wallet;
END;
$$;

CREATE OR REPLACE FUNCTION manager_set_player_blocked(
  p_manager_id uuid,
  p_player_id text,
  p_blocked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  mgr manager_accounts%ROWTYPE;
  wallet uuid;
BEGIN
  SELECT * INTO mgr FROM manager_accounts WHERE id = p_manager_id AND is_active LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Сессия недействительна'; END IF;
  IF mgr.role <> 'superadmin' THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;

  wallet := resolve_player_wallet(p_player_id);
  IF wallet IS NULL THEN
    RAISE EXCEPTION 'Игрок не найден';
  END IF;

  UPDATE wallets SET is_blocked = p_blocked, updated_at = now() WHERE id = wallet;
  UPDATE profiles SET is_blocked = p_blocked WHERE wallet_id = wallet OR id = wallet;

  RETURN jsonb_build_object('ok', true, 'blocked', p_blocked, 'wallet_id', wallet);
END;
$$;

CREATE OR REPLACE FUNCTION manager_adjust_player_balance(
  p_manager_id uuid,
  p_player_id text,
  p_amount numeric,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  mgr manager_accounts%ROWTYPE;
  wallet uuid;
  next_balance numeric(14, 2);
BEGIN
  SELECT * INTO mgr FROM manager_accounts WHERE id = p_manager_id AND is_active LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Сессия недействительна'; END IF;
  IF mgr.role <> 'superadmin' THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  IF p_amount IS NULL OR p_amount = 0 THEN RAISE EXCEPTION 'Введите сумму корректировки'; END IF;

  wallet := resolve_player_wallet(p_player_id);
  IF wallet IS NULL THEN RAISE EXCEPTION 'Игрок не найден'; END IF;

  UPDATE wallets
  SET balance = round(balance + p_amount, 2), updated_at = now()
  WHERE id = wallet
  RETURNING balance INTO next_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Игрок не найден';
  END IF;

  IF next_balance < 0 THEN
    RAISE EXCEPTION 'Баланс не может быть отрицательным';
  END IF;

  BEGIN
    INSERT INTO transactions (type, title, amount, status)
    VALUES (
      'adjustment',
      coalesce(nullif(trim(p_note), ''), 'Корректировка баланса (бэкофис)'),
      p_amount,
      'completed'
    );
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'balance', next_balance, 'wallet_id', wallet);
END;
$$;

REVOKE ALL ON FUNCTION manager_set_player_blocked(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION manager_adjust_player_balance(uuid, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_player_wallet(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION manager_set_player_blocked(uuid, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manager_adjust_player_balance(uuid, text, numeric, text) TO anon, authenticated;
