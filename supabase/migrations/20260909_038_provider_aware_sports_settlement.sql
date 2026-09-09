BEGIN;

-- ============================================================
-- NEXTPARI PHASE 038
-- Provider-aware sports settlement identity.
-- Sequence: after 037 sports place alias fix.
--
-- Do not reapply 035/036/037.
-- Do not rewrite Wallet Core / apply_wallet_entry / public.wallets.
-- Do not change place-time provider default ('lsports') — Task 014
-- only makes settlement matching and event idempotency provider-aware.
--
-- sports_apply_settlement stays service_role. private.sports_apply_one
-- stays ungranted to anon/authenticated.
-- ============================================================

-- ------------------------------------------------------------
-- PART C/D — settlement event provider + scoped fingerprint
-- ------------------------------------------------------------
ALTER TABLE private.sports_settlement_events
    ADD COLUMN IF NOT EXISTS provider TEXT;

-- sports_bets.provider is bet-level / first selected provider and is NOT
-- used as an unconditional source for a specific settlement event.

-- 1. Explicit canonical payload provider (Task 013 notices). Strongest.
UPDATE private.sports_settlement_events
SET provider = NULLIF(BTRIM(payload->>'provider'), '')
WHERE provider IS NULL
  AND NULLIF(BTRIM(COALESCE(payload->>'provider', '')), '') IS NOT NULL;

-- 2. Matched events: unique provider among THAT bet's legs that match
-- the event fixture/outcome/market identity (same apply_one market rules).
UPDATE private.sports_settlement_events AS e
SET provider = s.provider
FROM (
    SELECT
        e2.id,
        MIN(l.provider) AS provider
    FROM private.sports_settlement_events AS e2
    INNER JOIN private.sports_bet_legs AS l
        ON l.bet_id = e2.matched_bet_id
       AND l.fixture_id IS NOT DISTINCT FROM e2.fixture_id
       AND l.outcome_id = e2.outcome_id
       AND (
            COALESCE(e2.market_key, '') = ''
            OR l.market_key = e2.market_key
            OR (
                COALESCE(e2.market_id, '') <> ''
                AND l.market_id = e2.market_id
            )
       )
    WHERE e2.provider IS NULL
      AND e2.matched_bet_id IS NOT NULL
      AND NULLIF(BTRIM(l.provider), '') IS NOT NULL
    GROUP BY e2.id
    HAVING COUNT(DISTINCT l.provider) = 1
) AS s
WHERE e.id = s.id
  AND e.provider IS NULL;

-- 3. Still-unresolved rows: unique provider among all matching legs
-- (same fixture/outcome/market identity). Ambiguous = leave NULL.
UPDATE private.sports_settlement_events AS e
SET provider = s.provider
FROM (
    SELECT
        e2.id,
        MIN(l.provider) AS provider
    FROM private.sports_settlement_events AS e2
    INNER JOIN private.sports_bet_legs AS l
        ON l.fixture_id IS NOT DISTINCT FROM e2.fixture_id
       AND l.outcome_id = e2.outcome_id
       AND (
            COALESCE(e2.market_key, '') = ''
            OR l.market_key = e2.market_key
            OR (
                COALESCE(e2.market_id, '') <> ''
                AND l.market_id = e2.market_id
            )
       )
    WHERE e2.provider IS NULL
      AND NULLIF(BTRIM(l.provider), '') IS NOT NULL
    GROUP BY e2.id
    HAVING COUNT(DISTINCT l.provider) = 1
) AS s
WHERE e.id = s.id
  AND e.provider IS NULL;

-- 4. Remainder is LSports-only when every stored bet and leg is lsports
-- (or those tables are empty). Repository has no other live settlement
-- producer. If any non-lsports bet/leg exists, do not guess.
UPDATE private.sports_settlement_events
SET provider = 'lsports'
WHERE provider IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM private.sports_bets
      WHERE provider IS DISTINCT FROM 'lsports'
  )
  AND NOT EXISTS (
      SELECT 1
      FROM private.sports_bet_legs
      WHERE provider IS DISTINCT FROM 'lsports'
  );

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM private.sports_settlement_events
        WHERE provider IS NULL OR BTRIM(provider) = ''
    ) THEN
        RAISE EXCEPTION 'SPORTS_SETTLEMENT_PROVIDER_BACKFILL_INCOMPLETE';
    END IF;
END
$$;

ALTER TABLE private.sports_settlement_events
    ALTER COLUMN provider SET NOT NULL;

-- 035: fingerprint TEXT NOT NULL UNIQUE
-- PostgreSQL names that column UNIQUE: sports_settlement_events_fingerprint_key
ALTER TABLE private.sports_settlement_events
    DROP CONSTRAINT sports_settlement_events_fingerprint_key;

ALTER TABLE private.sports_settlement_events
    ADD CONSTRAINT sports_settlement_events_provider_fingerprint
    UNIQUE (provider, fingerprint);

-- ------------------------------------------------------------
-- PART B — provider-aware leg identity
-- 035: CONSTRAINT sports_bet_legs_identity
--      UNIQUE (bet_id, fixture_id, market_key, outcome_id)
-- market_key is TEXT NOT NULL (empty string allowed). Keep that.
-- ------------------------------------------------------------
ALTER TABLE private.sports_bet_legs
    DROP CONSTRAINT sports_bet_legs_identity;

ALTER TABLE private.sports_bet_legs
    ADD CONSTRAINT sports_bet_legs_identity
    UNIQUE (bet_id, provider, fixture_id, market_key, outcome_id);

DROP INDEX IF EXISTS private.sports_bet_legs_match_idx;

CREATE INDEX sports_bet_legs_match_idx
    ON private.sports_bet_legs (provider, fixture_id, outcome_id, market_key);

-- ------------------------------------------------------------
-- PART E/G — sports_apply_one requires provider and matches it
-- Financial branches copied from 035; identity/idempotency only.
-- Wallet idempotency strings are provider-scoped so provider-a and
-- provider-b cannot share sports-settle/reverse/void keys.
-- Historical LSports events stay in sports_settlement_events; a redelivery
-- of the same (provider, fingerprint) hits ON CONFLICT and returns duplicate
-- before any new wallet movement. Old ledger rows are not rewritten.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.sports_apply_one(
    p_item JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_fp TEXT;
    v_provider TEXT;
    v_fixture BIGINT;
    v_market_key TEXT;
    v_market_id TEXT;
    v_outcome TEXT;
    v_code INTEGER;
    v_existing UUID;
    v_bet private.sports_bets%ROWTYPE;
    v_leg private.sports_bet_legs%ROWTYPE;
    v_matched INTEGER := 0;
    v_result TEXT := 'unmatched';
    v_payout NUMERIC(20, 2) := 0;
    v_ledger UUID;
    v_op TEXT;
BEGIN
    v_fp := NULLIF(BTRIM(COALESCE(p_item->>'fingerprint', '')), '');
    IF v_fp IS NULL THEN
        RAISE EXCEPTION 'SETTLEMENT_FINGERPRINT_REQUIRED';
    END IF;
    v_provider := NULLIF(BTRIM(COALESCE(p_item->>'provider', '')), '');
    IF v_provider IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'result', 'unknown', 'fingerprint', v_fp);
    END IF;
    v_fixture := NULLIF(p_item->>'fixtureId', '')::BIGINT;
    v_market_key := COALESCE(p_item->>'marketKey', '');
    v_market_id := COALESCE(p_item->>'marketId', '');
    v_outcome := COALESCE(p_item->>'outcomeId', p_item->>'betId', '');
    v_code := NULLIF(p_item->>'settlement', '')::INTEGER;

    INSERT INTO private.sports_settlement_events (
        fingerprint, provider, fixture_id, market_id, market_key, outcome_id, settlement_code, result, payload
    ) VALUES (
        v_fp, v_provider, v_fixture, v_market_id, v_market_key, v_outcome, v_code, 'ignored', p_item
    )
    ON CONFLICT (provider, fingerprint) DO NOTHING
    RETURNING id INTO v_existing;

    IF v_existing IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'result', 'duplicate', 'fingerprint', v_fp);
    END IF;

    IF v_code IS NULL OR v_code NOT IN (-1, 0, 1, 2, 3, 4, 5) THEN
        UPDATE private.sports_settlement_events
        SET result = 'unknown'
        WHERE fingerprint = v_fp
          AND provider = v_provider;
        RETURN jsonb_build_object('ok', true, 'result', 'unknown', 'fingerprint', v_fp);
    END IF;

    IF v_code = 0 THEN
        UPDATE private.sports_settlement_events
        SET result = 'ignored'
        WHERE fingerprint = v_fp
          AND provider = v_provider;
        RETURN jsonb_build_object('ok', true, 'result', 'ignored', 'fingerprint', v_fp);
    END IF;

    FOR v_leg IN
        SELECT l.*
        FROM private.sports_bet_legs AS l
        WHERE l.provider = v_provider
          AND l.fixture_id = v_fixture
          AND l.outcome_id = v_outcome
          AND (
            v_market_key = ''
            OR l.market_key = v_market_key
            OR (v_market_id <> '' AND l.market_id = v_market_id)
          )
    LOOP
        SELECT b.*
        INTO v_bet
        FROM private.sports_bets AS b
        WHERE b.id = v_leg.bet_id
        FOR UPDATE;

        IF NOT FOUND THEN
            CONTINUE;
        END IF;
        v_matched := v_matched + 1;

        UPDATE private.sports_bet_legs
        SET settlement_code = v_code,
            settlement_fingerprint = v_fp
        WHERE id = v_leg.id;

        IF v_bet.mode = 'express' THEN
            IF EXISTS (
                SELECT 1 FROM private.sports_bet_legs AS x
                WHERE x.bet_id = v_bet.id
                  AND (x.settlement_code IS NULL OR x.settlement_code = 0)
            ) AND v_code <> -1 THEN
                v_result := 'ignored';
                CONTINUE;
            END IF;
        END IF;

        IF v_code = -1 THEN
            IF v_bet.last_applied_settlement_code = -1
               AND COALESCE(v_bet.last_payout_amount, 0) = 0 THEN
                v_result := 'duplicate';
                UPDATE private.sports_settlement_events
                SET matched_bet_id = v_bet.id,
                    result = 'duplicate',
                    payout_amount = 0
                WHERE fingerprint = v_fp
                  AND provider = v_provider;
                CONTINUE;
            END IF;
            IF COALESCE(v_bet.last_payout_amount, 0) > 0 THEN
                v_ledger := private.sports_debit(
                    v_bet.wallet_id,
                    v_bet.last_payout_amount,
                    'sports-reverse:' || v_bet.id::TEXT || ':' || v_provider || ':' || v_fp,
                    v_bet.id,
                    'type35',
                    jsonb_build_object('phase', 'reversal', 'code', -1)
                );
                v_result := 'reversed';
            ELSIF v_bet.settlement_state = 'unsettled' THEN
                v_ledger := private.sports_credit(
                    v_bet.wallet_id,
                    v_bet.stake,
                    'CASINO_REFUND',
                    'sports-void:' || v_bet.id::TEXT || ':' || v_provider || ':' || v_fp,
                    v_bet.id,
                    'type35',
                    jsonb_build_object('phase', 'cancelled', 'code', -1)
                );
                v_payout := v_bet.stake;
                v_result := 'applied';
            ELSE
                v_result := 'reversed';
            END IF;
            UPDATE private.sports_bets
            SET status = 'cancelled',
                settlement_state = 'cancelled',
                provider_settlement_code = -1,
                last_applied_settlement_code = -1,
                last_payout_amount = 0,
                last_settlement_fingerprint = v_fp,
                last_settlement_ledger_id = COALESCE(v_ledger, last_settlement_ledger_id),
                settled_at = pg_catalog.now(),
                updated_at = pg_catalog.now()
            WHERE id = v_bet.id;
        ELSE
            v_payout := COALESCE(private.sports_outcome_payout(v_bet.stake, v_bet.accepted_odds, v_code), 0);
            IF v_bet.mode = 'express' THEN
                v_payout := v_bet.stake;
                FOR v_leg IN
                    SELECT * FROM private.sports_bet_legs WHERE bet_id = v_bet.id
                LOOP
                    IF v_leg.settlement_code IS NULL OR v_leg.settlement_code = 0 THEN
                        v_payout := NULL;
                        EXIT;
                    END IF;
                    IF v_leg.settlement_code NOT IN (-1, 1, 2, 3, 4, 5) THEN
                        UPDATE private.sports_settlement_events
                        SET result = 'unknown', matched_bet_id = v_bet.id
                        WHERE fingerprint = v_fp
                          AND provider = v_provider;
                        RETURN jsonb_build_object('ok', true, 'result', 'unknown', 'betId', v_bet.id);
                    END IF;
                    IF v_leg.settlement_code IN (-1, 3) THEN
                        CONTINUE;
                    ELSIF v_leg.settlement_code = 1 THEN
                        v_payout := 0;
                    ELSIF v_leg.settlement_code = 2 THEN
                        v_payout := private.game_money(v_payout * v_leg.accepted_odds);
                    ELSIF v_leg.settlement_code = 4 THEN
                        v_payout := private.game_money(v_payout / 2);
                    ELSIF v_leg.settlement_code = 5 THEN
                        v_payout := private.game_money((v_payout / 2) * v_leg.accepted_odds + (v_payout / 2));
                    END IF;
                END LOOP;
                IF v_payout IS NULL THEN
                    v_result := 'ignored';
                    CONTINUE;
                END IF;
            END IF;

            IF v_bet.last_applied_settlement_code IS NOT DISTINCT FROM v_code
               AND COALESCE(v_bet.last_payout_amount, 0) = COALESCE(v_payout, 0)
               AND v_bet.settlement_state IS DISTINCT FROM 'unsettled' THEN
                v_result := 'duplicate';
                UPDATE private.sports_settlement_events
                SET matched_bet_id = v_bet.id,
                    result = 'duplicate',
                    payout_amount = 0
                WHERE fingerprint = v_fp
                  AND provider = v_provider;
                CONTINUE;
            END IF;

            IF COALESCE(v_bet.last_payout_amount, 0) > 0
               AND v_bet.last_applied_settlement_code IS DISTINCT FROM v_code THEN
                v_ledger := private.sports_debit(
                    v_bet.wallet_id,
                    v_bet.last_payout_amount,
                    'sports-reverse:' || v_bet.id::TEXT || ':' || v_provider || ':' || v_fp,
                    v_bet.id,
                    'type35',
                    jsonb_build_object('phase', 'correction-reversal')
                );
                v_result := 'corrected';
            ELSE
                v_result := 'applied';
            END IF;

            IF v_payout > 0 THEN
                IF v_code = 3 THEN
                    v_op := 'CASINO_REFUND';
                ELSE
                    v_op := 'CASINO_WIN';
                END IF;
                v_ledger := private.sports_credit(
                    v_bet.wallet_id,
                    v_payout,
                    v_op,
                    'sports-settle:' || v_bet.id::TEXT || ':' || v_provider || ':' || v_fp,
                    v_bet.id,
                    'type35',
                    jsonb_build_object('phase', 'settlement', 'code', v_code)
                );
            END IF;

            UPDATE private.sports_bets
            SET status = 'settled',
                settlement_state = private.sports_state_from_code(v_code),
                provider_settlement_code = v_code,
                last_applied_settlement_code = v_code,
                last_payout_amount = COALESCE(v_payout, 0),
                last_settlement_fingerprint = v_fp,
                last_settlement_ledger_id = COALESCE(v_ledger, last_settlement_ledger_id),
                settled_at = pg_catalog.now(),
                updated_at = pg_catalog.now()
            WHERE id = v_bet.id;
        END IF;

        UPDATE private.sports_settlement_events
        SET matched_bet_id = v_bet.id,
            result = v_result,
            payout_amount = COALESCE(v_payout, 0)
        WHERE fingerprint = v_fp
          AND provider = v_provider;
    END LOOP;

    IF v_matched = 0 THEN
        UPDATE private.sports_settlement_events
        SET result = 'unmatched'
        WHERE fingerprint = v_fp
          AND provider = v_provider;
        RETURN jsonb_build_object('ok', true, 'result', 'unmatched', 'fingerprint', v_fp);
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'result', v_result,
        'fingerprint', v_fp,
        'matched', v_matched,
        'payout', COALESCE(v_payout, 0)
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.sports_apply_one(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sports_apply_one(JSONB) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.sports_apply_settlement(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sports_apply_settlement(JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sports_apply_settlement(JSONB) TO service_role;

COMMENT ON FUNCTION public.sports_apply_settlement(JSONB) IS
'Service-role sports settlement. Each item requires non-empty provider. Matches provider + FixtureId + market identity + outcomeId. Never deletes ledger history.';

COMMIT;
