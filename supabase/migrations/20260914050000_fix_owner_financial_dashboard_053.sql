BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 053
-- FIX OWNER FINANCIAL DASHBOARD AUTHORIZATION
-- Sequence: after 052 (player win-pattern risk signals).
--
-- Repository only. DO NOT APPLY from this change.
--
-- Owner dashboard stats must authenticate as Owner and calculate
-- through a private helper. It must not require a Manager session
-- and must not call public.manager_dashboard_stats().
-- Manager dashboard keeps strict self-binding.
-- Read-only. No Wallet Ledger, treasury, or balance mutations.
-- ============================================================


CREATE OR REPLACE FUNCTION private.dashboard_stats_for_manager_account(p_manager_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
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
    IF p_manager_id IS NULL THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_DISABLED';
    END IF;

    SELECT a.*
    INTO mgr
    FROM public.manager_accounts AS a
    WHERE a.id = p_manager_id
      AND a.is_active
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_DISABLED';
    END IF;

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

COMMENT ON FUNCTION private.dashboard_stats_for_manager_account(uuid) IS
'Read-only dashboard calculation for a legacy manager_accounts row. Not an authorization boundary. Superadmin preserves full-platform metrics.';


CREATE OR REPLACE FUNCTION public.manager_dashboard_stats(p_manager_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.assert_live_manager_self_binding(p_manager_id);
    RETURN private.dashboard_stats_for_manager_account(p_manager_id);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_legacy UUID;
BEGIN
    SELECT o.auth_user_id
    INTO v_uid
    FROM private.get_current_owner_context() AS o;

    SELECT s.legacy_manager_account_id
    INTO v_legacy
    FROM private.staff_accounts AS s
    WHERE s.auth_user_id = v_uid
      AND s.role = 'owner'
    LIMIT 1;

    IF v_legacy IS NULL THEN
        RAISE EXCEPTION 'OWNER_LEGACY_LINK_REQUIRED';
    END IF;

    RETURN private.dashboard_stats_for_manager_account(v_legacy);
END;
$fn$;

COMMENT ON FUNCTION public.owner_dashboard_stats() IS
'Owner JWT dashboard. Uses Owner context and the Owner legacy superadmin manager account. Does not require a Manager session.';


REVOKE ALL ON FUNCTION private.dashboard_stats_for_manager_account(uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.manager_dashboard_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_dashboard_stats(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_dashboard_stats() TO authenticated;

COMMIT;
