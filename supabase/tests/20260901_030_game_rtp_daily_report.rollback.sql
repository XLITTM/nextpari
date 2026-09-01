-- NEXTPARI PHASE 030
-- Behavioral BEGIN/ROLLBACK probe for timezone-aware daily RTP reporting.
--
-- NOT a migration. Do NOT COMMIT. Do NOT run against production.
-- Requires 029 + 030 already applied on the database you test.
--
-- Live IDs (test file only — never in production functions):
--   player auth/profile       bc5d66cd-5e18-4352-b7f8-ea99029758e0
--   player wallet             3ea1677a-d664-47c3-b019-0635b643d6e5
--
-- psql:  \i this file   (file has BEGIN/ROLLBACK)

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.np_set_jwt(p_sub UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $jwt$
BEGIN
    PERFORM set_config('request.jwt.claim.sub', p_sub::TEXT, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', p_sub::TEXT, 'role', 'authenticated')::TEXT,
        true
    );
END;
$jwt$;

CREATE OR REPLACE FUNCTION pg_temp.np_assert(p_ok BOOLEAN, p_msg TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $as$
BEGIN
    IF p_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'ASSERT: %', p_msg;
    END IF;
END;
$as$;

CREATE OR REPLACE FUNCTION pg_temp.np_expect_error(p_sql TEXT, p_needle TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $ex$
DECLARE
    v_raised BOOLEAN := FALSE;
    v_msg TEXT;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION
        WHEN OTHERS THEN
            v_raised := TRUE;
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    END;
    IF v_raised IS NOT TRUE THEN
        RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED: % [%]', p_needle, p_sql;
    END IF;
    IF v_msg NOT ILIKE '%' || p_needle || '%' THEN
        RAISE EXCEPTION 'UNEXPECTED_ERROR: expected % got % [%]', p_needle, v_msg, p_sql;
    END IF;
END;
$ex$;

-- Asia/Ashgabat is UTC+5. 2026-09-01 19:00 UTC is 2026-09-02 00:00 in Ashgabat.
SELECT pg_temp.np_assert(
    private.game_report_day('2026-09-01 18:59:59+00'::TIMESTAMPTZ, 'UTC') = DATE '2026-09-01'
    AND private.game_report_day('2026-09-01 18:59:59+00'::TIMESTAMPTZ, 'Asia/Ashgabat') = DATE '2026-09-01',
    '18:59 UTC is still 1 Sep in Ashgabat'
);

SELECT pg_temp.np_assert(
    private.game_report_day('2026-09-01 19:00:00+00'::TIMESTAMPTZ, 'UTC') = DATE '2026-09-01'
    AND private.game_report_day('2026-09-01 19:00:00+00'::TIMESTAMPTZ, 'Asia/Ashgabat') = DATE '2026-09-02',
    '19:00 UTC is 2 Sep in Ashgabat and still 1 Sep in UTC'
);

SELECT pg_temp.np_assert(
    private.game_report_range_start(DATE '2026-09-02', 'Asia/Ashgabat')
        = '2026-09-01 19:00:00+00'::TIMESTAMPTZ
    AND private.game_report_range_end(DATE '2026-09-02', 'Asia/Ashgabat')
        = '2026-09-02 19:00:00+00'::TIMESTAMPTZ,
    'Ashgabat calendar day bounds convert back to UTC instants'
);

SELECT pg_temp.np_expect_error(
    $q$SELECT private.game_report_require_timezone('Not/A_Zone')$q$,
    'TIMEZONE_INVALID'
);

INSERT INTO private.game_rounds (
    id,
    player_user_id,
    wallet_id,
    game_code,
    state,
    stake,
    total_stake,
    payout,
    public_result,
    private_state,
    server_seed,
    server_seed_hash,
    nonce,
    start_idempotency_key,
    start_fingerprint,
    settled_at,
    cancelled_at,
    created_at,
    updated_at
) VALUES
(
    'aaaaaaaa-0000-4000-8000-000000000001',
    'bc5d66cd-5e18-4352-b7f8-ea99029758e0',
    '3ea1677a-d664-47c3-b019-0635b643d6e5',
    'dice',
    'settled',
    100, 100, 0,
    '{"outcome":"lose"}'::jsonb,
    '{}'::jsonb,
    'seed-a',
    'hash-a',
    1,
    '030:boundary-a',
    'fp-a',
    '2026-09-01 18:59:59+00'::TIMESTAMPTZ,
    NULL,
    '2026-09-01 18:59:59+00'::TIMESTAMPTZ,
    '2026-09-01 18:59:59+00'::TIMESTAMPTZ
),
(
    'aaaaaaaa-0000-4000-8000-000000000002',
    'bc5d66cd-5e18-4352-b7f8-ea99029758e0',
    '3ea1677a-d664-47c3-b019-0635b643d6e5',
    'pharaoh',
    'settled',
    40, 40, 80,
    '{"outcome":"win"}'::jsonb,
    '{}'::jsonb,
    'seed-b',
    'hash-b',
    1,
    '030:boundary-b',
    'fp-b',
    '2026-09-01 19:00:00+00'::TIMESTAMPTZ,
    NULL,
    '2026-09-01 19:00:00+00'::TIMESTAMPTZ,
    '2026-09-01 19:00:00+00'::TIMESTAMPTZ
),
(
    'aaaaaaaa-0000-4000-8000-000000000003',
    'bc5d66cd-5e18-4352-b7f8-ea99029758e0',
    '3ea1677a-d664-47c3-b019-0635b643d6e5',
    'dice',
    'cancelled',
    500, 500, 0,
    '{}'::jsonb,
    '{}'::jsonb,
    'seed-c',
    'hash-c',
    1,
    '030:boundary-c',
    'fp-c',
    NULL,
    '2026-09-01 19:00:00+00'::TIMESTAMPTZ,
    '2026-09-01 19:00:00+00'::TIMESTAMPTZ,
    '2026-09-01 19:00:00+00'::TIMESTAMPTZ
);

-- Owner JWT is required for the public report RPC.
-- This probe uses the private helpers + direct aggregation so it does not
-- depend on creating an Owner Auth user.

CREATE TEMP TABLE np_ashgabat_sep1 ON COMMIT DROP AS
SELECT
    COALESCE(SUM(r.total_stake), 0) AS wagered,
    COALESCE(SUM(r.payout), 0) AS payouts,
    COUNT(*)::BIGINT AS rounds,
    COUNT(*) FILTER (WHERE r.payout > 0)::BIGINT AS wins
FROM private.game_rounds AS r
WHERE r.state = 'settled'
  AND r.id IN (
      'aaaaaaaa-0000-4000-8000-000000000001',
      'aaaaaaaa-0000-4000-8000-000000000002',
      'aaaaaaaa-0000-4000-8000-000000000003'
  )
  AND r.settled_at >= private.game_report_range_start(DATE '2026-09-01', 'Asia/Ashgabat')
  AND r.settled_at < private.game_report_range_end(DATE '2026-09-01', 'Asia/Ashgabat');

SELECT pg_temp.np_assert(
    (SELECT wagered FROM np_ashgabat_sep1) = 100
    AND (SELECT payouts FROM np_ashgabat_sep1) = 0
    AND (SELECT rounds FROM np_ashgabat_sep1) = 1
    AND (SELECT wins FROM np_ashgabat_sep1) = 0,
    'Ashgabat 1 Sep includes only the 18:59 UTC loss'
);

CREATE TEMP TABLE np_ashgabat_sep2 ON COMMIT DROP AS
SELECT
    COALESCE(SUM(r.total_stake), 0) AS wagered,
    COALESCE(SUM(r.payout), 0) AS payouts,
    COUNT(*)::BIGINT AS rounds,
    COUNT(*) FILTER (WHERE r.payout > 0)::BIGINT AS wins
FROM private.game_rounds AS r
WHERE r.state = 'settled'
  AND r.id IN (
      'aaaaaaaa-0000-4000-8000-000000000001',
      'aaaaaaaa-0000-4000-8000-000000000002',
      'aaaaaaaa-0000-4000-8000-000000000003'
  )
  AND r.settled_at >= private.game_report_range_start(DATE '2026-09-02', 'Asia/Ashgabat')
  AND r.settled_at < private.game_report_range_end(DATE '2026-09-02', 'Asia/Ashgabat');

SELECT pg_temp.np_assert(
    (SELECT wagered FROM np_ashgabat_sep2) = 40
    AND (SELECT payouts FROM np_ashgabat_sep2) = 80
    AND (SELECT rounds FROM np_ashgabat_sep2) = 1
    AND (SELECT wins FROM np_ashgabat_sep2) = 1,
    'Ashgabat 2 Sep includes only the 19:00 UTC win'
);

CREATE TEMP TABLE np_utc_sep1 ON COMMIT DROP AS
SELECT
    COALESCE(SUM(r.total_stake), 0) AS wagered,
    COALESCE(SUM(r.payout), 0) AS payouts,
    COUNT(*)::BIGINT AS rounds
FROM private.game_rounds AS r
WHERE r.state = 'settled'
  AND r.id IN (
      'aaaaaaaa-0000-4000-8000-000000000001',
      'aaaaaaaa-0000-4000-8000-000000000002'
  )
  AND r.settled_at >= private.game_report_range_start(DATE '2026-09-01', 'UTC')
  AND r.settled_at < private.game_report_range_end(DATE '2026-09-01', 'UTC');

SELECT pg_temp.np_assert(
    (SELECT wagered FROM np_utc_sep1) = 140
    AND (SELECT payouts FROM np_utc_sep1) = 80
    AND (SELECT rounds FROM np_utc_sep1) = 2,
    'UTC 1 Sep includes both rounds that Ashgabat splits across two days'
);

SELECT pg_temp.np_assert(
    (SELECT (private.game_rtp_metrics_json(140, 80, 2, 1)->>'ggr')::NUMERIC) = 60
    AND (SELECT (private.game_rtp_metrics_json(140, 80, 2, 1)->>'realizedRtp')::NUMERIC)
        = ROUND(80::NUMERIC / 140, 6)
    AND (SELECT (private.game_rtp_metrics_json(140, 80, 2, 1)->>'realizedHold')::NUMERIC)
        = ROUND(60::NUMERIC / 140, 6),
    'GGR / realized RTP / hold formulas'
);

SELECT pg_temp.np_assert(
    (SELECT (private.game_rtp_resolve_period('today', NULL, NULL, 'UTC')->>'kind')) = 'today'
    AND (SELECT (private.game_rtp_resolve_period('today', NULL, NULL, 'UTC')->>'from')::DATE)
        = (SELECT (private.game_rtp_resolve_period('today', NULL, NULL, 'UTC')->>'to')::DATE),
    'primary business window is one calendar day'
);

SELECT pg_temp.np_assert(
    ((private.game_rtp_resolve_period('7d', NULL, NULL, 'UTC')->>'to')::DATE
        - (private.game_rtp_resolve_period('7d', NULL, NULL, 'UTC')->>'from')::DATE) = 6
    AND ((private.game_rtp_resolve_period('30d', NULL, NULL, 'UTC')->>'to')::DATE
        - (private.game_rtp_resolve_period('30d', NULL, NULL, 'UTC')->>'from')::DATE) = 29,
    '7d and 30d are inclusive calendar windows'
);

SELECT pg_temp.np_expect_error(
    $q$SELECT private.game_rtp_resolve_period('custom', DATE '2026-09-10', DATE '2026-09-01', 'UTC')$q$,
    'PERIOD_INVALID'
);

SELECT pg_temp.np_assert(
    (SELECT theoretical_rtp FROM private.game_report_settings WHERE id = 1) = 0.875000,
    'theoretical RTP remains 87.5% metadata'
);

ROLLBACK;
