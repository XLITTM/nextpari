BEGIN;

-- ============================================================
-- NEXTPARI PHASE 040
-- STAFF RPC + LEGACY PUBLIC BET TABLE HARDENING
-- Sequence: after 039 (20260912193119_player_login_aliases_039).
--
-- NOT APPLIED BY THIS CHANGE. Repository-only.
--
-- 1. Live manager RPCs keep signatures and authenticated EXECUTE.
--    Authority is private.get_current_manager_context() (auth.uid())
--    plus exact equality of legacy_manager_account_id and p_manager_id.
--    anon EXECUTE is revoked. PUBLIC is not granted.
-- 2. Confirmed unused login/session/risk/block RPCs lose EXECUTE
--    for PUBLIC, anon, and authenticated. Functions are not dropped.
-- 3. Legacy public.bets / public.bet_items lose permissive policies
--    and direct anon/authenticated table privileges.
--    Canonical private sports tables are not modified.
--
-- No wallet balance changes. No sports bet row changes.
-- No table drops. No destructive data deletion.
-- ============================================================


-- ============================================================
-- 1. Live manager self-binding gate
-- ============================================================

CREATE OR REPLACE FUNCTION private.assert_live_manager_self_binding(p_manager_id uuid)
RETURNS public.manager_accounts
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_mgr public.manager_accounts%ROWTYPE;
BEGIN
    SELECT
        m.auth_user_id,
        m.role,
        m.status,
        m.legacy_manager_account_id,
        m.network_id
    INTO v_ctx
    FROM private.get_current_manager_context() AS m;

    IF p_manager_id IS NULL
       OR v_ctx.legacy_manager_account_id IS DISTINCT FROM p_manager_id THEN
        RAISE EXCEPTION 'NETWORK_SCOPE_VIOLATION';
    END IF;

    SELECT a.*
    INTO v_mgr
    FROM public.manager_accounts AS a
    WHERE a.id = v_ctx.legacy_manager_account_id
      AND a.is_active
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_DISABLED';
    END IF;

    RETURN v_mgr;
END;
$fn$;

REVOKE ALL ON FUNCTION private.assert_live_manager_self_binding(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.assert_live_manager_self_binding(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assert_live_manager_self_binding(uuid) TO service_role;

COMMENT ON FUNCTION private.assert_live_manager_self_binding(uuid) IS
'Requires an active manager JWT via private.get_current_manager_context(). p_manager_id must equal the bound legacy_manager_account_id. Does not trust a browser-supplied manager UUID.';


-- ============================================================
-- 2. Live manager RPCs (signatures unchanged)
-- ============================================================

CREATE OR REPLACE FUNCTION public.manager_dashboard_stats(p_manager_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    mgr public.manager_accounts%ROWTYPE;
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
    mgr := private.assert_live_manager_self_binding(p_manager_id);

    SELECT coalesce(sum(b.amount), 0) INTO turnover FROM public.bets AS b;
    SELECT coalesce(sum(
        CASE WHEN b.status IN ('won', 'win') THEN coalesce(b.potential_win, 0)
             WHEN b.status IN ('void', 'cancelled') THEN b.amount
             ELSE 0 END
    ), 0) INTO sports_pay FROM public.bets AS b;
    sports_turn := turnover;
    ggr := sports_turn - sports_pay;

    SELECT coalesce(sum(w.stake), 0), coalesce(sum(w.payout), 0)
    INTO casino_turn, casino_pay
    FROM public.product_wagers AS w
    WHERE w.vertical = 'casino';

    SELECT coalesce(sum(w.stake), 0), coalesce(sum(w.payout), 0)
    INTO games_turn, games_pay
    FROM public.product_wagers AS w
    WHERE w.vertical = 'games';

    SELECT coalesce(sum(o.amount), 0) INTO deposits
    FROM public.cashier_operations AS o
    JOIN public.cashiers AS c ON c.id = o.cashier_id
    WHERE o.type = 'deposit' AND o.status = 'completed'
      AND (mgr.role = 'superadmin' OR c.network_id = mgr.network_id);

    SELECT coalesce(sum(o.amount), 0) INTO payouts
    FROM public.cashier_operations AS o
    JOIN public.cashiers AS c ON c.id = o.cashier_id
    WHERE o.type = 'payout' AND o.status = 'completed'
      AND (mgr.role = 'superadmin' OR c.network_id = mgr.network_id);

    SELECT coalesce(sum(c.float_balance), 0) INTO float_sum
    FROM public.cashiers AS c
    WHERE mgr.role = 'superadmin' OR c.network_id = mgr.network_id;

    SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.day), '[]'::jsonb)
    INTO series
    FROM (
        SELECT
            d::date AS day,
            coalesce((
                SELECT sum(b.amount) FROM public.bets AS b
                WHERE b.created_at::date = d::date AND mgr.role = 'superadmin'
            ), 0) AS bets,
            coalesce((
                SELECT sum(o.amount) FROM public.cashier_operations AS o
                JOIN public.cashiers AS c ON c.id = o.cashier_id
                WHERE o.created_at::date = d::date
                  AND o.type = 'deposit' AND o.status = 'completed'
                  AND (mgr.role = 'superadmin' OR c.network_id = mgr.network_id)
            ), 0) AS deposits
        FROM generate_series(
            (now() AT TIME ZONE 'Asia/Ashgabat')::date - 13,
            (now() AT TIME ZONE 'Asia/Ashgabat')::date,
            interval '1 day'
        ) AS d
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
            'sports', public.vertical_kpi_json(sports_turn, sports_pay),
            'casino', public.vertical_kpi_json(casino_turn, casino_pay),
            'games', public.vertical_kpi_json(games_turn, games_pay)
        )
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.manager_list_cashiers(p_manager_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    mgr public.manager_accounts%ROWTYPE;
    result jsonb;
BEGIN
    mgr := private.assert_live_manager_self_binding(p_manager_id);

    SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.full_name), '[]'::jsonb)
    INTO result
    FROM (
        SELECT
            c.id, c.login, c.full_name, c.city, c.point_name, c.float_balance, c.commission_earned,
            c.commission_rate, c.is_active, c.network_id, c.created_at
        FROM public.cashiers AS c
        WHERE mgr.role = 'superadmin' OR c.network_id = mgr.network_id
    ) x;

    RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.manager_cashier_ledger(
    p_manager_id uuid,
    p_cashier_id uuid,
    p_from timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    mgr public.manager_accounts%ROWTYPE;
    cashier public.cashiers%ROWTYPE;
    result jsonb;
BEGIN
    mgr := private.assert_live_manager_self_binding(p_manager_id);

    SELECT c.* INTO cashier FROM public.cashiers AS c WHERE c.id = p_cashier_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;

    IF mgr.role <> 'superadmin' AND cashier.network_id IS DISTINCT FROM mgr.network_id THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;

    SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO result
    FROM (
        SELECT
            o.id,
            o.type,
            o.player_public_id,
            o.receipt_code,
            o.amount,
            CASE WHEN o.type IN ('deposit', 'collection') THEN -o.amount ELSE o.amount END AS signed_amount,
            o.float_after,
            o.status,
            o.created_at
        FROM public.cashier_operations AS o
        WHERE o.cashier_id = p_cashier_id
          AND (p_from IS NULL OR o.created_at >= p_from)
    ) x;

    RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.manager_set_cashier_frozen(
    p_manager_id uuid,
    p_cashier_id uuid,
    p_frozen boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    mgr public.manager_accounts%ROWTYPE;
    cashier public.cashiers%ROWTYPE;
BEGIN
    mgr := private.assert_live_manager_self_binding(p_manager_id);

    SELECT c.* INTO cashier FROM public.cashiers AS c WHERE c.id = p_cashier_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;

    IF mgr.role <> 'superadmin' AND cashier.network_id IS DISTINCT FROM mgr.network_id THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;

    UPDATE public.cashiers
    SET is_active = NOT p_frozen, updated_at = now()
    WHERE id = cashier.id;

    RETURN jsonb_build_object('ok', true, 'is_active', NOT p_frozen);
END;
$fn$;

REVOKE ALL ON FUNCTION public.manager_dashboard_stats(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_dashboard_stats(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.manager_list_cashiers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_list_cashiers(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.manager_cashier_ledger(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_cashier_ledger(uuid, uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.manager_set_cashier_frozen(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_set_cashier_frozen(uuid, uuid, boolean) FROM anon;

GRANT EXECUTE ON FUNCTION public.manager_dashboard_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_list_cashiers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_cashier_ledger(uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_set_cashier_frozen(uuid, uuid, boolean) TO authenticated;


-- ============================================================
-- 3. Unused legacy login / session / risk / block RPCs
--    Revoke browser roles. Do not drop.
-- ============================================================

REVOKE ALL ON FUNCTION public.cashier_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashier_login(text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.cashier_get_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashier_get_session(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.cashier_shift_history(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashier_shift_history(uuid, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.manager_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_login(text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.manager_list_risk_bets(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_list_risk_bets(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.manager_set_player_blocked(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_set_player_blocked(uuid, text, boolean) FROM anon, authenticated;


-- ============================================================
-- 4. Legacy public.bets / public.bet_items
--    Canonical sports placement/settlement is private.sports_*.
-- ============================================================

DROP POLICY IF EXISTS "Allow public insert bets" ON public.bets;
DROP POLICY IF EXISTS "Allow public read bets" ON public.bets;
DROP POLICY IF EXISTS "Allow public update bets" ON public.bets;
DROP POLICY IF EXISTS "anon_update_bets" ON public.bets;
DROP POLICY IF EXISTS "anon_select_bets" ON public.bets;
DROP POLICY IF EXISTS "anon_insert_bets" ON public.bets;

DROP POLICY IF EXISTS "Allow public insert bet_items" ON public.bet_items;
DROP POLICY IF EXISTS "Allow public read bet_items" ON public.bet_items;
DROP POLICY IF EXISTS "Allow public update bet_items" ON public.bet_items;
DROP POLICY IF EXISTS "anon_insert_bet_items" ON public.bet_items;
DROP POLICY IF EXISTS "anon_select_bet_items" ON public.bet_items;
DROP POLICY IF EXISTS "anon_update_bet_items" ON public.bet_items;

REVOKE ALL ON TABLE public.bets FROM PUBLIC;
REVOKE ALL ON TABLE public.bets FROM anon, authenticated;
REVOKE ALL ON TABLE public.bet_items FROM PUBLIC;
REVOKE ALL ON TABLE public.bet_items FROM anon, authenticated;

COMMIT;
