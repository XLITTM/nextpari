BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 052
-- PLAYER WIN-PATTERN RISK SIGNALS (INVESTIGATION ONLY)
-- Sequence: after 051 (security staff portal).
--
-- Repository only. DO NOT APPLY from this change.
--
-- Adds HIGH_WIN_FREQUENCY / HIGH_NET_PROFIT / HIGH_ROI flags on the
-- canonical private.player_risk_flags table. Sports and owned-games
-- are evaluated separately. Never auto-restricts, blocks, debits,
-- freezes, cancels bets, or mutates Wallet Ledger.
-- ============================================================


ALTER TABLE private.player_risk_flags
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT '';

ALTER TABLE private.player_risk_flags
    DROP CONSTRAINT IF EXISTS player_risk_flag_type_check;

ALTER TABLE private.player_risk_flags
    ADD CONSTRAINT player_risk_flag_type_check
    CHECK (flag_type IN (
        'SHARED_DEVICE',
        'SHARED_NETWORK',
        'LOGIN_FAILURE_BURST',
        'AUTH_RATE_LIMITED',
        'HIGH_WIN_FREQUENCY',
        'HIGH_NET_PROFIT',
        'HIGH_ROI'
    ));

ALTER TABLE private.player_risk_flags
    DROP CONSTRAINT IF EXISTS player_risk_flag_source_check;

ALTER TABLE private.player_risk_flags
    ADD CONSTRAINT player_risk_flag_source_check
    CHECK (source IN ('', 'SPORTS', 'OWNED_GAMES', 'EXTERNAL_CASINO'));

ALTER TABLE private.player_risk_flags
    DROP CONSTRAINT IF EXISTS player_risk_win_pattern_source_check;

ALTER TABLE private.player_risk_flags
    ADD CONSTRAINT player_risk_win_pattern_source_check
    CHECK (
        flag_type NOT IN ('HIGH_WIN_FREQUENCY', 'HIGH_NET_PROFIT', 'HIGH_ROI')
        OR source IN ('SPORTS', 'OWNED_GAMES')
    );

DROP INDEX IF EXISTS private.player_risk_flags_active_uidx;

CREATE UNIQUE INDEX player_risk_flags_active_uidx
    ON private.player_risk_flags (player_user_id, flag_type, source)
    WHERE status IN ('open', 'reviewed');


CREATE TABLE IF NOT EXISTS private.player_win_pattern_settings (
    source TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    lookback_hours INTEGER NOT NULL,
    minimum_settled_count INTEGER NOT NULL,
    minimum_total_stake NUMERIC(20, 2) NOT NULL,
    win_rate_threshold NUMERIC(8, 4) NOT NULL,
    net_profit_threshold NUMERIC(20, 2) NOT NULL,
    roi_threshold NUMERIC(8, 4) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_by UUID,
    CONSTRAINT player_win_pattern_settings_source_check
        CHECK (source IN ('SPORTS', 'OWNED_GAMES')),
    CONSTRAINT player_win_pattern_settings_lookback_check
        CHECK (lookback_hours BETWEEN 24 AND 2160),
    CONSTRAINT player_win_pattern_settings_sample_check
        CHECK (minimum_settled_count BETWEEN 10 AND 10000),
    CONSTRAINT player_win_pattern_settings_stake_check
        CHECK (minimum_total_stake >= 100 AND minimum_total_stake = ROUND(minimum_total_stake, 2)),
    CONSTRAINT player_win_pattern_settings_win_rate_check
        CHECK (win_rate_threshold >= 0.50 AND win_rate_threshold <= 0.99),
    CONSTRAINT player_win_pattern_settings_profit_check
        CHECK (net_profit_threshold >= 100 AND net_profit_threshold = ROUND(net_profit_threshold, 2)),
    CONSTRAINT player_win_pattern_settings_roi_check
        CHECK (roi_threshold >= 0.10 AND roi_threshold <= 10)
);

COMMENT ON TABLE private.player_win_pattern_settings IS
'Owner-tunable investigation thresholds for win-pattern risk flags. Conservative defaults require a real sample and stake floor. No automatic enforcement.';

INSERT INTO private.player_win_pattern_settings (
    source,
    enabled,
    lookback_hours,
    minimum_settled_count,
    minimum_total_stake,
    win_rate_threshold,
    net_profit_threshold,
    roi_threshold
)
VALUES
    ('SPORTS', TRUE, 168, 25, 1000.00, 0.7000, 3000.00, 0.4000),
    ('OWNED_GAMES', TRUE, 168, 40, 500.00, 0.6500, 2000.00, 0.5000)
ON CONFLICT (source) DO NOTHING;

REVOKE ALL ON TABLE private.player_win_pattern_settings FROM PUBLIC, anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION private.player_security_upsert_flag(
    p_player_user_id UUID,
    p_flag_type TEXT,
    p_severity TEXT,
    p_related_player_count INTEGER,
    p_details JSONB
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_id UUID;
    v_details JSONB;
BEGIN
    IF p_player_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    v_details := private.player_security_assert_safe_metadata(COALESCE(p_details, '{}'::jsonb));

    INSERT INTO private.player_risk_flags (
        player_user_id,
        flag_type,
        severity,
        status,
        signal_count,
        related_player_count,
        details,
        source
    )
    VALUES (
        p_player_user_id,
        p_flag_type,
        p_severity,
        'open',
        1,
        GREATEST(COALESCE(p_related_player_count, 1), 1),
        v_details,
        ''
    )
    ON CONFLICT (player_user_id, flag_type, source) WHERE status IN ('open', 'reviewed')
    DO UPDATE SET
        signal_count = private.player_risk_flags.signal_count + 1,
        related_player_count = GREATEST(
            private.player_risk_flags.related_player_count,
            EXCLUDED.related_player_count
        ),
        last_seen_at = pg_catalog.now(),
        details = EXCLUDED.details,
        severity = EXCLUDED.severity
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_win_pattern_source_supported(p_source TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT BTRIM(COALESCE(p_source, '')) IN ('SPORTS', 'OWNED_GAMES');
$fn$;

COMMENT ON FUNCTION private.player_win_pattern_source_supported(TEXT) IS
'Live analytics sources. EXTERNAL_CASINO is reserved for real provider transactions later and is not evaluated now.';


CREATE OR REPLACE FUNCTION private.player_win_pattern_metrics_json(
    p_player_user_id UUID,
    p_source TEXT,
    p_from TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_source TEXT;
    v_settled INTEGER := 0;
    v_wins INTEGER := 0;
    v_losses INTEGER := 0;
    v_stake NUMERIC(20, 2) := 0;
    v_payout NUMERIC(20, 2) := 0;
    v_profit NUMERIC(20, 2) := 0;
    v_rate NUMERIC;
    v_roi NUMERIC;
    v_avg_odds NUMERIC;
    v_single INTEGER := 0;
    v_express INTEGER := 0;
    v_live INTEGER := 0;
    v_prematch INTEGER := 0;
BEGIN
    v_source := BTRIM(COALESCE(p_source, ''));
    IF p_player_user_id IS NULL OR p_from IS NULL THEN
        RETURN jsonb_build_object(
            'source', v_source,
            'settled_count', 0,
            'win_count', 0,
            'loss_count', 0,
            'win_rate', NULL,
            'total_stake', 0,
            'total_payout', 0,
            'net_profit', 0,
            'roi', NULL
        );
    END IF;

    IF v_source = 'EXTERNAL_CASINO' THEN
        RETURN jsonb_build_object(
            'source', v_source,
            'available', false,
            'settled_count', 0,
            'win_count', 0,
            'loss_count', 0,
            'win_rate', NULL,
            'total_stake', 0,
            'total_payout', 0,
            'net_profit', 0,
            'roi', NULL
        );
    END IF;

    IF v_source = 'SPORTS' THEN
        SELECT
            COUNT(*)::INTEGER,
            COUNT(*) FILTER (WHERE b.settlement_state = 'winner')::INTEGER,
            COUNT(*) FILTER (WHERE b.settlement_state = 'loser')::INTEGER,
            COALESCE(SUM(b.stake), 0),
            COALESCE(SUM(b.last_payout_amount), 0),
            AVG(b.accepted_odds),
            COUNT(*) FILTER (WHERE b.mode = 'single')::INTEGER,
            COUNT(*) FILTER (WHERE b.mode = 'express')::INTEGER,
            COUNT(*) FILTER (WHERE b.feed_type = 'inplay')::INTEGER,
            COUNT(*) FILTER (WHERE b.feed_type = 'prematch')::INTEGER
        INTO
            v_settled, v_wins, v_losses, v_stake, v_payout, v_avg_odds,
            v_single, v_express, v_live, v_prematch
        FROM private.sports_bets AS b
        WHERE b.player_user_id = p_player_user_id
          AND b.status = 'settled'
          AND b.settlement_state IN ('winner', 'loser')
          AND COALESCE(b.settled_at, b.accepted_at) >= p_from;
    ELSIF v_source = 'OWNED_GAMES' THEN
        SELECT
            COUNT(*)::INTEGER,
            COUNT(*) FILTER (WHERE r.payout > r.total_stake)::INTEGER,
            COUNT(*) FILTER (WHERE r.payout < r.total_stake)::INTEGER,
            COALESCE(SUM(r.total_stake), 0),
            COALESCE(SUM(r.payout), 0)
        INTO v_settled, v_wins, v_losses, v_stake, v_payout
        FROM private.game_rounds AS r
        WHERE r.player_user_id = p_player_user_id
          AND r.state = 'settled'
          AND r.settled_at IS NOT NULL
          AND r.settled_at >= p_from;
    ELSE
        RAISE EXCEPTION 'WIN_PATTERN_SOURCE_INVALID';
    END IF;

    v_profit := ROUND(COALESCE(v_payout, 0) - COALESCE(v_stake, 0), 2);
    IF v_settled > 0 THEN
        v_rate := ROUND((v_wins::NUMERIC / v_settled::NUMERIC), 4);
    ELSE
        v_rate := NULL;
    END IF;
    IF COALESCE(v_stake, 0) > 0 THEN
        v_roi := ROUND(v_profit / v_stake, 4);
    ELSE
        v_roi := NULL;
    END IF;

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'source', v_source,
        'lookback_from', p_from,
        'settled_count', v_settled,
        'win_count', v_wins,
        'loss_count', v_losses,
        'win_rate', v_rate,
        'total_stake', v_stake,
        'total_payout', v_payout,
        'net_profit', v_profit,
        'roi', v_roi,
        'average_accepted_odds', CASE WHEN v_source = 'SPORTS' THEN v_avg_odds ELSE NULL END,
        'single_count', CASE WHEN v_source = 'SPORTS' THEN v_single ELSE NULL END,
        'express_count', CASE WHEN v_source = 'SPORTS' THEN v_express ELSE NULL END,
        'live_count', CASE WHEN v_source = 'SPORTS' THEN v_live ELSE NULL END,
        'prematch_count', CASE WHEN v_source = 'SPORTS' THEN v_prematch ELSE NULL END
    ));
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_win_pattern_severity(
    p_win_rate_hit BOOLEAN,
    p_profit_hit BOOLEAN,
    p_roi_hit BOOLEAN,
    p_net_profit NUMERIC,
    p_profit_threshold NUMERIC,
    p_roi NUMERIC,
    p_roi_threshold NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_hits INTEGER := 0;
BEGIN
    IF p_win_rate_hit THEN v_hits := v_hits + 1; END IF;
    IF p_profit_hit THEN v_hits := v_hits + 1; END IF;
    IF p_roi_hit THEN v_hits := v_hits + 1; END IF;
    IF v_hits >= 2 THEN
        RETURN 'high';
    END IF;
    IF p_profit_hit AND COALESCE(p_net_profit, 0) >= (COALESCE(p_profit_threshold, 0) * 2)
       AND COALESCE(p_roi, 0) >= COALESCE(p_roi_threshold, 0) THEN
        RETURN 'high';
    END IF;
    RETURN 'medium';
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_win_pattern_upsert_flag(
    p_player_user_id UUID,
    p_flag_type TEXT,
    p_source TEXT,
    p_severity TEXT,
    p_details JSONB
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_id UUID;
    v_details JSONB;
    v_source TEXT;
BEGIN
    IF p_player_user_id IS NULL THEN
        RETURN NULL;
    END IF;
    v_source := BTRIM(COALESCE(p_source, ''));
    IF v_source NOT IN ('SPORTS', 'OWNED_GAMES') THEN
        RAISE EXCEPTION 'WIN_PATTERN_SOURCE_INVALID';
    END IF;
    IF p_flag_type NOT IN ('HIGH_WIN_FREQUENCY', 'HIGH_NET_PROFIT', 'HIGH_ROI') THEN
        RAISE EXCEPTION 'FLAG_TYPE_INVALID';
    END IF;

    v_details := private.player_security_assert_safe_metadata(COALESCE(p_details, '{}'::jsonb));

    INSERT INTO private.player_risk_flags (
        player_user_id,
        flag_type,
        severity,
        status,
        signal_count,
        related_player_count,
        details,
        source
    )
    VALUES (
        p_player_user_id,
        p_flag_type,
        p_severity,
        'open',
        1,
        1,
        v_details,
        v_source
    )
    ON CONFLICT (player_user_id, flag_type, source) WHERE status IN ('open', 'reviewed')
    DO UPDATE SET
        last_seen_at = pg_catalog.now(),
        details = EXCLUDED.details,
        severity = EXCLUDED.severity
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$fn$;

COMMENT ON FUNCTION private.player_win_pattern_upsert_flag(UUID, TEXT, TEXT, TEXT, JSONB) IS
'One active investigation flag per player/type/source. Reevaluation refreshes last_seen_at, details, and severity without incrementing signal_count. Resolved/dismissed rows are outside the partial unique index and may recur later.';


CREATE OR REPLACE FUNCTION private.evaluate_player_win_pattern(
    p_player_user_id UUID,
    p_source TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_sources TEXT[];
    v_source TEXT;
    v_settings private.player_win_pattern_settings%ROWTYPE;
    v_from TIMESTAMPTZ;
    v_metrics jsonb;
    v_settled INTEGER;
    v_stake NUMERIC;
    v_rate NUMERIC;
    v_profit NUMERIC;
    v_roi NUMERIC;
    v_win_hit BOOLEAN;
    v_profit_hit BOOLEAN;
    v_roi_hit BOOLEAN;
    v_severity TEXT;
    v_details jsonb;
    v_flags jsonb := '[]'::jsonb;
    v_created INTEGER := 0;
BEGIN
    IF p_player_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'evaluated', false, 'flags', v_flags);
    END IF;

    IF NULLIF(BTRIM(COALESCE(p_source, '')), '') IS NULL THEN
        v_sources := ARRAY['SPORTS', 'OWNED_GAMES'];
    ELSIF BTRIM(p_source) = 'EXTERNAL_CASINO' THEN
        RETURN jsonb_build_object('ok', true, 'evaluated', false, 'source', 'EXTERNAL_CASINO', 'available', false, 'flags', v_flags);
    ELSIF private.player_win_pattern_source_supported(p_source) THEN
        v_sources := ARRAY[BTRIM(p_source)];
    ELSE
        RAISE EXCEPTION 'WIN_PATTERN_SOURCE_INVALID';
    END IF;

    FOREACH v_source IN ARRAY v_sources
    LOOP
        SELECT *
        INTO v_settings
        FROM private.player_win_pattern_settings
        WHERE source = v_source;

        IF NOT FOUND OR v_settings.enabled IS NOT TRUE THEN
            CONTINUE;
        END IF;

        v_from := pg_catalog.now() - make_interval(hours => v_settings.lookback_hours);
        v_metrics := private.player_win_pattern_metrics_json(p_player_user_id, v_source, v_from);
        v_settled := COALESCE((v_metrics ->> 'settled_count')::INTEGER, 0);
        v_stake := COALESCE((v_metrics ->> 'total_stake')::NUMERIC, 0);
        v_rate := (v_metrics ->> 'win_rate')::NUMERIC;
        v_profit := COALESCE((v_metrics ->> 'net_profit')::NUMERIC, 0);
        v_roi := (v_metrics ->> 'roi')::NUMERIC;

        IF v_settled < v_settings.minimum_settled_count OR v_stake < v_settings.minimum_total_stake THEN
            CONTINUE;
        END IF;

        v_win_hit := v_rate IS NOT NULL AND v_rate >= v_settings.win_rate_threshold;
        v_profit_hit := v_profit >= v_settings.net_profit_threshold;
        v_roi_hit := v_roi IS NOT NULL AND v_roi >= v_settings.roi_threshold;
        IF NOT (v_win_hit OR v_profit_hit OR v_roi_hit) THEN
            CONTINUE;
        END IF;

        v_severity := private.player_win_pattern_severity(
            v_win_hit, v_profit_hit, v_roi_hit, v_profit,
            v_settings.net_profit_threshold, v_roi, v_settings.roi_threshold
        );

        v_details := v_metrics || jsonb_build_object(
            'source', v_source,
            'lookback_hours', v_settings.lookback_hours,
            'thresholds', jsonb_build_object(
                'minimum_settled_count', v_settings.minimum_settled_count,
                'minimum_total_stake', v_settings.minimum_total_stake,
                'win_rate_threshold', v_settings.win_rate_threshold,
                'net_profit_threshold', v_settings.net_profit_threshold,
                'roi_threshold', v_settings.roi_threshold
            ),
            'automatic_restriction', false,
            'investigation_only', true
        );

        IF v_win_hit THEN
            PERFORM private.player_win_pattern_upsert_flag(
                p_player_user_id, 'HIGH_WIN_FREQUENCY', v_source, v_severity, v_details
            );
            v_created := v_created + 1;
            v_flags := v_flags || jsonb_build_array('HIGH_WIN_FREQUENCY');
        END IF;
        IF v_profit_hit THEN
            PERFORM private.player_win_pattern_upsert_flag(
                p_player_user_id, 'HIGH_NET_PROFIT', v_source, v_severity, v_details
            );
            v_created := v_created + 1;
            v_flags := v_flags || jsonb_build_array('HIGH_NET_PROFIT');
        END IF;
        IF v_roi_hit THEN
            PERFORM private.player_win_pattern_upsert_flag(
                p_player_user_id, 'HIGH_ROI', v_source, v_severity, v_details
            );
            v_created := v_created + 1;
            v_flags := v_flags || jsonb_build_array('HIGH_ROI');
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'ok', true,
        'player_public_id', private.player_security_public_id(p_player_user_id),
        'flag_updates', v_created,
        'flags', v_flags
    );
END;
$fn$;

COMMENT ON FUNCTION private.evaluate_player_win_pattern(UUID, TEXT) IS
'Idempotent investigation-only win-pattern evaluation. Upserts open flags. Never restricts, blocks, or mutates money.';


CREATE OR REPLACE FUNCTION private.player_win_pattern_owned_games_recent(p_player_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_rows jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.settled_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT jsonb_build_object(
            'game_code', r.game_code,
            'settled_at', r.settled_at,
            'total_stake', r.total_stake,
            'payout', r.payout,
            'net_profit', ROUND(r.payout - r.total_stake, 2),
            'profitable', r.payout > r.total_stake
        ) AS obj,
        r.settled_at
        FROM private.game_rounds AS r
        WHERE r.player_user_id = p_player_user_id
          AND r.state = 'settled'
        ORDER BY r.settled_at DESC
        LIMIT 20
    ) AS item;

    RETURN v_rows;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_win_pattern_dossier_extras(p_player_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_sharing jsonb;
    v_overlap jsonb;
    v_related TEXT[];
    v_sports_from TIMESTAMPTZ;
    v_games_from TIMESTAMPTZ;
BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'flag_type', f.flag_type,
        'status', f.status,
        'related_player_count', f.related_player_count,
        'device_ref', f.details ->> 'device_ref',
        'network_ref', f.details ->> 'network_ref'
    ) ORDER BY f.last_seen_at DESC), '[]'::jsonb)
    INTO v_sharing
    FROM private.player_risk_flags AS f
    WHERE f.player_user_id = p_player_user_id
      AND f.flag_type IN ('SHARED_DEVICE', 'SHARED_NETWORK')
      AND f.status IN ('open', 'reviewed');

    SELECT COALESCE(ARRAY(
        SELECT DISTINCT BTRIM(value)
        FROM private.player_risk_flags AS f
        CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE
                WHEN jsonb_typeof(f.details -> 'related_public_ids') = 'array'
                    THEN f.details -> 'related_public_ids'
                ELSE '[]'::jsonb
            END
        ) AS value
        WHERE f.player_user_id = p_player_user_id
          AND f.flag_type IN ('SHARED_DEVICE', 'SHARED_NETWORK')
          AND f.status IN ('open', 'reviewed')
          AND BTRIM(value) <> ''
    ), ARRAY[]::TEXT[])
    INTO v_related;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'player_public_id', private.player_security_public_id(f.player_user_id),
        'flag_type', f.flag_type,
        'source', f.source,
        'severity', f.severity,
        'status', f.status
    ) ORDER BY f.last_seen_at DESC), '[]'::jsonb)
    INTO v_overlap
    FROM private.player_risk_flags AS f
    WHERE f.flag_type IN ('HIGH_WIN_FREQUENCY', 'HIGH_NET_PROFIT', 'HIGH_ROI')
      AND f.status IN ('open', 'reviewed')
      AND f.player_user_id IS DISTINCT FROM p_player_user_id
      AND private.player_security_public_id(f.player_user_id) = ANY (v_related);

    SELECT pg_catalog.now() - make_interval(hours => s.lookback_hours)
    INTO v_sports_from
    FROM private.player_win_pattern_settings AS s
    WHERE s.source = 'SPORTS';

    SELECT pg_catalog.now() - make_interval(hours => s.lookback_hours)
    INTO v_games_from
    FROM private.player_win_pattern_settings AS s
    WHERE s.source = 'OWNED_GAMES';

    RETURN jsonb_build_object(
        'linked_sharing_flags', v_sharing,
        'linked_win_pattern_overlap', v_overlap,
        'owned_games_recent', private.player_win_pattern_owned_games_recent(p_player_user_id),
        'metrics', jsonb_build_object(
            'SPORTS', private.player_win_pattern_metrics_json(p_player_user_id, 'SPORTS', COALESCE(v_sports_from, pg_catalog.now() - INTERVAL '168 hours')),
            'OWNED_GAMES', private.player_win_pattern_metrics_json(p_player_user_id, 'OWNED_GAMES', COALESCE(v_games_from, pg_catalog.now() - INTERVAL '168 hours'))
        )
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_win_pattern_settings_json()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_rows jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'source', s.source,
        'enabled', s.enabled,
        'lookback_hours', s.lookback_hours,
        'minimum_settled_count', s.minimum_settled_count,
        'minimum_total_stake', s.minimum_total_stake,
        'win_rate_threshold', s.win_rate_threshold,
        'net_profit_threshold', s.net_profit_threshold,
        'roi_threshold', s.roi_threshold,
        'updated_at', s.updated_at
    ) ORDER BY s.source), '[]'::jsonb)
    INTO v_rows
    FROM private.player_win_pattern_settings AS s;

    RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_player_security(p_player_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_dossier jsonb;
BEGIN
    PERFORM private.get_current_security_context();
    v_uid := private.player_security_user_id_from_public_id(p_player_id);
    v_dossier := private.security_player_dossier(v_uid);
    RETURN v_dossier || jsonb_build_object(
        'win_pattern', private.player_win_pattern_dossier_extras(v_uid)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_player_security(p_player_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_uid UUID;
    v_flags jsonb;
    v_events jsonb;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    v_uid := private.player_security_user_id_from_public_id(p_player_id);

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.last_seen_at DESC), '[]'::jsonb)
    INTO v_flags
    FROM (
        SELECT jsonb_build_object(
            'id', f.id,
            'player_public_id', private.player_security_public_id(f.player_user_id),
            'flag_type', f.flag_type,
            'source', NULLIF(f.source, ''),
            'severity', f.severity,
            'status', f.status,
            'signal_count', f.signal_count,
            'related_player_count', f.related_player_count,
            'first_seen_at', f.first_seen_at,
            'last_seen_at', f.last_seen_at,
            'details', f.details,
            'resolution_reason', f.resolution_reason
        ) AS obj,
        f.last_seen_at
        FROM private.player_risk_flags AS f
        WHERE f.player_user_id = v_uid
        ORDER BY f.last_seen_at DESC
        LIMIT 100
    ) AS item;

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.created_at DESC), '[]'::jsonb)
    INTO v_events
    FROM (
        SELECT jsonb_build_object(
            'id', e.id,
            'event_type', e.event_type,
            'risk_level', e.risk_level,
            'identifier_ref', private.player_security_mask_hash(e.identifier_hash),
            'device_ref', private.player_security_mask_hash(e.device_hash),
            'network_ref', private.player_security_mask_hash(e.network_hash),
            'user_agent_ref', private.player_security_mask_hash(e.user_agent_hash),
            'metadata', e.metadata,
            'created_at', e.created_at
        ) AS obj,
        e.created_at
        FROM private.player_security_events AS e
        WHERE e.player_user_id = v_uid
        ORDER BY e.created_at DESC
        LIMIT 100
    ) AS item;

    RETURN jsonb_build_object(
        'player_public_id', private.player_security_public_id(v_uid),
        'flags', v_flags,
        'events', v_events,
        'win_pattern', private.player_win_pattern_dossier_extras(v_uid)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_win_pattern_settings()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_security_context();
    RETURN private.player_win_pattern_settings_json();
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_win_pattern_settings()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_owner_context();
    RETURN private.player_win_pattern_settings_json();
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_set_win_pattern_settings(
    p_source TEXT,
    p_enabled BOOLEAN,
    p_lookback_hours INTEGER,
    p_minimum_settled_count INTEGER,
    p_minimum_total_stake NUMERIC,
    p_win_rate_threshold NUMERIC,
    p_net_profit_threshold NUMERIC,
    p_roi_threshold NUMERIC
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_source TEXT;
    v_row private.player_win_pattern_settings%ROWTYPE;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    v_source := BTRIM(COALESCE(p_source, ''));
    IF NOT private.player_win_pattern_source_supported(v_source) THEN
        RAISE EXCEPTION 'WIN_PATTERN_SOURCE_INVALID';
    END IF;
    IF p_enabled IS NULL THEN
        RAISE EXCEPTION 'ENABLED_REQUIRED';
    END IF;

    UPDATE private.player_win_pattern_settings
    SET
        enabled = p_enabled,
        lookback_hours = p_lookback_hours,
        minimum_settled_count = p_minimum_settled_count,
        minimum_total_stake = ROUND(p_minimum_total_stake, 2),
        win_rate_threshold = p_win_rate_threshold,
        net_profit_threshold = ROUND(p_net_profit_threshold, 2),
        roi_threshold = p_roi_threshold,
        updated_at = pg_catalog.now(),
        updated_by = v_owner
    WHERE source = v_source
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'WIN_PATTERN_SOURCE_INVALID';
    END IF;

    PERFORM private.append_staff_audit(
        'OWNER_SET_WIN_PATTERN_SETTINGS',
        'win_pattern_settings',
        v_source,
        'owner_only',
        jsonb_build_object(
            'source', v_source,
            'enabled', v_row.enabled,
            'lookback_hours', v_row.lookback_hours,
            'minimum_settled_count', v_row.minimum_settled_count,
            'minimum_total_stake', v_row.minimum_total_stake,
            'win_rate_threshold', v_row.win_rate_threshold,
            'net_profit_threshold', v_row.net_profit_threshold,
            'roi_threshold', v_row.roi_threshold
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'source', v_row.source,
        'enabled', v_row.enabled,
        'lookback_hours', v_row.lookback_hours,
        'minimum_settled_count', v_row.minimum_settled_count,
        'minimum_total_stake', v_row.minimum_total_stake,
        'win_rate_threshold', v_row.win_rate_threshold,
        'net_profit_threshold', v_row.net_profit_threshold,
        'roi_threshold', v_row.roi_threshold,
        'updated_at', v_row.updated_at
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_evaluate_player_win_pattern(
    p_player_id TEXT,
    p_source TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_security_context();
    RETURN private.evaluate_player_win_pattern(
        private.player_security_user_id_from_public_id(p_player_id),
        p_source
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_evaluate_player_win_pattern(
    p_player_id TEXT,
    p_source TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_owner_context();
    RETURN private.evaluate_player_win_pattern(
        private.player_security_user_id_from_public_id(p_player_id),
        p_source
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_win_pattern_evaluate(
    p_player_user_id UUID,
    p_source TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.evaluate_player_win_pattern(p_player_user_id, p_source);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_win_pattern_evaluate_after_sports_fixtures(p_fixture_ids BIGINT[])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_count INTEGER := 0;
BEGIN
    IF p_fixture_ids IS NULL OR array_length(p_fixture_ids, 1) IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'players', 0);
    END IF;

    FOR v_uid IN
        SELECT DISTINCT b.player_user_id
        FROM private.sports_bets AS b
        INNER JOIN private.sports_bet_legs AS l ON l.bet_id = b.id
        WHERE l.fixture_id = ANY (p_fixture_ids)
          AND b.status = 'settled'
          AND b.settlement_state IN ('winner', 'loser')
    LOOP
        PERFORM private.evaluate_player_win_pattern(v_uid, 'SPORTS');
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'players', v_count);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_win_pattern_evaluate_after_game_round(p_round_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_state TEXT;
BEGIN
    SELECT r.player_user_id, r.state
    INTO v_uid, v_state
    FROM private.game_rounds AS r
    WHERE r.id = p_round_id;

    IF v_uid IS NULL OR v_state IS DISTINCT FROM 'settled' THEN
        RETURN jsonb_build_object('ok', true, 'evaluated', false);
    END IF;

    RETURN private.evaluate_player_win_pattern(v_uid, 'OWNED_GAMES');
END;
$fn$;


REVOKE ALL ON FUNCTION private.player_win_pattern_source_supported(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_win_pattern_metrics_json(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_win_pattern_severity(BOOLEAN, BOOLEAN, BOOLEAN, NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_win_pattern_upsert_flag(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.evaluate_player_win_pattern(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_win_pattern_owned_games_recent(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_win_pattern_dossier_extras(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_win_pattern_settings_json() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.security_win_pattern_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_win_pattern_settings() TO authenticated;

REVOKE ALL ON FUNCTION public.owner_win_pattern_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_win_pattern_settings() TO authenticated;

REVOKE ALL ON FUNCTION public.owner_set_win_pattern_settings(TEXT, BOOLEAN, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_win_pattern_settings(TEXT, BOOLEAN, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO authenticated;

REVOKE ALL ON FUNCTION public.security_evaluate_player_win_pattern(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_evaluate_player_win_pattern(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_evaluate_player_win_pattern(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_evaluate_player_win_pattern(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.player_win_pattern_evaluate(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_win_pattern_evaluate(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.player_win_pattern_evaluate_after_sports_fixtures(BIGINT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_win_pattern_evaluate_after_sports_fixtures(BIGINT[]) TO service_role;

REVOKE ALL ON FUNCTION public.player_win_pattern_evaluate_after_game_round(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_win_pattern_evaluate_after_game_round(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.owner_list_security_flags(
    p_status TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT NULL,
    p_flag_type TEXT DEFAULT NULL,
    p_player_id TEXT DEFAULT NULL,
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_uid UUID;
    v_limit INTEGER;
    v_offset INTEGER;
    v_total INTEGER;
    v_rows jsonb;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 0), 200);
    v_offset := GREATEST(COALESCE(p_offset, 0), 0);

    IF NULLIF(BTRIM(COALESCE(p_player_id, '')), '') IS NOT NULL THEN
        v_uid := private.player_security_user_id_from_public_id(p_player_id);
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_total
    FROM private.player_risk_flags AS f
    WHERE (p_status IS NULL OR f.status = p_status)
      AND (p_severity IS NULL OR f.severity = p_severity)
      AND (p_flag_type IS NULL OR f.flag_type = p_flag_type)
      AND (v_uid IS NULL OR f.player_user_id = v_uid)
      AND (p_from IS NULL OR f.last_seen_at >= p_from)
      AND (p_to IS NULL OR f.last_seen_at <= p_to);

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.last_seen_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT jsonb_build_object(
            'id', f.id,
            'player_public_id', private.player_security_public_id(f.player_user_id),
            'flag_type', f.flag_type,
            'source', NULLIF(f.source, ''),
            'severity', f.severity,
            'status', f.status,
            'signal_count', f.signal_count,
            'related_player_count', f.related_player_count,
            'first_seen_at', f.first_seen_at,
            'last_seen_at', f.last_seen_at,
            'details', f.details,
            'resolution_reason', f.resolution_reason
        ) AS obj,
        f.last_seen_at
        FROM private.player_risk_flags AS f
        WHERE (p_status IS NULL OR f.status = p_status)
          AND (p_severity IS NULL OR f.severity = p_severity)
          AND (p_flag_type IS NULL OR f.flag_type = p_flag_type)
          AND (v_uid IS NULL OR f.player_user_id = v_uid)
          AND (p_from IS NULL OR f.last_seen_at >= p_from)
          AND (p_to IS NULL OR f.last_seen_at <= p_to)
        ORDER BY f.last_seen_at DESC
        LIMIT v_limit
        OFFSET v_offset
    ) AS item;

    RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_list_security_flags(
    p_status TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT NULL,
    p_flag_type TEXT DEFAULT NULL,
    p_player_id TEXT DEFAULT NULL,
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_limit INTEGER;
    v_offset INTEGER;
    v_total INTEGER;
    v_rows jsonb;
BEGIN
    PERFORM private.get_current_security_context();
    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 0), 200);
    v_offset := GREATEST(COALESCE(p_offset, 0), 0);

    IF NULLIF(BTRIM(COALESCE(p_player_id, '')), '') IS NOT NULL THEN
        v_uid := private.player_security_user_id_from_public_id(p_player_id);
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_total
    FROM private.player_risk_flags AS f
    WHERE (p_status IS NULL OR f.status = p_status)
      AND (p_severity IS NULL OR f.severity = p_severity)
      AND (p_flag_type IS NULL OR f.flag_type = p_flag_type)
      AND (v_uid IS NULL OR f.player_user_id = v_uid)
      AND (p_from IS NULL OR f.last_seen_at >= p_from)
      AND (p_to IS NULL OR f.last_seen_at <= p_to);

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.last_seen_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT jsonb_build_object(
            'id', f.id,
            'player_public_id', private.player_security_public_id(f.player_user_id),
            'flag_type', f.flag_type,
            'source', NULLIF(f.source, ''),
            'severity', f.severity,
            'status', f.status,
            'signal_count', f.signal_count,
            'related_player_count', f.related_player_count,
            'first_seen_at', f.first_seen_at,
            'last_seen_at', f.last_seen_at,
            'details', f.details,
            'resolution_reason', f.resolution_reason
        ) AS obj,
        f.last_seen_at
        FROM private.player_risk_flags AS f
        WHERE (p_status IS NULL OR f.status = p_status)
          AND (p_severity IS NULL OR f.severity = p_severity)
          AND (p_flag_type IS NULL OR f.flag_type = p_flag_type)
          AND (v_uid IS NULL OR f.player_user_id = v_uid)
          AND (p_from IS NULL OR f.last_seen_at >= p_from)
          AND (p_to IS NULL OR f.last_seen_at <= p_to)
        ORDER BY f.last_seen_at DESC
        LIMIT v_limit
        OFFSET v_offset
    ) AS item;

    RETURN jsonb_build_object('ok', true, 'rows', v_rows, 'total', v_total);
END;
$fn$;


REVOKE ALL ON FUNCTION public.owner_list_security_flags(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_list_security_flags(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.security_list_security_flags(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_list_security_flags(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.security_player_security(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_player_security(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_player_security(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_player_security(TEXT) TO authenticated;

COMMIT;
