/*
  Backoffice: Superadmin / branch Manager cabinet.

  - manager_accounts: login + PIN, role, cash network
  - cashiers.network_id + commission_earned
  - SECURITY DEFINER RPCs for stats, agent CRUD, risk settlement
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS network_id uuid;
ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS commission_earned numeric(14, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS manager_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login text NOT NULL UNIQUE,
  pin_hash text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('superadmin', 'manager')),
  network_id uuid,
  network_name text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE manager_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_manager_accounts" ON manager_accounts;
CREATE POLICY "anon_select_manager_accounts" ON manager_accounts FOR SELECT
  TO anon, authenticated USING (false);

CREATE INDEX IF NOT EXISTS cashiers_network_idx ON cashiers (network_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bets' AND policyname = 'anon_update_bets'
  ) THEN
    CREATE POLICY "anon_update_bets" ON bets FOR UPDATE
      TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO manager_accounts (login, pin_hash, full_name, role, network_id, network_name, is_active)
SELECT
  'owner',
  extensions.crypt('0000', extensions.gen_salt('bf')),
  'Владелец NextPari',
  'superadmin',
  NULL,
  'Вся платформа',
  true
WHERE NOT EXISTS (SELECT 1 FROM manager_accounts WHERE login = 'owner');

INSERT INTO manager_accounts (login, pin_hash, full_name, role, network_id, network_name, is_active)
SELECT
  'manager01',
  extensions.crypt('1111', extensions.gen_salt('bf')),
  'Мерет Аннаев',
  'manager',
  '11111111-1111-1111-1111-111111111111',
  'Сеть Ашхабад',
  true
WHERE NOT EXISTS (SELECT 1 FROM manager_accounts WHERE login = 'manager01');

UPDATE cashiers
SET network_id = '11111111-1111-1111-1111-111111111111'
WHERE login = 'agent01' AND network_id IS NULL;

INSERT INTO cashiers (login, pin_hash, full_name, city, point_name, float_balance, is_active, network_id, commission_earned)
SELECT
  'agent02',
  extensions.crypt('1234', extensions.gen_salt('bf')),
  'Гульшат Бердыева',
  'Мары',
  'Точка №3 · базар «Гёкдепе»',
  2800,
  true,
  '22222222-2222-2222-2222-222222222222',
  86.40
WHERE NOT EXISTS (SELECT 1 FROM cashiers WHERE login = 'agent02');

UPDATE cashiers
SET commission_earned = 142.50
WHERE login = 'agent01' AND commission_earned = 0;

CREATE OR REPLACE FUNCTION cashier_ops_add_commission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    UPDATE cashiers
    SET commission_earned = commission_earned + round(NEW.amount * 0.01, 2),
        updated_at = now()
    WHERE id = NEW.cashier_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cashier_operations_commission ON cashier_operations;
CREATE TRIGGER cashier_operations_commission
AFTER INSERT ON cashier_operations
FOR EACH ROW
EXECUTE FUNCTION cashier_ops_add_commission();

CREATE OR REPLACE FUNCTION manager_scope_ok(p_manager manager_accounts, p_network uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_manager.role = 'superadmin'
     OR (p_manager.network_id IS NOT NULL AND p_manager.network_id = p_network);
$$;

CREATE OR REPLACE FUNCTION manager_login(p_login text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  mgr manager_accounts%ROWTYPE;
BEGIN
  IF p_login IS NULL OR btrim(p_login) = '' OR p_pin IS NULL OR p_pin = '' THEN
    RAISE EXCEPTION 'Введите логин и PIN-код';
  END IF;

  SELECT * INTO mgr
  FROM manager_accounts
  WHERE lower(login) = lower(btrim(p_login))
  LIMIT 1;

  IF NOT FOUND OR mgr.pin_hash IS DISTINCT FROM crypt(p_pin, mgr.pin_hash) THEN
    RAISE EXCEPTION 'Неверный логин или PIN-код';
  END IF;

  IF NOT mgr.is_active THEN
    RAISE EXCEPTION 'Учётная запись заблокирована';
  END IF;

  RETURN jsonb_build_object(
    'id', mgr.id,
    'login', mgr.login,
    'full_name', mgr.full_name,
    'role', mgr.role,
    'network_id', mgr.network_id,
    'network_name', mgr.network_name
  );
END;
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
BEGIN
  SELECT * INTO mgr FROM manager_accounts WHERE id = p_manager_id AND is_active LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сессия недействительна';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO turnover FROM bets;

  SELECT coalesce(sum(amount), 0)
       - coalesce(sum(CASE WHEN status IN ('won', 'win') THEN coalesce(potential_win, 0) ELSE 0 END), 0)
  INTO ggr
  FROM bets;

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
        WHERE b.created_at::date = d::date
          AND mgr.role = 'superadmin'
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
    'turnover', CASE WHEN mgr.role = 'superadmin' THEN turnover ELSE deposits + payouts END,
    'ggr', CASE WHEN mgr.role = 'superadmin' THEN ggr ELSE 0 END,
    'deposits', deposits,
    'payouts', payouts,
    'float_total', float_sum,
    'series', series
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
      is_active, network_id, created_at
    FROM cashiers
    WHERE mgr.role = 'superadmin' OR network_id = mgr.network_id
  ) x;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION manager_create_cashier(
  p_manager_id uuid,
  p_login text,
  p_pin text,
  p_full_name text,
  p_city text,
  p_point_name text,
  p_float numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  mgr manager_accounts%ROWTYPE;
  network uuid;
  amount numeric(14, 2);
  new_id uuid;
BEGIN
  SELECT * INTO mgr FROM manager_accounts WHERE id = p_manager_id AND is_active LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сессия недействительна';
  END IF;

  IF btrim(p_login) = '' OR p_pin IS NULL OR length(p_pin) < 4 THEN
    RAISE EXCEPTION 'Укажите логин и PIN не короче 4 цифр';
  END IF;
  IF btrim(p_full_name) = '' OR btrim(p_city) = '' OR btrim(p_point_name) = '' THEN
    RAISE EXCEPTION 'Заполните имя, город и адрес точки';
  END IF;

  amount := round(coalesce(p_float, 0), 2);
  IF amount < 0 THEN
    RAISE EXCEPTION 'Стартовый лимит не может быть отрицательным';
  END IF;

  network := mgr.network_id;
  IF mgr.role = 'superadmin' THEN
    network := coalesce(mgr.network_id, '11111111-1111-1111-1111-111111111111');
  ELSIF network IS NULL THEN
    RAISE EXCEPTION 'У менеджера не задана кассовая сеть';
  END IF;

  INSERT INTO cashiers (login, pin_hash, full_name, city, point_name, float_balance, is_active, network_id)
  VALUES (
    lower(btrim(p_login)),
    crypt(p_pin, gen_salt('bf')),
    btrim(p_full_name),
    btrim(p_city),
    btrim(p_point_name),
    amount,
    true,
    network
  )
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('ok', true, 'id', new_id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Кассир с таким логином уже существует';
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

  RETURN jsonb_build_object('ok', true, 'float_balance', new_float);
END;
$$;

CREATE OR REPLACE FUNCTION manager_set_cashier_frozen(
  p_manager_id uuid,
  p_cashier_id uuid,
  p_frozen boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  mgr manager_accounts%ROWTYPE;
  cashier cashiers%ROWTYPE;
BEGIN
  SELECT * INTO mgr FROM manager_accounts WHERE id = p_manager_id AND is_active LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сессия недействительна';
  END IF;

  SELECT * INTO cashier FROM cashiers WHERE id = p_cashier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Касса не найдена';
  END IF;

  IF mgr.role <> 'superadmin' AND cashier.network_id IS DISTINCT FROM mgr.network_id THEN
    RAISE EXCEPTION 'Эта точка не входит в вашу сеть';
  END IF;

  UPDATE cashiers SET is_active = NOT p_frozen, updated_at = now() WHERE id = cashier.id;

  RETURN jsonb_build_object('ok', true, 'is_active', NOT p_frozen);
END;
$$;

CREATE OR REPLACE FUNCTION manager_list_risk_bets(p_manager_id uuid)
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

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      id,
      match_id,
      selection,
      odds,
      amount,
      potential_win,
      status,
      home_team,
      away_team,
      type,
      ticket_code,
      created_at,
      (amount >= 200 OR coalesce(potential_win, 0) >= 800 OR coalesce(odds, 0) >= 10) AS suspicious
    FROM bets
    WHERE status IS NULL
       OR status IN ('accepted', 'pending', 'in_progress', 'open')
    ORDER BY coalesce(potential_win, amount * coalesce(odds, 1)) DESC, created_at DESC
    LIMIT 80
  ) x;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION manager_settle_bet(
  p_manager_id uuid,
  p_bet_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  mgr manager_accounts%ROWTYPE;
  bet_row bets%ROWTYPE;
  credit numeric(14, 2);
BEGIN
  SELECT * INTO mgr FROM manager_accounts WHERE id = p_manager_id AND is_active LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сессия недействительна';
  END IF;

  SELECT * INTO bet_row FROM bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ставка не найдена';
  END IF;

  IF bet_row.status IN ('won', 'win', 'lost', 'void', 'cancelled') THEN
    RAISE EXCEPTION 'Ставка уже закрыта';
  END IF;

  IF p_action = 'won' THEN
    credit := round(coalesce(bet_row.potential_win, bet_row.amount * coalesce(bet_row.odds, 1)), 2);
    UPDATE bets SET status = 'won' WHERE id = bet_row.id;
    IF bet_row.wallet_id IS NOT NULL THEN
      UPDATE wallets SET balance = balance + credit, updated_at = now() WHERE id = bet_row.wallet_id;
    ELSE
      UPDATE wallets SET balance = balance + credit, updated_at = now()
      WHERE id = (SELECT id FROM wallets ORDER BY created_at ASC NULLS LAST, id ASC LIMIT 1);
    END IF;
    BEGIN
      INSERT INTO transactions (type, title, amount, status, bet_id)
      VALUES ('win', 'Ручной расчёт ставки (бэкофис)', credit, 'completed', bet_row.id);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  ELSIF p_action = 'void' THEN
    credit := round(bet_row.amount, 2);
    UPDATE bets SET status = 'void' WHERE id = bet_row.id;
    IF bet_row.wallet_id IS NOT NULL THEN
      UPDATE wallets SET balance = balance + credit, updated_at = now() WHERE id = bet_row.wallet_id;
    ELSE
      UPDATE wallets SET balance = balance + credit, updated_at = now()
      WHERE id = (SELECT id FROM wallets ORDER BY created_at ASC NULLS LAST, id ASC LIMIT 1);
    END IF;
    BEGIN
      INSERT INTO transactions (type, title, amount, status, bet_id)
      VALUES ('bet_placed', 'Аннулирование ставки (бэкофис)', credit, 'completed', bet_row.id);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  ELSE
    RAISE EXCEPTION 'Неизвестное действие';
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', p_action, 'credited', credit);
END;
$$;

REVOKE ALL ON FUNCTION manager_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION manager_dashboard_stats(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION manager_list_cashiers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION manager_create_cashier(uuid, text, text, text, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION manager_topup_cashier(uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION manager_set_cashier_frozen(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION manager_list_risk_bets(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION manager_settle_bet(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION manager_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manager_dashboard_stats(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manager_list_cashiers(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manager_create_cashier(uuid, text, text, text, text, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manager_topup_cashier(uuid, uuid, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manager_set_cashier_frozen(uuid, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manager_list_risk_bets(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manager_settle_bet(uuid, uuid, text) TO anon, authenticated;
