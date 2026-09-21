BEGIN;

-- ============================================================
-- NEXTPARI PHASE 069
-- Sports settlement corrections follow the bet's target cumulative
-- payout. Sequence: after 068 legacy public access lockdown.
-- Repository-only. NOT applied by this change.
--
-- Does NOT edit migration 038.
-- Does NOT rewrite private.apply_wallet_entry or public.wallets.
-- Does NOT change sports placement.
-- Does NOT enable canonical sports betting.
--
-- Defect in private.sports_apply_one (035/038):
-- a previous credit is reversed only when
-- last_applied_settlement_code IS DISTINCT FROM the incoming code,
-- then the whole new target is credited. An express correction can
-- keep the same incoming code while the accumulator target changes
-- (Won+Won 400 -> HalfWon+Won 300 -> HalfWon+HalfWon 225). The second
-- step skipped the reversal and credited 225 on top of 300.
--
-- Rule:
--   previous = sports_bets.last_payout_amount
--   target   = payout of all current leg states
--   delta    = target - previous
--   delta > 0 credit exactly delta
--   delta < 0 debit exactly abs(delta) via private.sports_debit
--   delta = 0 no wallet movement
-- After success last_payout_amount = target.
-- A debit rejected by Wallet Ledger aborts the function. The caller
-- transaction keeps the pre-correction leg and bet rows.
--
-- REMAINING LIVE-GATE BLOCKER:
-- There is no provider-neutral monotonic settlement version.
-- Exact (provider, fingerprint) replays stay idempotent.
-- A later different fingerprint is applied in arrival order even if
-- the provider meant it to be older. That is NOT solved here.
-- Do not enable live sports betting until the selected provider's
-- ordering contract is enforced.
-- ============================================================

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
    v_scan private.sports_bet_legs%ROWTYPE;
    v_matched INTEGER := 0;
    v_result TEXT := 'unmatched';
    v_target NUMERIC(20, 2) := 0;
    v_previous NUMERIC(20, 2) := 0;
    v_delta NUMERIC(20, 2) := 0;
    v_ledger UUID;
    v_op TEXT;
    v_key TEXT;
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

        IF v_bet.mode = 'express' AND v_code <> -1 THEN
            IF EXISTS (
                SELECT 1 FROM private.sports_bet_legs AS x
                WHERE x.bet_id = v_bet.id
                  AND (x.settlement_code IS NULL OR x.settlement_code = 0)
            ) THEN
                v_result := 'ignored';
                CONTINUE;
            END IF;
        END IF;

        v_previous := COALESCE(v_bet.last_payout_amount, 0);

        IF v_code = -1 THEN
            IF v_bet.settlement_state = 'cancelled'
               OR v_bet.last_applied_settlement_code = -1 THEN
                v_target := v_previous;
            ELSIF v_bet.settlement_state = 'unsettled' AND v_previous = 0 THEN
                v_target := v_bet.stake;
            ELSE
                v_target := 0;
            END IF;
        ELSE
            v_target := COALESCE(private.sports_outcome_payout(v_bet.stake, v_bet.accepted_odds, v_code), 0);
            IF v_bet.mode = 'express' THEN
                v_target := v_bet.stake;
                FOR v_scan IN
                    SELECT *
                    FROM private.sports_bet_legs
                    WHERE bet_id = v_bet.id
                    ORDER BY accepted_at, id
                LOOP
                    IF v_scan.settlement_code IS NULL OR v_scan.settlement_code = 0 THEN
                        v_target := NULL;
                        EXIT;
                    END IF;
                    IF v_scan.settlement_code NOT IN (-1, 1, 2, 3, 4, 5) THEN
                        UPDATE private.sports_settlement_events
                        SET result = 'unknown', matched_bet_id = v_bet.id
                        WHERE fingerprint = v_fp
                          AND provider = v_provider;
                        RETURN jsonb_build_object('ok', true, 'result', 'unknown', 'betId', v_bet.id);
                    END IF;
                    IF v_scan.settlement_code IN (-1, 3) THEN
                        CONTINUE;
                    ELSIF v_scan.settlement_code = 1 THEN
                        v_target := 0;
                    ELSIF v_scan.settlement_code = 2 THEN
                        v_target := private.game_money(v_target * v_scan.accepted_odds);
                    ELSIF v_scan.settlement_code = 4 THEN
                        v_target := private.game_money(v_target / 2);
                    ELSIF v_scan.settlement_code = 5 THEN
                        v_target := private.game_money((v_target / 2) * v_scan.accepted_odds + (v_target / 2));
                    END IF;
                END LOOP;
                IF v_target IS NULL THEN
                    v_result := 'ignored';
                    CONTINUE;
                END IF;
            END IF;
        END IF;

        v_delta := private.game_money(COALESCE(v_target, 0) - v_previous);

        IF v_bet.settlement_state IS DISTINCT FROM 'unsettled' AND v_delta = 0 THEN
            v_result := 'duplicate';
            UPDATE private.sports_settlement_events
            SET matched_bet_id = v_bet.id,
                result = 'duplicate',
                payout_amount = COALESCE(v_target, v_previous)
            WHERE fingerprint = v_fp
              AND provider = v_provider;
            CONTINUE;
        END IF;

        -- sports_debit / sports_credit call private.apply_wallet_entry.
        -- A rejected debit (including insufficient available funds) raises
        -- and aborts this function. Do not clip, invent debt, or commit
        -- the new leg/bet economics after a failed money movement.
        IF v_delta < 0 THEN
            v_ledger := private.sports_debit(
                v_bet.wallet_id,
                -v_delta,
                'sports-reverse:' || v_bet.id::TEXT || ':' || v_provider || ':' || v_fp,
                v_bet.id,
                'type35',
                jsonb_build_object('phase', 'cumulative-delta', 'target', v_target, 'previous', v_previous)
            );
            IF v_code = -1 AND COALESCE(v_target, 0) = 0 THEN
                v_result := 'reversed';
            ELSE
                v_result := 'corrected';
            END IF;
        ELSIF v_delta > 0 THEN
            IF v_code = -1 THEN
                v_op := 'CASINO_REFUND';
                v_key := 'sports-void:' || v_bet.id::TEXT || ':' || v_provider || ':' || v_fp;
                v_result := 'applied';
            ELSE
                IF v_code = 3 THEN
                    v_op := 'CASINO_REFUND';
                ELSE
                    v_op := 'CASINO_WIN';
                END IF;
                v_key := 'sports-settle:' || v_bet.id::TEXT || ':' || v_provider || ':' || v_fp;
                IF v_previous > 0 OR v_bet.settlement_state IS DISTINCT FROM 'unsettled' THEN
                    v_result := 'corrected';
                ELSE
                    v_result := 'applied';
                END IF;
            END IF;
            v_ledger := private.sports_credit(
                v_bet.wallet_id,
                v_delta,
                v_op,
                v_key,
                v_bet.id,
                'type35',
                jsonb_build_object('phase', 'cumulative-delta', 'target', v_target, 'previous', v_previous)
            );
        ELSE
            v_result := 'applied';
        END IF;

        UPDATE private.sports_bets
        SET status = CASE WHEN v_code = -1 THEN 'cancelled' ELSE 'settled' END,
            settlement_state = private.sports_state_from_code(v_code),
            provider_settlement_code = v_code,
            last_applied_settlement_code = v_code,
            last_payout_amount = COALESCE(v_target, 0),
            last_settlement_fingerprint = v_fp,
            last_settlement_ledger_id = COALESCE(v_ledger, last_settlement_ledger_id),
            settled_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = v_bet.id;

        UPDATE private.sports_settlement_events
        SET matched_bet_id = v_bet.id,
            result = v_result,
            payout_amount = COALESCE(v_target, 0)
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
        'payout', COALESCE(v_target, 0)
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.sports_apply_one(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sports_apply_one(JSONB) FROM anon, authenticated;

COMMIT;
