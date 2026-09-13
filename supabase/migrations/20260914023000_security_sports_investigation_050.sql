BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 050
-- SECURITY SPORTS BET INVESTIGATION FOUNDATION
-- Sequence: after 049 (player security restrictions).
--
-- Repository only. DO NOT APPLY from this change.
--
-- Read-only sports investigation over canonical private.sports_bets
-- and private.sports_bet_legs. Does not duplicate bet history.
-- Does not place/edit/cancel/settle bets, change odds/stake/payout,
-- mutate Wallet Ledger, or auto-restrict from behavioral indicators.
-- Does not invent closing-price / CLV / BetB2B market data.
-- ============================================================


CREATE OR REPLACE FUNCTION private.get_current_security_context()
RETURNS TABLE (
    auth_user_id UUID,
    role TEXT,
    status TEXT,
    display_name TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_row RECORD;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    SELECT
        s.auth_user_id,
        s.role,
        s.status,
        s.display_name
    INTO v_row
    FROM private.staff_accounts AS s
    WHERE s.auth_user_id = v_uid
    LIMIT 1;

    IF v_row.auth_user_id IS NULL THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_NOT_FOUND';
    END IF;
    IF v_row.role IS DISTINCT FROM 'security' THEN
        RAISE EXCEPTION 'SECURITY_REQUIRED';
    END IF;
    IF v_row.status = 'blocked' THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_BLOCKED';
    END IF;
    IF v_row.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_DISABLED';
    END IF;

    auth_user_id := v_row.auth_user_id;
    role := v_row.role;
    status := v_row.status;
    display_name := v_row.display_name;
    RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION private.get_current_security_context() IS
'JWT gate for a future dedicated security staff role. This PR does not provision Security employees or a /security cabinet. Owner sports investigation uses get_current_owner_context instead.';


CREATE OR REPLACE FUNCTION private.security_sports_display_ref(p_id UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT 'S-' || upper(substr(replace(p_id::text, '-', ''), 1, 8));
$fn$;


CREATE OR REPLACE FUNCTION private.security_sports_status_bucket(
    p_status TEXT,
    p_settlement_state TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT CASE
        WHEN p_status = 'cancelled' OR p_settlement_state = 'cancelled' THEN 'cancelled'
        WHEN p_settlement_state = 'refund' THEN 'void'
        WHEN p_status = 'settled' OR p_settlement_state IN ('winner', 'loser', 'half_won', 'half_lost') THEN 'settled'
        ELSE 'open'
    END;
$fn$;


CREATE OR REPLACE FUNCTION private.security_sports_leg_json(p_leg private.sports_bet_legs)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
    SELECT jsonb_build_object(
        'fixture_label', COALESCE(NULLIF(BTRIM(p_leg.fixture_label), ''), 'Fixture ' || p_leg.fixture_id::text),
        'league', NULLIF(BTRIM(p_leg.league), ''),
        'fixture_id', p_leg.fixture_id,
        'market_key', p_leg.market_key,
        'market_id', NULLIF(BTRIM(p_leg.market_id), ''),
        'line', NULLIF(BTRIM(p_leg.line), ''),
        'outcome_name', COALESCE(NULLIF(BTRIM(p_leg.outcome_name), ''), p_leg.outcome_id),
        'outcome_id', p_leg.outcome_id,
        'accepted_odds', p_leg.accepted_odds,
        'market_status', p_leg.market_status,
        'leg_status', COALESCE(p_leg.bet_status, p_leg.bet_status_id),
        'provider_last_update', p_leg.provider_last_update,
        'feed_type', p_leg.feed_type,
        'provider', p_leg.provider,
        'settlement_result', CASE
            WHEN p_leg.settlement_code = 2 THEN 'winner'
            WHEN p_leg.settlement_code = 1 THEN 'loser'
            WHEN p_leg.settlement_code = 3 THEN 'refund'
            WHEN p_leg.settlement_code = 5 THEN 'half_won'
            WHEN p_leg.settlement_code = 4 THEN 'half_lost'
            WHEN p_leg.settlement_code = -1 THEN 'cancelled'
            ELSE COALESCE(p_leg.bet_status, 'unsettled')
        END
    );
$fn$;


CREATE OR REPLACE FUNCTION private.security_sports_bet_json(p_bet private.sports_bets)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_legs jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(private.security_sports_leg_json(l.*) ORDER BY l.accepted_at, l.id), '[]'::jsonb)
    INTO v_legs
    FROM private.sports_bet_legs AS l
    WHERE l.bet_id = p_bet.id;

    RETURN jsonb_build_object(
        'bet_id', p_bet.id,
        'display_ref', private.security_sports_display_ref(p_bet.id),
        'accepted_at', p_bet.accepted_at,
        'feed_type', p_bet.feed_type,
        'mode', p_bet.mode,
        'stake', p_bet.stake,
        'accepted_odds', p_bet.accepted_odds,
        'potential_payout', p_bet.potential_payout,
        'currency', p_bet.currency,
        'status', p_bet.status,
        'status_bucket', private.security_sports_status_bucket(p_bet.status, p_bet.settlement_state),
        'settlement_state', p_bet.settlement_state,
        'settled_at', p_bet.settled_at,
        'provider', p_bet.provider,
        'legs', v_legs
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.security_list_player_sports_bets(
    p_player_user_id UUID,
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_feed_type TEXT,
    p_mode TEXT,
    p_status TEXT,
    p_league TEXT,
    p_fixture TEXT,
    p_market TEXT,
    p_min_stake NUMERIC,
    p_min_odds NUMERIC,
    p_limit INTEGER,
    p_offset INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_from TIMESTAMPTZ;
    v_to TIMESTAMPTZ;
    v_feed TEXT;
    v_mode TEXT;
    v_status TEXT;
    v_league TEXT;
    v_fixture TEXT;
    v_market TEXT;
    v_limit INTEGER;
    v_offset INTEGER;
    v_rows jsonb;
    v_total INTEGER;
BEGIN
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    v_to := COALESCE(p_to, pg_catalog.now());
    v_from := COALESCE(p_from, v_to - INTERVAL '30 days');
    IF v_from >= v_to THEN
        RAISE EXCEPTION 'PERIOD_INVALID';
    END IF;
    IF v_to - v_from > INTERVAL '180 days' THEN
        RAISE EXCEPTION 'PERIOD_TOO_LONG';
    END IF;

    v_feed := NULLIF(lower(BTRIM(COALESCE(p_feed_type, ''))), '');
    IF v_feed IN ('live', 'inplay') THEN
        v_feed := 'inplay';
    ELSIF v_feed IN ('prematch', 'pre-match', 'line') THEN
        v_feed := 'prematch';
    ELSIF v_feed IS NOT NULL THEN
        RAISE EXCEPTION 'FEED_TYPE_INVALID';
    END IF;

    v_mode := NULLIF(lower(BTRIM(COALESCE(p_mode, ''))), '');
    IF v_mode IS NOT NULL AND v_mode NOT IN ('single', 'express') THEN
        RAISE EXCEPTION 'SPORTS_MODE_INVALID';
    END IF;

    v_status := NULLIF(lower(BTRIM(COALESCE(p_status, ''))), '');
    IF v_status IS NOT NULL AND v_status NOT IN ('open', 'settled', 'void', 'cancelled') THEN
        RAISE EXCEPTION 'SPORTS_STATUS_INVALID';
    END IF;

    v_league := NULLIF(BTRIM(COALESCE(p_league, '')), '');
    v_fixture := NULLIF(BTRIM(COALESCE(p_fixture, '')), '');
    v_market := NULLIF(BTRIM(COALESCE(p_market, '')), '');
    v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
    v_offset := GREATEST(0, COALESCE(p_offset, 0));

    SELECT COUNT(*)::INTEGER
    INTO v_total
    FROM private.sports_bets AS b
    WHERE b.player_user_id = p_player_user_id
      AND b.accepted_at >= v_from
      AND b.accepted_at <= v_to
      AND (v_feed IS NULL OR b.feed_type = v_feed)
      AND (v_mode IS NULL OR b.mode = v_mode)
      AND (v_status IS NULL OR private.security_sports_status_bucket(b.status, b.settlement_state) = v_status)
      AND (p_min_stake IS NULL OR b.stake >= p_min_stake)
      AND (p_min_odds IS NULL OR b.accepted_odds >= p_min_odds)
      AND (
          v_league IS NULL
          OR EXISTS (
              SELECT 1 FROM private.sports_bet_legs AS l
              WHERE l.bet_id = b.id AND l.league ILIKE '%' || v_league || '%'
          )
      )
      AND (
          v_fixture IS NULL
          OR EXISTS (
              SELECT 1 FROM private.sports_bet_legs AS l
              WHERE l.bet_id = b.id
                AND (
                    l.fixture_label ILIKE '%' || v_fixture || '%'
                    OR l.fixture_id::text = v_fixture
                )
          )
      )
      AND (
          v_market IS NULL
          OR EXISTS (
              SELECT 1 FROM private.sports_bet_legs AS l
              WHERE l.bet_id = b.id
                AND (
                    l.market_key ILIKE '%' || v_market || '%'
                    OR l.market_id ILIKE '%' || v_market || '%'
                )
          )
      );

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.accepted_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT private.security_sports_bet_json(b.*) AS obj, b.accepted_at
        FROM private.sports_bets AS b
        WHERE b.player_user_id = p_player_user_id
          AND b.accepted_at >= v_from
          AND b.accepted_at <= v_to
          AND (v_feed IS NULL OR b.feed_type = v_feed)
          AND (v_mode IS NULL OR b.mode = v_mode)
          AND (v_status IS NULL OR private.security_sports_status_bucket(b.status, b.settlement_state) = v_status)
          AND (p_min_stake IS NULL OR b.stake >= p_min_stake)
          AND (p_min_odds IS NULL OR b.accepted_odds >= p_min_odds)
          AND (
              v_league IS NULL
              OR EXISTS (
                  SELECT 1 FROM private.sports_bet_legs AS l
                  WHERE l.bet_id = b.id AND l.league ILIKE '%' || v_league || '%'
              )
          )
          AND (
              v_fixture IS NULL
              OR EXISTS (
                  SELECT 1 FROM private.sports_bet_legs AS l
                  WHERE l.bet_id = b.id
                    AND (
                        l.fixture_label ILIKE '%' || v_fixture || '%'
                        OR l.fixture_id::text = v_fixture
                    )
              )
          )
          AND (
              v_market IS NULL
              OR EXISTS (
                  SELECT 1 FROM private.sports_bet_legs AS l
                  WHERE l.bet_id = b.id
                    AND (
                        l.market_key ILIKE '%' || v_market || '%'
                        OR l.market_id ILIKE '%' || v_market || '%'
                    )
              )
          )
        ORDER BY b.accepted_at DESC
        LIMIT v_limit
        OFFSET v_offset
    ) AS item;

    RETURN jsonb_build_object(
        'ok', true,
        'player_public_id', private.player_security_public_id(p_player_user_id),
        'from', v_from,
        'to', v_to,
        'total', v_total,
        'limit', v_limit,
        'offset', v_offset,
        'rows', v_rows
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.security_player_sports_summary(p_player_user_id UUID, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_from TIMESTAMPTZ;
    v_to TIMESTAMPTZ;
    v_count INTEGER := 0;
    v_stake NUMERIC := 0;
    v_settled_count INTEGER := 0;
    v_settled_stake NUMERIC := 0;
    v_settled_payout NUMERIC := 0;
    v_avg_stake NUMERIC;
    v_avg_odds NUMERIC;
    v_single INTEGER := 0;
    v_express INTEGER := 0;
    v_live INTEGER := 0;
    v_prematch INTEGER := 0;
    v_leagues jsonb;
    v_markets jsonb;
    v_recent jsonb;
    v_repeat jsonb;
    v_rapid INTEGER := 0;
    v_linked jsonb;
    v_shared_fixtures INTEGER := 0;
    v_timeline jsonb;
    v_ggr NUMERIC;
BEGIN
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    v_to := COALESCE(p_to, pg_catalog.now());
    v_from := COALESCE(p_from, v_to - INTERVAL '30 days');
    IF v_from >= v_to THEN
        RAISE EXCEPTION 'PERIOD_INVALID';
    END IF;
    IF v_to - v_from > INTERVAL '180 days' THEN
        RAISE EXCEPTION 'PERIOD_TOO_LONG';
    END IF;

    SELECT
        COUNT(*)::INTEGER,
        COALESCE(SUM(b.stake), 0),
        COUNT(*) FILTER (WHERE private.security_sports_status_bucket(b.status, b.settlement_state) = 'settled')::INTEGER,
        COALESCE(SUM(b.stake) FILTER (WHERE private.security_sports_status_bucket(b.status, b.settlement_state) = 'settled'), 0),
        COALESCE(SUM(b.last_payout_amount) FILTER (WHERE private.security_sports_status_bucket(b.status, b.settlement_state) = 'settled'), 0),
        AVG(b.stake),
        AVG(b.accepted_odds),
        COUNT(*) FILTER (WHERE b.mode = 'single')::INTEGER,
        COUNT(*) FILTER (WHERE b.mode = 'express')::INTEGER,
        COUNT(*) FILTER (WHERE b.feed_type = 'inplay')::INTEGER,
        COUNT(*) FILTER (WHERE b.feed_type = 'prematch')::INTEGER
    INTO
        v_count, v_stake, v_settled_count, v_settled_stake, v_settled_payout,
        v_avg_stake, v_avg_odds, v_single, v_express, v_live, v_prematch
    FROM private.sports_bets AS b
    WHERE b.player_user_id = p_player_user_id
      AND b.accepted_at >= v_from
      AND b.accepted_at <= v_to;

    IF v_settled_count > 0 THEN
        v_ggr := v_settled_stake - v_settled_payout;
    ELSE
        v_ggr := NULL;
    END IF;

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.n DESC), '[]'::jsonb)
    INTO v_leagues
    FROM (
        SELECT jsonb_build_object('label', COALESCE(NULLIF(BTRIM(l.league), ''), '—'), 'count', COUNT(*)::INTEGER) AS obj, COUNT(*)::INTEGER AS n
        FROM private.sports_bet_legs AS l
        INNER JOIN private.sports_bets AS b ON b.id = l.bet_id
        WHERE b.player_user_id = p_player_user_id
          AND b.accepted_at >= v_from
          AND b.accepted_at <= v_to
        GROUP BY COALESCE(NULLIF(BTRIM(l.league), ''), '—')
        ORDER BY COUNT(*) DESC
        LIMIT 8
    ) AS item;

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.n DESC), '[]'::jsonb)
    INTO v_markets
    FROM (
        SELECT jsonb_build_object('label', l.market_key, 'count', COUNT(*)::INTEGER) AS obj, COUNT(*)::INTEGER AS n
        FROM private.sports_bet_legs AS l
        INNER JOIN private.sports_bets AS b ON b.id = l.bet_id
        WHERE b.player_user_id = p_player_user_id
          AND b.accepted_at >= v_from
          AND b.accepted_at <= v_to
        GROUP BY l.market_key
        ORDER BY COUNT(*) DESC
        LIMIT 8
    ) AS item;

    SELECT COALESCE(jsonb_agg(private.security_sports_bet_json(b.*) ORDER BY b.accepted_at DESC), '[]'::jsonb)
    INTO v_recent
    FROM (
        SELECT *
        FROM private.sports_bets AS b
        WHERE b.player_user_id = p_player_user_id
          AND b.accepted_at >= v_from
          AND b.accepted_at <= v_to
        ORDER BY b.accepted_at DESC
        LIMIT 8
    ) AS b;

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.n DESC), '[]'::jsonb)
    INTO v_repeat
    FROM (
        SELECT jsonb_build_object(
            'fixture_id', l.fixture_id,
            'fixture_label', COALESCE(NULLIF(BTRIM(l.fixture_label), ''), 'Fixture ' || l.fixture_id::text),
            'count', COUNT(*)::INTEGER
        ) AS obj,
        COUNT(*)::INTEGER AS n
        FROM private.sports_bet_legs AS l
        INNER JOIN private.sports_bets AS b ON b.id = l.bet_id
        WHERE b.player_user_id = p_player_user_id
          AND b.accepted_at >= v_from
          AND b.accepted_at <= v_to
        GROUP BY l.fixture_id, l.fixture_label
        HAVING COUNT(*) >= 2
        ORDER BY COUNT(*) DESC
        LIMIT 8
    ) AS item;

    SELECT COUNT(*)::INTEGER
    INTO v_rapid
    FROM (
        SELECT b.accepted_at - LAG(b.accepted_at) OVER (ORDER BY b.accepted_at) AS gap
        FROM private.sports_bets AS b
        WHERE b.player_user_id = p_player_user_id
          AND b.accepted_at >= v_from
          AND b.accepted_at <= v_to
    ) AS s
    WHERE s.gap IS NOT NULL AND s.gap <= INTERVAL '2 minutes';

    SELECT COALESCE(jsonb_agg(DISTINCT pid), '[]'::jsonb)
    INTO v_linked
    FROM (
        SELECT jsonb_array_elements_text(COALESCE(f.details -> 'related_public_ids', '[]'::jsonb)) AS pid
        FROM private.player_risk_flags AS f
        WHERE f.player_user_id = p_player_user_id
          AND f.flag_type IN ('SHARED_DEVICE', 'SHARED_NETWORK')
          AND f.status IN ('open', 'reviewed')
    ) AS linked
    WHERE NULLIF(BTRIM(linked.pid), '') IS NOT NULL
      AND linked.pid IS DISTINCT FROM private.player_security_public_id(p_player_user_id);

    SELECT COUNT(DISTINCT l.fixture_id)::INTEGER
    INTO v_shared_fixtures
    FROM private.sports_bet_legs AS l
    INNER JOIN private.sports_bets AS b ON b.id = l.bet_id
    WHERE b.player_user_id = p_player_user_id
      AND b.accepted_at >= v_from
      AND b.accepted_at <= v_to
      AND l.fixture_id IN (
          SELECT l2.fixture_id
          FROM private.sports_bet_legs AS l2
          INNER JOIN private.sports_bets AS b2 ON b2.id = l2.bet_id
          INNER JOIN public.profiles AS p ON p.id = b2.player_user_id
          WHERE p.public_id IN (
              SELECT jsonb_array_elements_text(COALESCE(v_linked, '[]'::jsonb))
          )
            AND b2.player_user_id IS DISTINCT FROM p_player_user_id
      );

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.at DESC), '[]'::jsonb)
    INTO v_timeline
    FROM (
        SELECT jsonb_build_object(
            'kind', 'restriction',
            'at', e.created_at,
            'event_type', e.event_type,
            'reason', e.reason,
            'actor_staff_role', e.actor_staff_role
        ) AS obj,
        e.created_at AS at
        FROM private.player_security_restriction_events AS e
        WHERE e.player_user_id = p_player_user_id
        UNION ALL
        SELECT jsonb_build_object(
            'kind', 'flag',
            'at', f.last_seen_at,
            'event_type', f.flag_type,
            'status', f.status,
            'related_player_count', f.related_player_count
        ) AS obj,
        f.last_seen_at AS at
        FROM private.player_risk_flags AS f
        WHERE f.player_user_id = p_player_user_id
        ORDER BY at DESC
        LIMIT 20
    ) AS item;

    RETURN jsonb_build_object(
        'ok', true,
        'player_public_id', private.player_security_public_id(p_player_user_id),
        'from', v_from,
        'to', v_to,
        'bets_count', v_count,
        'total_stake', v_stake,
        'settled_payout', CASE WHEN v_settled_count > 0 THEN v_settled_payout ELSE NULL END,
        'sports_ggr', v_ggr,
        'average_stake', v_avg_stake,
        'average_accepted_odds', v_avg_odds,
        'single_count', v_single,
        'express_count', v_express,
        'live_count', v_live,
        'prematch_count', v_prematch,
        'most_used_leagues', v_leagues,
        'most_used_markets', v_markets,
        'recent_bets', v_recent,
        'indicators', jsonb_build_object(
            'repeated_fixtures', v_repeat,
            'rapid_sequence_count', v_rapid,
            'linked_account_public_ids', COALESCE(v_linked, '[]'::jsonb),
            'linked_shared_fixtures', v_shared_fixtures,
            'automatic_restriction', false,
            'closing_price_available', false
        ),
        'security_activity', v_timeline
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_player_sports_bets(
    p_player_id TEXT,
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL,
    p_feed_type TEXT DEFAULT NULL,
    p_mode TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_league TEXT DEFAULT NULL,
    p_fixture TEXT DEFAULT NULL,
    p_market TEXT DEFAULT NULL,
    p_min_stake NUMERIC DEFAULT NULL,
    p_min_odds NUMERIC DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_owner_context();
    RETURN private.security_list_player_sports_bets(
        private.player_security_user_id_from_public_id(p_player_id),
        p_from, p_to, p_feed_type, p_mode, p_status, p_league, p_fixture, p_market,
        p_min_stake, p_min_odds, p_limit, p_offset
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_player_sports_bet(p_player_id TEXT, p_bet_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_bet private.sports_bets%ROWTYPE;
BEGIN
    PERFORM private.get_current_owner_context();
    v_uid := private.player_security_user_id_from_public_id(p_player_id);
    SELECT * INTO v_bet FROM private.sports_bets WHERE id = p_bet_id AND player_user_id = v_uid;
    IF v_bet.id IS NULL THEN
        RAISE EXCEPTION 'SPORTS_BET_NOT_FOUND';
    END IF;
    RETURN jsonb_build_object('ok', true, 'player_public_id', private.player_security_public_id(v_uid))
        || private.security_sports_bet_json(v_bet);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_player_sports_summary(
    p_player_id TEXT,
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_owner_context();
    RETURN private.security_player_sports_summary(
        private.player_security_user_id_from_public_id(p_player_id),
        p_from,
        p_to
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_player_sports_bets(
    p_player_id TEXT,
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL,
    p_feed_type TEXT DEFAULT NULL,
    p_mode TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_league TEXT DEFAULT NULL,
    p_fixture TEXT DEFAULT NULL,
    p_market TEXT DEFAULT NULL,
    p_min_stake NUMERIC DEFAULT NULL,
    p_min_odds NUMERIC DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_security_context();
    RETURN private.security_list_player_sports_bets(
        private.player_security_user_id_from_public_id(p_player_id),
        p_from, p_to, p_feed_type, p_mode, p_status, p_league, p_fixture, p_market,
        p_min_stake, p_min_odds, p_limit, p_offset
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_player_sports_bet(p_player_id TEXT, p_bet_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_bet private.sports_bets%ROWTYPE;
BEGIN
    PERFORM private.get_current_security_context();
    v_uid := private.player_security_user_id_from_public_id(p_player_id);
    SELECT * INTO v_bet FROM private.sports_bets WHERE id = p_bet_id AND player_user_id = v_uid;
    IF v_bet.id IS NULL THEN
        RAISE EXCEPTION 'SPORTS_BET_NOT_FOUND';
    END IF;
    RETURN jsonb_build_object('ok', true, 'player_public_id', private.player_security_public_id(v_uid))
        || private.security_sports_bet_json(v_bet);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_player_sports_summary(
    p_player_id TEXT,
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_security_context();
    RETURN private.security_player_sports_summary(
        private.player_security_user_id_from_public_id(p_player_id),
        p_from,
        p_to
    );
END;
$fn$;

COMMENT ON FUNCTION public.owner_player_sports_bets(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, INTEGER) IS
'Owner JWT read-only sports bet history for Security investigation. No Wallet Ledger ids, idempotency keys, or fingerprints.';

COMMENT ON FUNCTION public.security_player_sports_bets(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, INTEGER) IS
'Future Security-role JWT read-only sports history. Same private reader as Owner. Manager/cashier/player denied via get_current_security_context.';

COMMENT ON FUNCTION public.owner_player_sports_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) IS
'Owner JWT sports behavior summary from canonical settled data only. Indicators are investigation-ready and never auto-restrict.';


REVOKE ALL ON FUNCTION private.get_current_security_context() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.security_sports_display_ref(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.security_sports_status_bucket(TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.security_sports_leg_json(private.sports_bet_legs) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.security_sports_bet_json(private.sports_bets) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.security_list_player_sports_bets(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.security_player_sports_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.owner_player_sports_bets(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_player_sports_bets(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_player_sports_bet(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_player_sports_bet(TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_player_sports_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_player_sports_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.security_player_sports_bets(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_player_sports_bets(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.security_player_sports_bet(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_player_sports_bet(TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.security_player_sports_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_player_sports_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

COMMIT;
