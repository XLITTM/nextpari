/*
  Superadmin vertical GGR + cashier audit log (float_after, topup/collection).
*/

ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS commission_rate numeric(6, 2) NOT NULL DEFAULT 1.00;

UPDATE cashiers SET commission_rate = 1.00 WHERE commission_rate IS NULL;

ALTER TABLE cashier_operations ALTER COLUMN player_public_id DROP NOT NULL;
ALTER TABLE cashier_operations ADD COLUMN IF NOT EXISTS float_after numeric(14, 2);

ALTER TABLE cashier_operations DROP CONSTRAINT IF EXISTS cashier_operations_type_check;
ALTER TABLE cashier_operations ADD CONSTRAINT cashier_operations_type_check
  CHECK (type IN ('deposit', 'payout', 'topup', 'collection'));

CREATE OR REPLACE FUNCTION cashier_ops_stamp_float()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.float_after IS NULL THEN
    SELECT float_balance INTO NEW.float_after FROM cashiers WHERE id = NEW.cashier_id;
  END IF;
  IF NEW.player_public_id IS NULL THEN
    NEW.player_public_id := '';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cashier_operations_stamp_float ON cashier_operations;
CREATE TRIGGER cashier_operations_stamp_float
BEFORE INSERT ON cashier_operations
FOR EACH ROW
EXECUTE FUNCTION cashier_ops_stamp_float();

CREATE TABLE IF NOT EXISTS product_wagers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical text NOT NULL CHECK (vertical IN ('sports', 'casino', 'games')),
  stake numeric(14, 2) NOT NULL CHECK (stake > 0),
  payout numeric(14, 2) NOT NULL DEFAULT 0 CHECK (payout >= 0),
  status text NOT NULL DEFAULT 'settled',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_wagers_vertical_idx ON product_wagers (vertical, created_at DESC);

ALTER TABLE product_wagers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_product_wagers" ON product_wagers;
CREATE POLICY "anon_select_product_wagers" ON product_wagers FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_product_wagers" ON product_wagers;
CREATE POLICY "anon_insert_product_wagers" ON product_wagers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

INSERT INTO product_wagers (vertical, stake, payout, status, created_at)
SELECT v.vertical, v.stake, v.payout, 'settled', now() - (v.days || ' days')::interval
FROM (VALUES
  ('casino', 180.00, 142.00, 0),
  ('casino', 95.00, 40.00, 1),
  ('casino', 220.00, 260.00, 2),
  ('casino', 70.00, 18.00, 3),
  ('casino', 150.00, 110.00, 5),
  ('casino', 310.00, 198.00, 8),
  ('games', 60.00, 44.00, 0),
  ('games', 40.00, 0.00, 1),
  ('games', 85.00, 120.00, 2),
  ('games', 55.00, 22.00, 4),
  ('games', 90.00, 61.00, 7),
  ('games', 120.00, 75.00, 11)
) AS v(vertical, stake, payout, days)
WHERE NOT EXISTS (SELECT 1 FROM product_wagers LIMIT 1);

CREATE OR REPLACE FUNCTION vertical_kpi_json(p_turnover numeric, p_payouts numeric)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'turnover', round(coalesce(p_turnover, 0), 2),
    'payouts', round(coalesce(p_payouts, 0), 2),
    'ggr', round(coalesce(p_turnover, 0) - coalesce(p_payouts, 0), 2),
    'margin', CASE
      WHEN coalesce(p_turnover, 0) > 0
        THEN round(((p_turnover - coalesce(p_payouts, 0)) / p_turnover) * 100, 2)
      ELSE 0
    END
  );
$$;

CREATE OR REPLACE FUNCTION manager_dashboard_stats(p_manager_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  mgr manager_accounts%ROWTYPE;
  turnover numeric(14, 2);
  ggr numeric(14, 2);
  deposits numeric(14, 2);
  payouts numeric(14, 2);
  float_sum numeric(14, 2);
  series jsonb;
  sports_turn numeric(14, 2);
  sports_pay numeric(14, 2);
  casino_turn numeric(14, 2);
  casino_pay numeric(14, 2);
  games_turn numeric(14, 2);
  games_pay numeric(14, 2);
BEGIN
  SELECT * INTO mgr FROM manager_accounts WHERE id = p_manager_id AND is_active LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сессия недействительна';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO turnover FROM bets;
  SELECT coalesce(sum(
    CASE WHEN status IN ('won', 'win') THEN coalesce(potential_win, 0)
         WHEN status IN ('void', 'cancelled') THEN amount
         ELSE 0 END
  ), 0) INTO sports_pay FROM bets;
  sports_turn := turnover;
  ggr := sports_turn - sports_pay;

  SELECT coalesce(sum(stake), 0), coalesce(sum(payout), 0)
  INTO casino_turn, casino_pay
  FROM product_wagers WHERE vertical = 'casino';

  SELECT coalesce(sum(stake), 0), coalesce(sum(payout), 0)
  INTO games_turn, games_pay
  FROM product_wagers WHERE vertical = 'games';

  SELECT coalesce(sum(o.amount), 0) INTO deposits
  FROM cashier_operations o
  JOIN cashiers c ON c.id = o.cashier_id
  WHERE o.type = 'deposit' AND o.status = 'completed'
    AND (mgr.role = 'superadmin' OR c.network_id = mgr.network_id);

  SELECT coalesce(sum(o.amount), 0) INTO payouts
  FROM cashier_operations o
  JOIN cashiers c ON c.id = o.cashier_id
  WHERE o.type = 'payout' AND o.status = 'completed'
    AND (mgr.role = 'superadmin' OR c.network_id = mgr.network_id);

  SELECT coalesce(sum(c.float_balance), 0) INTO float_sum
  FROM cashiers c
  WHERE mgr.role = 'superadmin' OR c.network_id = mgr.network_id;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.day), '[]'::jsonb)
  INTO series
  FROM (
    SELECT
      d::date AS day,
      coalesce((
        SELECT sum(b.amount) FROM bets b
        WHERE b.created_at::date = d::date AND mgr.role = 'superadmin'
      ), 0) AS bets,
      coalesce((
        SELECT sum(o.amount) FROM cashier_operations o
        JOIN cashiers c ON c.id = o.cashier_id
        WHERE o.created_at::date = d::date
          AND o.type = 'deposit' AND o.status = 'completed'
          AND (mgr.role = 'superadmin' OR c.network_id = mgr.network_id)
      ), 0) AS deposits
    FROM generate_series((now() AT TIME ZONE 'Asia/Ashgabat')::date - 13, (now() AT TIME ZONE 'Asia/Ashgabat')::date, interval '1 day') AS d
  ) x;

  RETURN jsonb_build_object(
    'role', mgr.role,
    'network_name', mgr.network_name,
    'turnover', CASE WHEN mgr.role = 'superadmin' THEN sports_turn + casino_turn + games_turn ELSE deposits + payouts END,
    'ggr', CASE WHEN mgr.role = 'superadmin'
      THEN (sports_turn - sports_pay) + (casino_turn - casino_pay) + (games_turn - games_pay)
      ELSE 0 END,
    'deposits', deposits,
    'payouts', payouts,
    'float_total', float_sum,
    'series', series,
    'verticals', jsonb_build_object(
      'sports', vertical_kpi_json(sports_turn, sports_pay),
      'casino', vertical_kpi_json(casino_turn, casino_pay),
      'games', vertical_kpi_json(games_turn, games_pay)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION manager_list_cashiers(p_manager_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  mgr manager_accounts%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO mgr FROM manager_accounts WHERE id = p_manager_id AND is_active LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сессия недействительна';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.full_name), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      id, login, full_name, city, point_name, float_balance, commission_earned,
      commission_rate, is_active, network_id, created_at
    FROM cashiers
    WHERE mgr.role = 'superadmin' OR network_id = mgr.network_id
  ) x;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION manager_topup_cashier(
  p_manager_id uuid,
  p_cashier_id uuid,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  mgr manager_accounts%ROWTYPE;
  cashier cashiers%ROWTYPE;
  amount numeric(14, 2);
  new_float numeric(14, 2);
  receipt text;
BEGIN
  SELECT * INTO mgr FROM manager_accounts WHERE id = p_manager_id AND is_active LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сессия недействительна';
  END IF;

  amount := round(p_amount, 2);
  IF amount IS NULL OR amount <= 0 THEN
    RAISE EXCEPTION 'Введите сумму пополнения кассы';
  END IF;

  SELECT * INTO cashier FROM cashiers WHERE id = p_cashier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Касса не найдена';
  END IF;

  IF mgr.role <> 'superadmin' AND cashier.network_id IS DISTINCT FROM mgr.network_id THEN
    RAISE EXCEPTION 'Эта точка не входит в вашу сеть';
  END IF;

  UPDATE cashiers
  SET float_balance = float_balance + amount, updated_at = now()
  WHERE id = cashier.id
  RETURNING float_balance INTO new_float;

  receipt := cashier_new_receipt_code();
  INSERT INTO cashier_operations (
    cashier_id, type, player_public_id, amount, status, receipt_code, float_after
  )
  VALUES (cashier.id, 'topup', 'MANAGER', amount, 'completed', receipt, new_float);

  RETURN jsonb_build_object('ok', true, 'float_balance', new_float, 'receipt_code', receipt);
END;
$$;

CREATE OR REPLACE FUNCTION manager_collect_cashier(
  p_manager_id uuid,
  p_cashier_id uuid,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  mgr manager_accounts%ROWTYPE;
  cashier cashiers%ROWTYPE;
  amount numeric(14, 2);
  new_float numeric(14, 2);
  receipt text;
BEGIN
  SELECT * INTO mgr FROM manager_accounts WHERE id = p_manager_id AND is_active LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сессия недействительна';
  END IF;

  amount := round(p_amount, 2);
  IF amount IS NULL OR amount <= 0 THEN
    RAISE EXCEPTION 'Введите сумму инкассации';
  END IF;

  SELECT * INTO cashier FROM cashiers WHERE id = p_cashier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Касса не найдена';
  END IF;

  IF mgr.role <> 'superadmin' AND cashier.network_id IS DISTINCT FROM mgr.network_id THEN
    RAISE EXCEPTION 'Эта точка не входит в вашу сеть';
  END IF;

  IF cashier.float_balance < amount THEN
    RAISE EXCEPTION 'Недостаточно средств в кассе для инкассации';
  END IF;

  UPDATE cashiers
  SET float_balance = float_balance - amount, updated_at = now()
  WHERE id = cashier.id
  RETURNING float_balance INTO new_float;

  receipt := cashier_new_receipt_code();
  INSERT INTO cashier_operations (
    cashier_id, type, player_public_id, amount, status, receipt_code, float_after
  )
  VALUES (cashier.id, 'collection', 'CASH', amount, 'completed', receipt, new_float);

  RETURN jsonb_build_object('ok', true, 'float_balance', new_float, 'receipt_code', receipt);
END;
$$;

CREATE OR REPLACE FUNCTION manager_cashier_ledger(
  p_manager_id uuid,
  p_cashier_id uuid,
  p_from timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  mgr manager_accounts%ROWTYPE;
  cashier cashiers%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO mgr FROM manager_accounts WHERE id = p_manager_id AND is_active LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сессия недействительна';
  END IF;

  SELECT * INTO cashier FROM cashiers WHERE id = p_cashier_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Касса не найдена';
  END IF;

  IF mgr.role <> 'superadmin' AND cashier.network_id IS DISTINCT FROM mgr.network_id THEN
    RAISE EXCEPTION 'Эта точка не входит в вашу сеть';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      id,
      type,
      player_public_id,
      receipt_code,
      amount,
      CASE WHEN type IN ('deposit', 'collection') THEN -amount ELSE amount END AS signed_amount,
      float_after,
      status,
      created_at
    FROM cashier_operations
    WHERE cashier_id = p_cashier_id
      AND (p_from IS NULL OR created_at >= p_from)
  ) x;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION vertical_kpi_json(numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION manager_collect_cashier(uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION manager_cashier_ledger(uuid, uuid, timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION manager_dashboard_stats(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manager_list_cashiers(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manager_topup_cashier(uuid, uuid, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manager_collect_cashier(uuid, uuid, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manager_cashier_ledger(uuid, uuid, timestamptz) TO anon, authenticated;
