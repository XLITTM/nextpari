BEGIN;

-- Provider bindings and callback outcomes only. All money stays in Wallet Core.
CREATE TABLE private.softaggregator_sessions (
    id uuid PRIMARY KEY,
    player_user_id uuid NOT NULL,
    wallet_id uuid NOT NULL REFERENCES private.wallet_accounts(wallet_id),
    provider_game_id text NOT NULL CHECK (char_length(provider_game_id) BETWEEN 1 AND 512),
    usdt_tmt numeric NOT NULL CHECK (usdt_tmt > 0 AND usdt_tmt < 1000000000),
    usdt_usd numeric NOT NULL CHECK (usdt_usd > 0 AND usdt_usd < 1000000000),
    rate_version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    debit_until timestamptz NOT NULL
);

CREATE INDEX softaggregator_sessions_wallet_idx ON private.softaggregator_sessions (wallet_id, created_at DESC);

CREATE TABLE private.softaggregator_wallet_calls (
    call_hash text PRIMARY KEY CHECK (call_hash ~ '^[a-f0-9]{64}$'),
    session_id uuid NOT NULL REFERENCES private.softaggregator_sessions(id),
    fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
    action text NOT NULL CHECK (action IN ('balance', 'debit', 'credit')),
    rollback boolean NOT NULL,
    provider_currency text NOT NULL CHECK (provider_currency = 'USD'),
    provider_amount_minor bigint NOT NULL CHECK (provider_amount_minor >= 0),
    provider_round_id text NOT NULL,
    ledger_id uuid REFERENCES private.wallet_ledger(id),
    error integer NOT NULL CHECK (error IN (0, 1, 2)),
    balance_minor bigint NOT NULL CHECK (balance_minor >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX softaggregator_wallet_calls_session_idx ON private.softaggregator_wallet_calls (session_id, created_at);
CREATE INDEX softaggregator_wallet_calls_round_idx ON private.softaggregator_wallet_calls (session_id, provider_round_id)
  WHERE error = 0 AND provider_amount_minor > 0;
ALTER TABLE private.softaggregator_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.softaggregator_wallet_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.softaggregator_sessions, private.softaggregator_wallet_calls FROM PUBLIC, anon, authenticated, service_role;

-- div on integer-valued NUMERIC operands avoids rounding in NUMERIC division.
CREATE FUNCTION private.softaggregator_usd_minor(p_tmt numeric, p_usdt_tmt numeric, p_usdt_usd numeric)
RETURNS bigint LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
    SELECT LEAST(9007199254740991::numeric, div(p_tmt * 100 * p_usdt_usd, p_usdt_tmt))::bigint
$$;

CREATE FUNCTION public.softaggregator_session(
    p_player uuid, p_session uuid DEFAULT NULL, p_game text DEFAULT NULL,
    p_rate_version text DEFAULT NULL, p_confirm_launch boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_wallet private.wallet_accounts%ROWTYPE;
    v_tmt private.usdt_deposit_rates%ROWTYPE;
    v_usd private.usdt_deposit_rates%ROWTYPE;
    v_version text;
    v_country text;
BEGIN
    PERFORM private.require_player_external_casino_allowed(p_player);
    SELECT d.residence_country_code INTO v_country
      FROM private.player_personal_data d
      JOIN private.player_manual_verification_requests k ON k.player_user_id = d.player_user_id
      WHERE d.player_user_id = p_player AND k.status = 'VERIFIED'
        AND d.date_of_birth <= (CURRENT_DATE - interval '18 years')::date;
    IF v_country IS NULL OR v_country !~ '^[A-Z]{2}$' THEN
        RAISE EXCEPTION 'SOFTAGGREGATOR_PLAYER_INELIGIBLE';
    END IF;

    SELECT * INTO STRICT v_wallet FROM private.wallet_accounts
      WHERE owner_user_id = p_player AND currency = 'TMTM';
    IF v_wallet.status <> 'active' OR v_wallet.migration_state NOT IN ('staging', 'active') THEN
        RAISE EXCEPTION 'SOFTAGGREGATOR_WALLET_UNAVAILABLE';
    END IF;
    SELECT * INTO v_tmt FROM private.usdt_deposit_rates WHERE target_currency_code = 'TMT' FOR SHARE;
    SELECT * INTO v_usd FROM private.usdt_deposit_rates WHERE target_currency_code = 'USD' FOR SHARE;
    IF v_tmt.enabled IS DISTINCT FROM true OR v_usd.enabled IS DISTINCT FROM true
       OR v_tmt.rate IS NULL OR v_usd.rate IS NULL
       OR v_tmt.rate <= 0 OR v_usd.rate <= 0 OR v_tmt.rate >= 1000000000 OR v_usd.rate >= 1000000000 THEN
        RAISE EXCEPTION 'SOFTAGGREGATOR_RATE_UNAVAILABLE';
    END IF;
    v_version := md5(jsonb_build_array(v_tmt.rate::text, extract(epoch FROM v_tmt.updated_at), v_usd.rate::text, extract(epoch FROM v_usd.updated_at))::text);
    IF p_confirm_launch THEN
        UPDATE private.softaggregator_sessions
        SET debit_until = clock_timestamp() + interval '2 hours'
        WHERE id = p_session AND player_user_id = p_player AND provider_game_id = p_game
          AND rate_version = p_rate_version AND wallet_id = v_wallet.wallet_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'SOFTAGGREGATOR_SESSION_CONFLICT'; END IF;
    ELSIF p_session IS NOT NULL THEN
        IF p_rate_version IS DISTINCT FROM v_version THEN
            RAISE EXCEPTION 'SOFTAGGREGATOR_RATE_CHANGED';
        END IF;
        INSERT INTO private.softaggregator_sessions
          (id, player_user_id, wallet_id, provider_game_id, usdt_tmt, usdt_usd, rate_version, debit_until)
        VALUES (p_session, p_player, v_wallet.wallet_id, p_game, v_tmt.rate, v_usd.rate, v_version,
          '-infinity'::timestamptz)
        ON CONFLICT (id) DO UPDATE SET debit_until = softaggregator_sessions.debit_until
        WHERE softaggregator_sessions.player_user_id = EXCLUDED.player_user_id
          AND softaggregator_sessions.wallet_id = EXCLUDED.wallet_id
          AND softaggregator_sessions.provider_game_id = EXCLUDED.provider_game_id
          AND softaggregator_sessions.rate_version = EXCLUDED.rate_version;
        IF NOT FOUND THEN RAISE EXCEPTION 'SOFTAGGREGATOR_SESSION_CONFLICT'; END IF;
    END IF;
    RETURN jsonb_build_object('rateVersion', v_version, 'usdtTmt', v_tmt.rate::text,
      'usdtUsd', v_usd.rate::text, 'balanceUsdMinor',
      private.softaggregator_usd_minor(v_wallet.available_balance, v_tmt.rate, v_usd.rate),
      'country', v_country);
END
$$;

CREATE FUNCTION public.softaggregator_apply_callback(
    p_session uuid, p_call text, p_fingerprint text, p_action text, p_amount bigint,
    p_rollback boolean, p_game text, p_round text, p_new_debits boolean
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
        IF p_new_debits IS DISTINCT FROM true OR clock_timestamp() >= v_session.debit_until
           OR v_wallet.status <> 'active' OR v_wallet.migration_state NOT IN ('staging','active') THEN
            RETURN jsonb_build_object('error', 2, 'balance', 0);
        END IF;
        PERFORM private.require_player_external_casino_allowed(v_session.player_user_id);
        IF NOT EXISTS (SELECT 1 FROM private.player_manual_verification_requests
            WHERE player_user_id = v_session.player_user_id AND status = 'VERIFIED') THEN
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
            END IF;
            SELECT a.ledger_id, a.available_balance INTO STRICT v_entry, v_available
            FROM private.apply_wallet_entry(v_session.wallet_id, v_delta, 0, v_op, 'casino',
                'softaggregator:' || p_call, 'softaggregator', p_call, 'system', 'softaggregator',
                jsonb_build_object('provider_currency', 'USD', 'provider_amount_minor', p_amount,
                    'wallet_currency', 'TMT', 'usdt_tmt', v_session.usdt_tmt::text,
                    'usdt_usd', v_session.usdt_usd::text, 'session_id', p_session,
                    'game_id', p_game, 'round_id', p_round, 'rollback', p_rollback,
                    'related_transaction_id', v_original_debit)) a;
            v_balance := private.softaggregator_usd_minor(v_available, v_session.usdt_tmt, v_session.usdt_usd);
        END IF;
    END IF;

    INSERT INTO private.softaggregator_wallet_calls
      (call_hash, session_id, fingerprint, action, rollback, provider_currency, provider_amount_minor, provider_round_id, ledger_id, error, balance_minor)
    VALUES (p_call, p_session, p_fingerprint, p_action, p_rollback, 'USD', p_amount, COALESCE(p_round, ''), v_entry, v_error, v_balance);
    RETURN jsonb_build_object('error', v_error, 'balance', v_balance);
END
$$;

REVOKE ALL ON FUNCTION private.softaggregator_usd_minor(numeric,numeric,numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.softaggregator_session(uuid,uuid,text,text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.softaggregator_apply_callback(uuid,text,text,text,bigint,boolean,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.softaggregator_session(uuid,uuid,text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.softaggregator_apply_callback(uuid,text,text,text,bigint,boolean,text,text,boolean) TO service_role;
COMMIT;
