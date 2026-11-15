BEGIN;
SET LOCAL lock_timeout = '5s';

-- Retire the single-player stake cap. New stakes follow p_new_debits; credits and refunds do not.
CREATE OR REPLACE FUNCTION public.softaggregator_apply_callback(
    p_session uuid, p_call text, p_fingerprint text, p_action text, p_amount bigint,
    p_rollback boolean, p_game text, p_round text, p_new_debits boolean,
    p_only_player uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_session private.softaggregator_sessions%ROWTYPE;
    v_wallet private.wallet_accounts%ROWTYPE;
    v_prior private.softaggregator_wallet_calls%ROWTYPE;
    v_balance bigint;
    v_delta numeric;
    v_error integer := 0;
    v_entry uuid;
    v_available numeric;
    v_op text;
    v_round_net numeric;
    v_adjusted numeric;
    v_original_debit text;
    v_attribution_ref text;
BEGIN
    IF p_call IS NULL OR p_call !~ '^[a-f0-9]{64}$' OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$'
       OR p_action IS NULL OR p_action NOT IN ('balance','debit','credit')
       OR p_amount IS NULL OR p_amount NOT BETWEEN 0 AND 1000000000 OR p_rollback IS NULL THEN
        RETURN jsonb_build_object('error', 2, 'balance', 0);
    END IF;

    -- Serialize duplicate provider IDs before taking the shared Wallet Core lock.
    PERFORM pg_advisory_xact_lock(hashtextextended('softaggregator:' || p_call, 0));
    SELECT * INTO v_prior FROM private.softaggregator_wallet_calls WHERE call_hash = p_call;
    IF FOUND THEN
        IF v_prior.session_id IS DISTINCT FROM p_session OR v_prior.fingerprint <> p_fingerprint THEN
            RETURN jsonb_build_object('error', 2, 'balance', 0);
        END IF;
        RETURN jsonb_build_object('error', v_prior.error, 'balance', v_prior.balance_minor);
    END IF;
    SELECT * INTO v_session FROM private.softaggregator_sessions WHERE id = p_session;
    IF NOT FOUND OR (p_action <> 'balance' AND (p_game IS DISTINCT FROM v_session.provider_game_id
        OR p_round IS NULL OR char_length(p_round) NOT BETWEEN 1 AND 200)) THEN
        RETURN jsonb_build_object('error', 2, 'balance', 0);
    END IF;

    SELECT * INTO v_wallet FROM private.wallet_accounts WHERE wallet_id = v_session.wallet_id FOR UPDATE;
    IF NOT FOUND OR v_wallet.owner_user_id IS DISTINCT FROM v_session.player_user_id OR v_wallet.currency <> 'TMTM' THEN
        RETURN jsonb_build_object('error', 2, 'balance', 0);
    END IF;
    IF p_action = 'debit' AND NOT p_rollback THEN
        IF p_new_debits IS DISTINCT FROM true
           OR clock_timestamp() >= v_session.debit_until
           OR v_wallet.status <> 'active' OR v_wallet.migration_state NOT IN ('staging','active') THEN
            RETURN jsonb_build_object('error', 2, 'balance', 0);
        END IF;
        PERFORM private.require_player_external_casino_allowed(v_session.player_user_id);
        IF NOT EXISTS (
            SELECT 1 FROM private.player_manual_verification_requests k
            JOIN private.player_personal_data d ON d.player_user_id = k.player_user_id
            JOIN public.profiles p ON p.id = k.player_user_id AND p.is_blocked IS NOT TRUE
            WHERE k.player_user_id = v_session.player_user_id AND k.status = 'VERIFIED'
                AND d.date_of_birth <= (CURRENT_DATE - interval '18 years')::date
                AND d.residence_country_code ~ '^[A-Z]{2}$'
        ) THEN
            RETURN jsonb_build_object('error', 2, 'balance', 0);
        END IF;
    END IF;

    v_available := v_wallet.available_balance;
    v_balance := private.softaggregator_usd_minor(v_available, v_session.usdt_tmt, v_session.usdt_usd);
    IF p_action <> 'balance' AND p_amount <> 0 THEN
        IF v_session.debit_until = '-infinity'::timestamptz THEN
            RETURN jsonb_build_object('error', 2, 'balance', 0);
        END IF;

        -- Round each direction's cumulative net, then post only the change. A
        -- partial or full reversal recovers the exact recorded amount in TMT.
        SELECT COALESCE(sum(CASE WHEN rollback THEN -provider_amount_minor ELSE provider_amount_minor END), 0)
          INTO v_round_net FROM private.softaggregator_wallet_calls
          WHERE session_id = p_session AND provider_round_id = p_round AND error = 0
            AND provider_amount_minor > 0 AND ((action = p_action AND rollback = p_rollback)
              OR (action <> p_action AND rollback <> p_rollback));
        v_adjusted := v_round_net + CASE WHEN p_rollback THEN -p_amount ELSE p_amount END;
        IF v_adjusted < 0 THEN RETURN jsonb_build_object('error', 2, 'balance', 0); END IF;
        v_delta := abs(div(2 * v_adjusted * v_session.usdt_tmt + v_session.usdt_usd, 2 * v_session.usdt_usd) -
            div(2 * v_round_net * v_session.usdt_tmt + v_session.usdt_usd, 2 * v_session.usdt_usd)) * 0.01;
        IF p_action = 'debit' THEN
            v_delta := -v_delta;
            v_op := 'CASINO_BET';
        ELSIF p_rollback THEN
            v_op := 'CASINO_REFUND';
        ELSE
            v_op := 'CASINO_WIN';
        END IF;
        IF v_available + v_delta < 0 OR
            (p_action = 'debit' AND NOT p_rollback AND p_amount > v_balance) THEN
            -- A rejected correction can be retried after funds are restored.
            IF p_rollback THEN RETURN jsonb_build_object('error', 1, 'balance', v_balance); END IF;
            v_error := 1;
        ELSIF v_delta <> 0 THEN
            IF p_action = 'credit' THEN
                SELECT CASE WHEN count(*) = 1 THEN min(c.call_hash) END INTO v_original_debit
                FROM private.softaggregator_wallet_calls c
                WHERE c.session_id = p_session AND c.provider_round_id = p_round
                  AND c.action = 'debit' AND NOT c.rollback AND c.error = 0 AND c.ledger_id IS NOT NULL;
                IF v_original_debit IS NULL THEN
                    -- No unique original debit: the shared attribution trigger
                    -- handles the credit as uncorrelated, with no cashier guess.
                    v_attribution_ref := p_call;
                ELSE
                    v_attribution_ref := v_original_debit;
                END IF;
            END IF;
            SELECT a.ledger_id, a.available_balance INTO STRICT v_entry, v_available
            FROM private.apply_wallet_entry(v_session.wallet_id, v_delta, 0, v_op, 'casino',
                'softaggregator:' || p_call, 'softaggregator', p_call, 'system', 'softaggregator',
                jsonb_build_object('provider_currency', 'USD', 'provider_amount_minor', p_amount,
                    'wallet_currency', 'TMT', 'usdt_tmt', v_session.usdt_tmt::text,
                    'usdt_usd', v_session.usdt_usd::text, 'session_id', p_session,
                    'game_id', p_game, 'round_id', p_round, 'rollback', p_rollback,
                    'related_transaction_id', v_attribution_ref)) a;
            v_balance := private.softaggregator_usd_minor(v_available, v_session.usdt_tmt, v_session.usdt_usd);
        END IF;
    END IF;

    INSERT INTO private.softaggregator_wallet_calls
      (call_hash, session_id, fingerprint, action, rollback, provider_currency, provider_amount_minor, provider_round_id, ledger_id, error, balance_minor)
    VALUES (p_call, p_session, p_fingerprint, p_action, p_rollback, 'USD', p_amount, COALESCE(p_round, ''), v_entry, v_error, v_balance);
    RETURN jsonb_build_object('error', v_error, 'balance', v_balance);
END
$$;

REVOKE ALL ON FUNCTION public.softaggregator_apply_callback(uuid,text,text,text,bigint,boolean,text,text,boolean,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.softaggregator_apply_callback(uuid,text,text,text,bigint,boolean,text,text,boolean,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
