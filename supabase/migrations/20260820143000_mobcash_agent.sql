/*
# Mobcash agent terminal (cashiers, player public IDs, cash payouts)

1. Wallets get a 6-digit `public_id` used at the cash desk.
2. `cashiers` hold login + PIN hash and the virtual float balance.
3. `cashier_payout_requests` — player cash-out PINs.
4. `cashier_operations` — shift ledger (deposits / payouts).
5. SECURITY DEFINER RPCs: cashier_login, cashier_deposit_to_player,
   cashier_lookup_payout_code, cashier_payout_by_code, cashier_shift_history,
   player_create_cash_payout, player_list_cash_payouts.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS public_id text;

CREATE UNIQUE INDEX IF NOT EXISTS wallets_public_id_key
  ON wallets (public_id)
  WHERE public_id IS NOT NULL;

CREATE OR REPLACE FUNCTION next_player_public_id()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM wallets WHERE public_id = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

UPDATE wallets
SET public_id = '645912'
WHERE id = (
  SELECT id FROM wallets
  ORDER BY created_at ASC NULLS LAST, id ASC
  LIMIT 1
)
AND public_id IS NULL
AND NOT EXISTS (SELECT 1 FROM wallets WHERE public_id = '645912');

UPDATE wallets
SET public_id = next_player_public_id()
WHERE public_id IS NULL;

CREATE TABLE IF NOT EXISTS cashiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login text NOT NULL UNIQUE,
  pin_hash text NOT NULL,
  full_name text NOT NULL,
  city text NOT NULL DEFAULT '',
  point_name text NOT NULL DEFAULT '',
  float_balance numeric(14, 2) NOT NULL DEFAULT 0 CHECK (float_balance >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cashier_payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  player_public_id text NOT NULL,
  secret_code text NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  cashier_id uuid REFERENCES cashiers(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cashier_payout_pending_code_idx
  ON cashier_payout_requests (secret_code)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS cashier_payout_wallet_idx
  ON cashier_payout_requests (wallet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cashier_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid NOT NULL REFERENCES cashiers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('deposit', 'payout')),
  player_public_id text NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  receipt_code text NOT NULL UNIQUE,
  payout_request_id uuid REFERENCES cashier_payout_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cashier_operations_shift_idx
  ON cashier_operations (cashier_id, created_at DESC);

CREATE SEQUENCE IF NOT EXISTS cashier_receipt_seq START 1;

ALTER TABLE cashiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashier_payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashier_operations ENABLE ROW LEVEL SECURITY;

-- No direct table access: all mutations go through SECURITY DEFINER RPCs.

CREATE OR REPLACE FUNCTION cashier_new_receipt_code()
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 'MC-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('cashier_receipt_seq')::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION cashier_today_start()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT ((now() AT TIME ZONE 'Asia/Ashgabat')::date::timestamp AT TIME ZONE 'Asia/Ashgabat');
$$;

CREATE OR REPLACE FUNCTION cashier_login(p_login text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  cashier cashiers%ROWTYPE;
BEGIN
  IF p_login IS NULL OR btrim(p_login) = '' OR p_pin IS NULL OR p_pin = '' THEN
    RAISE EXCEPTION 'Введите логин и PIN-код';
  END IF;

  SELECT * INTO cashier
  FROM cashiers
  WHERE lower(login) = lower(btrim(p_login))
  LIMIT 1;

  IF NOT FOUND OR cashier.pin_hash IS DISTINCT FROM crypt(p_pin, cashier.pin_hash) THEN
    RAISE EXCEPTION 'Неверный логин или PIN-код';
  END IF;

  IF NOT cashier.is_active THEN
    RAISE EXCEPTION 'Кассир заблокирован';
  END IF;

  RETURN jsonb_build_object(
    'id', cashier.id,
    'login', cashier.login,
    'full_name', cashier.full_name,
    'city', cashier.city,
    'point_name', cashier.point_name,
    'float_balance', cashier.float_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION cashier_get_session(p_cashier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  cashier cashiers%ROWTYPE;
BEGIN
  SELECT * INTO cashier FROM cashiers WHERE id = p_cashier_id AND is_active LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сессия кассира недействительна';
  END IF;

  RETURN jsonb_build_object(
    'id', cashier.id,
    'login', cashier.login,
    'full_name', cashier.full_name,
    'city', cashier.city,
    'point_name', cashier.point_name,
    'float_balance', cashier.float_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION cashier_deposit_to_player(
  p_cashier_id uuid,
  p_player_id text,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  cashier cashiers%ROWTYPE;
  wallet wallets%ROWTYPE;
  player_id text;
  amount numeric(14, 2);
  receipt text;
  new_float numeric(14, 2);
BEGIN
  player_id := btrim(p_player_id);
  IF player_id IS NULL OR player_id !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Введите 6-значный ID игрока';
  END IF;

  amount := round(p_amount, 2);
  IF amount IS NULL OR amount <= 0 THEN
    RAISE EXCEPTION 'Введите сумму пополнения';
  END IF;

  SELECT * INTO cashier FROM cashiers WHERE id = p_cashier_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сессия кассира недействительна';
  END IF;

  SELECT * INTO wallet FROM wallets WHERE public_id = player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Игрок с таким ID не найден';
  END IF;

  IF cashier.float_balance < amount THEN
    RAISE EXCEPTION 'Недостаточно средств в кассе';
  END IF;

  UPDATE cashiers
  SET float_balance = float_balance - amount, updated_at = now()
  WHERE id = cashier.id
  RETURNING float_balance INTO new_float;

  UPDATE wallets
  SET balance = balance + amount, updated_at = now()
  WHERE id = wallet.id;

  receipt := cashier_new_receipt_code();

  INSERT INTO cashier_operations (cashier_id, type, player_public_id, amount, status, receipt_code)
  VALUES (cashier.id, 'deposit', player_id, amount, 'completed', receipt);

  INSERT INTO transactions (type, title, amount, status)
  VALUES ('deposit', 'Пополнение у агента Mobcash · ' || receipt, amount, 'completed');

  RETURN jsonb_build_object(
    'ok', true,
    'type', 'deposit',
    'receipt_code', receipt,
    'player_public_id', player_id,
    'amount', amount,
    'cashier_name', cashier.full_name,
    'city', cashier.city,
    'point_name', cashier.point_name,
    'float_balance', new_float,
    'created_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION cashier_lookup_payout_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  req cashier_payout_requests%ROWTYPE;
  code text;
BEGIN
  code := btrim(p_code);
  IF code IS NULL OR code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Введите 6-значный PIN-код заявки';
  END IF;

  SELECT * INTO req
  FROM cashier_payout_requests
  WHERE secret_code = code
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Код не найден';
  END IF;

  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'Заявка уже закрыта';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', req.id,
    'player_public_id', req.player_public_id,
    'amount', req.amount,
    'status', req.status,
    'created_at', req.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION cashier_payout_by_code(
  p_cashier_id uuid,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  cashier cashiers%ROWTYPE;
  req cashier_payout_requests%ROWTYPE;
  code text;
  receipt text;
  new_float numeric(14, 2);
BEGIN
  code := btrim(p_code);
  IF code IS NULL OR code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Введите 6-значный PIN-код заявки';
  END IF;

  SELECT * INTO cashier FROM cashiers WHERE id = p_cashier_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сессия кассира недействительна';
  END IF;

  SELECT * INTO req
  FROM cashier_payout_requests
  WHERE secret_code = code AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM cashier_payout_requests WHERE secret_code = code) THEN
      RAISE EXCEPTION 'Заявка уже закрыта';
    END IF;
    RAISE EXCEPTION 'Код не найден';
  END IF;

  UPDATE cashier_payout_requests
  SET status = 'paid', cashier_id = cashier.id, paid_at = now()
  WHERE id = req.id;

  UPDATE cashiers
  SET float_balance = float_balance + req.amount, updated_at = now()
  WHERE id = cashier.id
  RETURNING float_balance INTO new_float;

  receipt := cashier_new_receipt_code();

  INSERT INTO cashier_operations (
    cashier_id, type, player_public_id, amount, status, receipt_code, payout_request_id
  )
  VALUES (cashier.id, 'payout', req.player_public_id, req.amount, 'completed', receipt, req.id);

  RETURN jsonb_build_object(
    'ok', true,
    'type', 'payout',
    'receipt_code', receipt,
    'player_public_id', req.player_public_id,
    'amount', req.amount,
    'cashier_name', cashier.full_name,
    'city', cashier.city,
    'point_name', cashier.point_name,
    'float_balance', new_float,
    'created_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION cashier_shift_history(
  p_cashier_id uuid,
  p_type text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cashiers WHERE id = p_cashier_id AND is_active) THEN
    RAISE EXCEPTION 'Сессия кассира недействительна';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      id,
      type,
      player_public_id,
      amount,
      status,
      receipt_code,
      created_at
    FROM cashier_operations
    WHERE cashier_id = p_cashier_id
      AND created_at >= cashier_today_start()
      AND (p_type IS NULL OR p_type = '' OR type = p_type)
      AND (p_status IS NULL OR p_status = '' OR status = p_status)
  ) x;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION player_create_cash_payout(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  wallet wallets%ROWTYPE;
  amount numeric(14, 2);
  code text;
  req_id uuid;
BEGIN
  amount := round(p_amount, 2);
  IF amount IS NULL OR amount <= 0 THEN
    RAISE EXCEPTION 'Введите сумму вывода';
  END IF;

  SELECT * INTO wallet
  FROM wallets
  ORDER BY created_at ASC NULLS LAST, id ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Кошелёк не найден';
  END IF;

  IF wallet.public_id IS NULL THEN
    UPDATE wallets SET public_id = next_player_public_id() WHERE id = wallet.id
    RETURNING * INTO wallet;
  END IF;

  IF wallet.balance < amount THEN
    RAISE EXCEPTION 'Недостаточно средств на балансе';
  END IF;

  LOOP
    code := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM cashier_payout_requests WHERE secret_code = code AND status = 'pending'
    );
  END LOOP;

  UPDATE wallets
  SET balance = balance - amount, updated_at = now()
  WHERE id = wallet.id;

  INSERT INTO cashier_payout_requests (wallet_id, player_public_id, secret_code, amount, status)
  VALUES (wallet.id, wallet.public_id, code, amount, 'pending')
  RETURNING id INTO req_id;

  INSERT INTO transactions (type, title, amount, status)
  VALUES ('withdraw', 'Вывод наличными у агента Mobcash', -amount, 'completed');

  RETURN jsonb_build_object(
    'ok', true,
    'id', req_id,
    'code', code,
    'amount', amount,
    'player_public_id', wallet.public_id,
    'new_balance', wallet.balance - amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION player_list_cash_payouts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  wallet_id uuid;
  result jsonb;
BEGIN
  SELECT id INTO wallet_id
  FROM wallets
  ORDER BY created_at ASC NULLS LAST, id ASC
  LIMIT 1;

  IF wallet_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT id, player_public_id, secret_code, amount, status, paid_at, created_at
    FROM cashier_payout_requests
    WHERE cashier_payout_requests.wallet_id = wallet_id
  ) x;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION next_player_public_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION cashier_new_receipt_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION cashier_today_start() FROM PUBLIC;
REVOKE ALL ON FUNCTION cashier_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cashier_get_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cashier_deposit_to_player(uuid, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION cashier_lookup_payout_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cashier_payout_by_code(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cashier_shift_history(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION player_create_cash_payout(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION player_list_cash_payouts() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION cashier_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cashier_get_session(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cashier_deposit_to_player(uuid, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cashier_lookup_payout_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cashier_payout_by_code(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cashier_shift_history(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION player_create_cash_payout(numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION player_list_cash_payouts() TO anon, authenticated;

INSERT INTO cashiers (login, pin_hash, full_name, city, point_name, float_balance, is_active)
SELECT
  'agent01',
  extensions.crypt('1234', extensions.gen_salt('bf')),
  'Азат Мередов',
  'Ашхабад',
  'Точка №12 · ул. Махтумкули',
  5000,
  true
WHERE NOT EXISTS (SELECT 1 FROM cashiers WHERE login = 'agent01');

INSERT INTO wallets (balance, currency, public_id)
SELECT 350, 'TMTM', '882341'
WHERE NOT EXISTS (SELECT 1 FROM wallets WHERE public_id = '882341');

INSERT INTO cashier_payout_requests (wallet_id, player_public_id, secret_code, amount, status)
SELECT w.id, '882341', '847291', 150, 'pending'
FROM wallets w
WHERE w.public_id = '882341'
  AND NOT EXISTS (
    SELECT 1 FROM cashier_payout_requests WHERE secret_code = '847291' AND status = 'pending'
  );
