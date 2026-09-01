BEGIN;

-- ============================================================
-- NEXTPARI PHASE 030
-- DAILY RTP / PROFIT REPORTING
--
-- Written only. Do not execute this file against production.
--
-- Storage timestamps remain timestamptz (UTC).
-- Reporting calendar days are computed in a configurable timezone.
-- Default business window: ONE calendar day (today).
-- Also: 7d, 30d, custom inclusive date range.
--
-- Theoretical RTP for CONTROLLED games (pharaoh, dice, blackjack,
-- crystal, aviator) is approximately 87.5%. Metadata only.
-- APPLES uses a separate progressive model and has NO 87.5% target.
-- Mixed-catalog theoretical RTP is not 87.5%; it depends on game mix.
--
-- winningRounds counts actual wins (outcome/result in win, golden,
-- blackjack). Dice draw and blackjack push return stake (payout > 0)
-- but are NOT wins.
--
-- DO NOT use reporting metadata to change odds, RNG, payouts, crash
-- points, boards, cards, or results.
-- Daily realized hold may fluctuate because of variance.
-- ============================================================


CREATE TABLE IF NOT EXISTS private.game_report_settings (
    id SMALLINT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'Asia/Ashgabat',
    theoretical_rtp NUMERIC(8,6) NOT NULL DEFAULT 0.875000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT game_report_settings_singleton CHECK (id = 1),
    CONSTRAINT game_report_settings_rtp_check
        CHECK (theoretical_rtp > 0 AND theoretical_rtp < 1),
    CONSTRAINT game_report_settings_timezone_check
        CHECK (char_length(BTRIM(timezone)) BETWEEN 1 AND 64)
);

INSERT INTO private.game_report_settings (id, timezone, theoretical_rtp)
VALUES (1, 'Asia/Ashgabat', 0.875000)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE private.game_report_settings IS
'Reporting defaults only. theoretical_rtp is the controlled-game target (not Apples, not mixed-catalog). Not an outcome-control lever.';

CREATE INDEX IF NOT EXISTS game_rounds_settled_at_idx
ON private.game_rounds (settled_at)
WHERE state = 'settled';

CREATE INDEX IF NOT EXISTS game_rounds_settled_game_idx
ON private.game_rounds (game_code, settled_at)
WHERE state = 'settled';

REVOKE ALL ON TABLE private.game_report_settings FROM PUBLIC;
REVOKE ALL ON TABLE private.game_report_settings FROM anon, authenticated;
GRANT SELECT ON TABLE private.game_report_settings TO service_role;


CREATE OR REPLACE FUNCTION private.game_report_require_timezone(p_timezone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_tz TEXT;
BEGIN
    v_tz := NULLIF(BTRIM(COALESCE(p_timezone, '')), '');
    IF v_tz IS NULL THEN
        SELECT s.timezone
        INTO v_tz
        FROM private.game_report_settings AS s
        WHERE s.id = 1;
    END IF;
    v_tz := COALESCE(NULLIF(BTRIM(COALESCE(v_tz, '')), ''), 'Asia/Ashgabat');

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_timezone_names AS z
        WHERE z.name = v_tz
    ) THEN
        RAISE EXCEPTION 'TIMEZONE_INVALID';
    END IF;
    RETURN v_tz;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_report_day(p_ts TIMESTAMPTZ, p_timezone TEXT)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_tz TEXT;
BEGIN
    v_tz := private.game_report_require_timezone(p_timezone);
    IF p_ts IS NULL THEN
        RAISE EXCEPTION 'TIMESTAMP_REQUIRED';
    END IF;
    RETURN (p_ts AT TIME ZONE v_tz)::DATE;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_report_range_start(p_date DATE, p_timezone TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
BEGIN
    IF p_date IS NULL THEN
        RAISE EXCEPTION 'PERIOD_INVALID';
    END IF;
    RETURN (p_date::TIMESTAMP AT TIME ZONE private.game_report_require_timezone(p_timezone));
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_report_range_end(p_date DATE, p_timezone TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
BEGIN
    IF p_date IS NULL THEN
        RAISE EXCEPTION 'PERIOD_INVALID';
    END IF;
    RETURN ((p_date + 1)::TIMESTAMP AT TIME ZONE private.game_report_require_timezone(p_timezone));
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_rtp_metrics_json(
    p_wagered NUMERIC,
    p_payouts NUMERIC,
    p_rounds BIGINT,
    p_wins BIGINT
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_wagered NUMERIC(20,2) := ROUND(COALESCE(p_wagered, 0), 2);
    v_payouts NUMERIC(20,2) := ROUND(COALESCE(p_payouts, 0), 2);
    v_ggr NUMERIC(20,2);
BEGIN
    v_ggr := ROUND(v_wagered - v_payouts, 2);
    RETURN jsonb_build_object(
        'totalWagered', v_wagered,
        'totalPayouts', v_payouts,
        'rounds', COALESCE(p_rounds, 0),
        'winningRounds', COALESCE(p_wins, 0),
        'ggr', v_ggr,
        'realizedRtp', CASE
            WHEN v_wagered > 0 THEN ROUND(v_payouts / v_wagered, 6)
            ELSE NULL
        END,
        'realizedHold', CASE
            WHEN v_wagered > 0 THEN ROUND(v_ggr / v_wagered, 6)
            ELSE NULL
        END
    );
END;
$fn$;

-- Canonical win label from public_result.outcome, else public_result.result.
-- Draws, pushes, losses, cancels, and refunds are not wins even if payout > 0.
CREATE OR REPLACE FUNCTION private.game_report_is_win(p_public_result jsonb)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT LOWER(BTRIM(COALESCE(
        NULLIF(p_public_result->>'outcome', ''),
        NULLIF(p_public_result->>'result', ''),
        ''
    ))) IN ('win', 'golden', 'blackjack');
$fn$;

CREATE OR REPLACE FUNCTION private.game_report_rtp_meta(p_game_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_theo NUMERIC(8,6);
BEGIN
    IF p_game_code = 'apples' THEN
        RETURN jsonb_build_object(
            'theoreticalRtpTarget', NULL,
            'rtpModel', 'progressive'
        );
    END IF;

    SELECT s.theoretical_rtp
    INTO v_theo
    FROM private.game_report_settings AS s
    WHERE s.id = 1;

    RETURN jsonb_build_object(
        'theoreticalRtpTarget', COALESCE(v_theo, 0.875000),
        'rtpModel', 'fixed-target'
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_rtp_resolve_period(
    p_period TEXT,
    p_from DATE,
    p_to DATE,
    p_timezone TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_tz TEXT;
    v_today DATE;
    v_period TEXT;
    v_from DATE;
    v_to DATE;
BEGIN
    v_tz := private.game_report_require_timezone(p_timezone);
    v_today := (pg_catalog.now() AT TIME ZONE v_tz)::DATE;
    v_period := LOWER(BTRIM(COALESCE(p_period, 'today')));

    IF v_period = 'today' OR v_period = '1d' OR v_period = 'day' THEN
        v_period := 'today';
        v_from := v_today;
        v_to := v_today;
    ELSIF v_period = '7d' THEN
        v_from := v_today - 6;
        v_to := v_today;
    ELSIF v_period = '30d' THEN
        v_from := v_today - 29;
        v_to := v_today;
    ELSIF v_period = 'custom' THEN
        IF p_from IS NULL OR p_to IS NULL THEN
            RAISE EXCEPTION 'PERIOD_INVALID';
        END IF;
        v_from := p_from;
        v_to := p_to;
    ELSE
        RAISE EXCEPTION 'PERIOD_INVALID';
    END IF;

    IF v_to < v_from THEN
        RAISE EXCEPTION 'PERIOD_INVALID';
    END IF;
    IF (v_to - v_from) > 366 THEN
        RAISE EXCEPTION 'PERIOD_TOO_LONG';
    END IF;

    RETURN jsonb_build_object(
        'kind', v_period,
        'timezone', v_tz,
        'today', v_today,
        'from', v_from,
        'to', v_to,
        'startAt', private.game_report_range_start(v_from, v_tz),
        'endAt', private.game_report_range_end(v_to, v_tz)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_game_rtp_report(
    p_period TEXT DEFAULT 'today',
    p_from DATE DEFAULT NULL,
    p_to DATE DEFAULT NULL,
    p_timezone TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_window jsonb;
    v_tz TEXT;
    v_from DATE;
    v_to DATE;
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_theo NUMERIC(8,6);
    v_games jsonb;
    v_days jsonb;
    v_totals jsonb;
BEGIN
    PERFORM private.get_current_owner_context();

    v_window := private.game_rtp_resolve_period(p_period, p_from, p_to, p_timezone);
    v_tz := v_window->>'timezone';
    v_from := (v_window->>'from')::DATE;
    v_to := (v_window->>'to')::DATE;
    v_start := (v_window->>'startAt')::TIMESTAMPTZ;
    v_end := (v_window->>'endAt')::TIMESTAMPTZ;

    SELECT s.theoretical_rtp
    INTO v_theo
    FROM private.game_report_settings AS s
    WHERE s.id = 1;
    v_theo := COALESCE(v_theo, 0.875000);

    SELECT private.game_rtp_metrics_json(
        COALESCE(SUM(r.total_stake), 0),
        COALESCE(SUM(r.payout), 0),
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE private.game_report_is_win(r.public_result))::BIGINT
    )
    INTO v_totals
    FROM private.game_rounds AS r
    WHERE r.state = 'settled'
      AND r.settled_at >= v_start
      AND r.settled_at < v_end;

    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'gameCode'), '[]'::jsonb)
    INTO v_games
    FROM (
        SELECT jsonb_build_object(
            'gameCode', c.game_code,
            'displayName', c.display_name,
            'status', c.status
        ) || private.game_rtp_metrics_json(
            COALESCE(agg.wagered, 0),
            COALESCE(agg.payouts, 0),
            COALESCE(agg.rounds, 0),
            COALESCE(agg.wins, 0)
        ) || private.game_report_rtp_meta(c.game_code) AS item
        FROM private.game_catalog AS c
        LEFT JOIN (
            SELECT
                r.game_code,
                SUM(r.total_stake) AS wagered,
                SUM(r.payout) AS payouts,
                COUNT(*)::BIGINT AS rounds,
                COUNT(*) FILTER (WHERE private.game_report_is_win(r.public_result))::BIGINT AS wins
            FROM private.game_rounds AS r
            WHERE r.state = 'settled'
              AND r.settled_at >= v_start
              AND r.settled_at < v_end
            GROUP BY r.game_code
        ) AS agg ON agg.game_code = c.game_code
    ) AS listed;

    SELECT COALESCE(jsonb_agg(day_row ORDER BY day_row->>'date'), '[]'::jsonb)
    INTO v_days
    FROM (
        SELECT jsonb_build_object(
            'date', d.report_date,
            'totals', private.game_rtp_metrics_json(
                COALESCE(day_all.wagered, 0),
                COALESCE(day_all.payouts, 0),
                COALESCE(day_all.rounds, 0),
                COALESCE(day_all.wins, 0)
            ),
            'games', COALESCE((
                SELECT jsonb_agg(gitem ORDER BY gitem->>'gameCode')
                FROM (
                    SELECT jsonb_build_object(
                        'gameCode', c.game_code,
                        'displayName', c.display_name
                    ) || private.game_rtp_metrics_json(
                        COALESCE(g.wagered, 0),
                        COALESCE(g.payouts, 0),
                        COALESCE(g.rounds, 0),
                        COALESCE(g.wins, 0)
                    ) || private.game_report_rtp_meta(c.game_code) AS gitem
                    FROM private.game_catalog AS c
                    LEFT JOIN (
                        SELECT
                            r.game_code,
                            SUM(r.total_stake) AS wagered,
                            SUM(r.payout) AS payouts,
                            COUNT(*)::BIGINT AS rounds,
                            COUNT(*) FILTER (WHERE private.game_report_is_win(r.public_result))::BIGINT AS wins
                        FROM private.game_rounds AS r
                        WHERE r.state = 'settled'
                          AND r.settled_at >= v_start
                          AND r.settled_at < v_end
                          AND (r.settled_at AT TIME ZONE v_tz)::DATE = d.report_date
                        GROUP BY r.game_code
                    ) AS g ON g.game_code = c.game_code
                ) AS per_game
            ), '[]'::jsonb)
        ) AS day_row
        FROM (
            SELECT gs::DATE AS report_date
            FROM pg_catalog.generate_series(
                v_from::TIMESTAMP,
                v_to::TIMESTAMP,
                INTERVAL '1 day'
            ) AS gs
        ) AS d
        LEFT JOIN (
            SELECT
                (r.settled_at AT TIME ZONE v_tz)::DATE AS report_date,
                SUM(r.total_stake) AS wagered,
                SUM(r.payout) AS payouts,
                COUNT(*)::BIGINT AS rounds,
                COUNT(*) FILTER (WHERE private.game_report_is_win(r.public_result))::BIGINT AS wins
            FROM private.game_rounds AS r
            WHERE r.state = 'settled'
              AND r.settled_at >= v_start
              AND r.settled_at < v_end
            GROUP BY 1
        ) AS day_all ON day_all.report_date = d.report_date
    ) AS days;

    RETURN jsonb_build_object(
        'ok', true,
        'timezone', v_tz,
        'controlledGameTargetRtp', v_theo,
        'primaryWindow', 'today',
        'period', jsonb_build_object(
            'kind', v_window->>'kind',
            'from', v_from,
            'to', v_to,
            'startAt', v_start,
            'endAt', v_end
        ),
        'totals', v_totals,
        'games', v_games,
        'days', v_days,
        'note', 'Calendar day is a reporting window. Outcomes are not adjusted to hit a daily profit target. Controlled games target 87.5% RTP. Apple of Fortune uses a separate progressive model. Mixed-catalog theoretical RTP is not 87.5%.'
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.game_report_require_timezone(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.game_report_day(TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.game_report_range_start(DATE, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.game_report_range_end(DATE, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.game_rtp_metrics_json(NUMERIC, NUMERIC, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.game_report_is_win(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.game_report_rtp_meta(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.game_rtp_resolve_period(TEXT, DATE, DATE, TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.owner_game_rtp_report(TEXT, DATE, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_game_rtp_report(TEXT, DATE, DATE, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_game_rtp_report(TEXT, DATE, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION public.owner_game_rtp_report(TEXT, DATE, DATE, TEXT) IS
'Owner JWT daily RTP/GGR report. Timezone-aware calendar days. Read-only. winningRounds uses outcome/result wins, not payout>0. Does not change game outcomes.';

COMMIT;
