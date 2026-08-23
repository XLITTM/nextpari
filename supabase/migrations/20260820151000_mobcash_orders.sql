/*
  Player cash-out orders for Mobcash cashiers.

  mobcash_orders: pending withdraw PIN that the player shows at the desk.
  RPCs write here and keep cashier_payout_requests in sync for the agent terminal.
*/

CREATE TABLE IF NOT EXISTS mobcash_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES wallets(id) ON DELETE CASCADE,
  player_public_id text,
  type text NOT NULL DEFAULT 'withdraw' CHECK (type IN ('withdraw', 'deposit')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  cash_code text NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  cashier_id uuid REFERENCES cashiers(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mobcash_orders_pending_code_idx
  ON mobcash_orders (cash_code)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS mobcash_orders_wallet_idx
  ON mobcash_orders (wallet_id, created_at DESC);

ALTER TABLE mobcash_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_mobcash_orders" ON mobcash_orders;
CREATE POLICY "anon_select_mobcash_orders" ON mobcash_orders FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_mobcash_orders" ON mobcash_orders;
CREATE POLICY "anon_insert_mobcash_orders" ON mobcash_orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_mobcash_orders" ON mobcash_orders;
CREATE POLICY "anon_update_mobcash_orders" ON mobcash_orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION next_mobcash_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM mobcash_orders WHERE cash_code = candidate AND status = 'pending'
    )
    AND NOT EXISTS (
      SELECT 1 FROM cashier_payout_requests WHERE secret_code = candidate AND status = 'pending'
    );
  END LOOP;
  RETURN candidate;
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
  order_id uuid;
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

  code := next_mobcash_code();

  UPDATE wallets
  SET balance = balance - amount, updated_at = now()
  WHERE id = wallet.id;

  INSERT INTO mobcash_orders (wallet_id, player_public_id, type, status, cash_code, amount)
  VALUES (wallet.id, wallet.public_id, 'withdraw', 'pending', code, amount)
  RETURNING id INTO order_id;

  INSERT INTO cashier_payout_requests (wallet_id, player_public_id, secret_code, amount, status)
  VALUES (wallet.id, wallet.public_id, code, amount, 'pending')
  RETURNING id INTO req_id;

  BEGIN
    INSERT INTO transactions (type, title, amount, status)
    VALUES ('withdraw', 'Вывод наличными у агента Mobcash', -amount, 'completed');
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'id', order_id,
    'code', code,
    'cash_code', code,
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
    SELECT
      id,
      player_public_id,
      cash_code AS secret_code,
      cash_code,
      amount,
      status,
      paid_at,
      created_at
    FROM mobcash_orders
    WHERE mobcash_orders.wallet_id = wallet_id
      AND type = 'withdraw'
  ) x;

  IF result IS NULL OR result = '[]'::jsonb THEN
    SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO result
    FROM (
      SELECT id, player_public_id, secret_code, amount, status, paid_at, created_at
      FROM cashier_payout_requests
      WHERE cashier_payout_requests.wallet_id = wallet_id
    ) x;
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION cashier_lookup_payout_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  ord mobcash_orders%ROWTYPE;
  req cashier_payout_requests%ROWTYPE;
  code text;
BEGIN
  code := btrim(p_code);
  IF code IS NULL OR code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Введите 6-значный PIN-код заявки';
  END IF;

  SELECT * INTO ord
  FROM mobcash_orders
  WHERE cash_code = code AND type = 'withdraw'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF ord.status <> 'pending' THEN
      RAISE EXCEPTION 'Заявка уже закрыта';
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'id', ord.id,
      'player_public_id', ord.player_public_id,
      'amount', ord.amount,
      'status', ord.status,
      'created_at', ord.created_at
    );
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
  ord mobcash_orders%ROWTYPE;
  req cashier_payout_requests%ROWTYPE;
  code text;
  receipt text;
  new_float numeric(14, 2);
  player_id text;
  pay_amount numeric(14, 2);
  order_id uuid;
BEGIN
  code := btrim(p_code);
  IF code IS NULL OR code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Введите 6-значный PIN-код заявки';
  END IF;

  SELECT * INTO cashier FROM cashiers WHERE id = p_cashier_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сессия кассира недействительна';
  END IF;

  SELECT * INTO ord
  FROM mobcash_orders
  WHERE cash_code = code AND type = 'withdraw' AND status = 'pending'
  FOR UPDATE;

  IF FOUND THEN
    UPDATE mobcash_orders
    SET status = 'paid', cashier_id = cashier.id, paid_at = now()
    WHERE id = ord.id;
    player_id := ord.player_public_id;
    pay_amount := ord.amount;
    order_id := ord.id;
  ELSE
    SELECT * INTO req
    FROM cashier_payout_requests
    WHERE secret_code = code AND status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN
      IF EXISTS (
        SELECT 1 FROM mobcash_orders WHERE cash_code = code
        UNION ALL
        SELECT 1 FROM cashier_payout_requests WHERE secret_code = code
      ) THEN
        RAISE EXCEPTION 'Заявка уже закрыта';
      END IF;
      RAISE EXCEPTION 'Код не найден';
    END IF;

    player_id := req.player_public_id;
    pay_amount := req.amount;
    order_id := req.id;
  END IF;

  UPDATE cashier_payout_requests
  SET status = 'paid', cashier_id = cashier.id, paid_at = now()
  WHERE secret_code = code AND status = 'pending';

  UPDATE cashiers
  SET float_balance = float_balance + pay_amount, updated_at = now()
  WHERE id = cashier.id
  RETURNING float_balance INTO new_float;

  receipt := cashier_new_receipt_code();

  INSERT INTO cashier_operations (
    cashier_id, type, player_public_id, amount, status, receipt_code, payout_request_id
  )
  VALUES (
    cashier.id,
    'payout',
    player_id,
    pay_amount,
    'completed',
    receipt,
    (SELECT id FROM cashier_payout_requests WHERE secret_code = code ORDER BY created_at DESC LIMIT 1)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'type', 'payout',
    'receipt_code', receipt,
    'player_public_id', player_id,
    'amount', pay_amount,
    'cashier_name', cashier.full_name,
    'city', cashier.city,
    'point_name', cashier.point_name,
    'float_balance', new_float,
    'order_id', order_id,
    'created_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION next_mobcash_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION player_create_cash_payout(numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION player_list_cash_payouts() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cashier_lookup_payout_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cashier_payout_by_code(uuid, text) TO anon, authenticated;
