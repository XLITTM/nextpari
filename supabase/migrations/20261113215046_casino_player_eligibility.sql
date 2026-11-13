BEGIN;

CREATE TABLE private.player_registration_age_declarations (
    player_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    terms_version text NOT NULL CHECK (char_length(terms_version) BETWEEN 1 AND 80),
    registration_method text NOT NULL CHECK (registration_method IN ('email', 'phone', 'one_click')),
    declared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (player_user_id, terms_version)
);

-- Configure a country only after the operator confirms its licence and provider terms.
CREATE TABLE private.casino_jurisdiction_policies (
    country text PRIMARY KEY CHECK (country ~ '^[A-Z]{2}$'),
    enabled boolean NOT NULL DEFAULT false,
    policy_version text NOT NULL CHECK (char_length(btrim(policy_version)) > 0),
    approval_reference text NOT NULL CHECK (char_length(btrim(approval_reference)) > 0),
    valid_until timestamptz NOT NULL,
    declaration_version text NOT NULL CHECK (char_length(btrim(declaration_version)) > 0),
    minimum_age smallint NOT NULL CHECK (minimum_age BETWEEN 18 AND 30),
    age_check text NOT NULL CHECK (age_check IN ('declaration', 'independent')),
    identity_required boolean NOT NULL,
    aml_required boolean NOT NULL,
    cashier_age_allowed boolean NOT NULL DEFAULT false,
    CHECK (age_check <> 'declaration' OR minimum_age = 18)
);

-- One current outcome per check. Store an opaque audit reference, never documents.
CREATE TABLE private.casino_player_evidence (
    player_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    check_kind text NOT NULL CHECK (check_kind IN ('age', 'identity', 'jurisdiction', 'self_exclusion', 'aml', 'withdrawal')),
    source text NOT NULL CHECK (source IN ('verification_provider', 'staff_review', 'cashier', 'compliance_service')),
    evidence_reference text NOT NULL CHECK (char_length(btrim(evidence_reference)) BETWEEN 1 AND 200),
    passed boolean NOT NULL,
    checked_at timestamptz NOT NULL,
    valid_until timestamptz NOT NULL CHECK (valid_until > checked_at),
    country text CHECK (country ~ '^[A-Z]{2}$'),
    verified_minimum_age smallint CHECK (verified_minimum_age BETWEEN 18 AND 120),
    CHECK (source <> 'cashier' OR check_kind = 'age'),
    CHECK (check_kind <> 'jurisdiction' OR NOT passed OR country IS NOT NULL),
    CHECK (check_kind <> 'age' OR NOT passed OR verified_minimum_age IS NOT NULL),
    PRIMARY KEY (player_user_id, check_kind),
    UNIQUE (source, check_kind, evidence_reference)
);

ALTER TABLE private.player_registration_age_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.casino_jurisdiction_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.casino_player_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.player_registration_age_declarations, private.casino_jurisdiction_policies,
    private.casino_player_evidence FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.record_registration_age_declaration(p_player uuid, p_method text, p_terms_version text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
    INSERT INTO private.player_registration_age_declarations (player_user_id, terms_version, registration_method)
    VALUES (p_player, p_terms_version, p_method)
    ON CONFLICT (player_user_id, terms_version) DO NOTHING
$$;

-- Trusted backend only. An adapter must authenticate the issuer and bind its
-- result to the correct NextPari account before submitting normalized evidence.
CREATE FUNCTION public.record_casino_player_evidence(
    p_player uuid, p_kind text, p_source text, p_reference text, p_passed boolean,
    p_checked_at timestamptz, p_valid_until timestamptz, p_country text DEFAULT NULL,
    p_verified_minimum_age smallint DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF p_checked_at > clock_timestamp() OR NOT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = p_player
    ) THEN
        RAISE EXCEPTION 'CASINO_EVIDENCE_INVALID';
    END IF;
    INSERT INTO private.casino_player_evidence AS current_evidence (
        player_user_id, check_kind, source, evidence_reference, passed, checked_at, valid_until, country, verified_minimum_age
    ) VALUES (
        p_player, p_kind, p_source, p_reference, p_passed, p_checked_at, p_valid_until, p_country, p_verified_minimum_age
    )
    ON CONFLICT (player_user_id, check_kind) DO UPDATE SET
        source = EXCLUDED.source, evidence_reference = EXCLUDED.evidence_reference, passed = EXCLUDED.passed,
        checked_at = EXCLUDED.checked_at, valid_until = EXCLUDED.valid_until, country = EXCLUDED.country,
        verified_minimum_age = EXCLUDED.verified_minimum_age
    WHERE current_evidence.checked_at < EXCLUDED.checked_at
      AND (EXCLUDED.source <> 'cashier' OR (current_evidence.passed AND current_evidence.valid_until <= now())
           OR (current_evidence.source = 'cashier' AND current_evidence.passed));
    RETURN FOUND;
END
$$;

CREATE FUNCTION private.casino_eligibility(p_player uuid)
RETURNS TABLE (country text, age_declared boolean, age_verified boolean, identity_verified boolean,
               casino_eligible boolean, withdrawal_verified boolean)
LANGUAGE sql STABLE SET search_path = '' AS $$
    WITH checks AS (
        SELECT * FROM private.casino_player_evidence WHERE player_user_id = p_player
    ), facts AS (
        SELECT j.country,
            p.enabled IS TRUE AND p.valid_until > now() AND
                (d.residence_country_code IS NULL OR d.residence_country_code = j.country) AS approved_policy,
            p.age_check, p.identity_required, p.aml_required,
            EXISTS (SELECT 1 FROM private.player_registration_age_declarations a
                    WHERE a.player_user_id = p_player) AS declared,
            EXISTS (SELECT 1 FROM private.player_registration_age_declarations a
                    WHERE a.player_user_id = p_player AND a.terms_version = p.declaration_version) AS current_declaration,
            coalesce(a.passed AND a.valid_until > now()
                AND a.verified_minimum_age >= coalesce(p.minimum_age, 18)
                AND (a.source <> 'cashier' OR p.cashier_age_allowed), false) AS age_ok,
            coalesce(i.passed AND i.valid_until > now(), false) AS identity_ok,
            coalesce(w.passed AND w.valid_until > now(), false) AS withdrawal_ok,
            coalesce(e.passed AND e.valid_until > now(), false) AS exclusion_clear,
            coalesce(m.passed AND m.valid_until > now(), false) AS aml_clear,
            NOT EXISTS (SELECT 1 FROM checks c WHERE NOT c.passed AND c.check_kind IN ('age','identity','aml')) AS no_negative_evidence,
            (d.date_of_birth IS NULL OR d.date_of_birth <=
                (CURRENT_DATE - make_interval(years => coalesce(p.minimum_age, 18)))::date) AS no_underage_conflict,
            profile.id IS NOT NULL AND profile.is_blocked IS NOT TRUE
                AND NOT EXISTS (SELECT 1 FROM private.staff_accounts s WHERE s.auth_user_id = p_player) AS active_player
        FROM (SELECT p_player AS id) AS player
        LEFT JOIN checks j ON j.check_kind = 'jurisdiction' AND j.passed AND j.valid_until > now()
        LEFT JOIN private.casino_jurisdiction_policies p ON p.country = j.country
        LEFT JOIN private.player_personal_data d ON d.player_user_id = player.id
        LEFT JOIN public.profiles profile ON profile.id = player.id
        LEFT JOIN checks a ON a.check_kind = 'age'
        LEFT JOIN checks i ON i.check_kind = 'identity'
        LEFT JOIN checks w ON w.check_kind = 'withdrawal'
        LEFT JOIN checks e ON e.check_kind = 'self_exclusion'
        LEFT JOIN checks m ON m.check_kind = 'aml'
    )
    SELECT facts.country, declared, age_ok, identity_ok,
           coalesce(active_player AND approved_policy AND current_declaration AND exclusion_clear
             AND no_underage_conflict AND no_negative_evidence
             AND NOT private.is_player_security_restricted(p_player)
             AND (age_check = 'declaration' OR age_ok)
             AND (NOT identity_required OR identity_ok) AND (NOT aml_required OR aml_clear), false),
           withdrawal_ok
    FROM facts
$$;

CREATE FUNCTION public.player_casino_eligibility(p_player uuid)
RETURNS TABLE (country text, age_declared boolean, age_verified boolean, identity_verified boolean,
               casino_eligible boolean, withdrawal_verified boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT * FROM private.casino_eligibility(p_player)
$$;

REVOKE ALL ON FUNCTION private.casino_eligibility(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_registration_age_declaration(uuid,text,text),
    public.player_casino_eligibility(uuid),
    public.record_casino_player_evidence(uuid,text,text,text,boolean,timestamptz,timestamptz,text,smallint)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_registration_age_declaration(uuid,text,text),
    public.player_casino_eligibility(uuid),
    public.record_casino_player_evidence(uuid,text,text,text,boolean,timestamptz,timestamptz,text,smallint)
    TO service_role;

ALTER TABLE private.softaggregator_sessions
    ADD COLUMN jurisdiction_country text CHECK (jurisdiction_country ~ '^[A-Z]{2}$');

CREATE OR REPLACE FUNCTION public.softaggregator_session(
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
    SELECT e.country INTO v_country
    FROM private.casino_eligibility(p_player) e WHERE e.casino_eligible;
    IF v_country IS NULL THEN
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
        IF p_rate_version IS DISTINCT FROM v_version THEN
            RAISE EXCEPTION 'SOFTAGGREGATOR_RATE_CHANGED';
        END IF;
        UPDATE private.softaggregator_sessions
        SET debit_until = clock_timestamp() + interval '2 hours'
        WHERE id = p_session AND player_user_id = p_player AND provider_game_id = p_game
          AND rate_version = p_rate_version AND wallet_id = v_wallet.wallet_id
          AND jurisdiction_country = v_country;
        IF NOT FOUND THEN RAISE EXCEPTION 'SOFTAGGREGATOR_SESSION_CONFLICT'; END IF;
    ELSIF p_session IS NOT NULL THEN
        IF p_rate_version IS DISTINCT FROM v_version THEN
            RAISE EXCEPTION 'SOFTAGGREGATOR_RATE_CHANGED';
        END IF;
        INSERT INTO private.softaggregator_sessions
          (id, player_user_id, wallet_id, provider_game_id, usdt_tmt, usdt_usd, rate_version, debit_until, jurisdiction_country)
        VALUES (p_session, p_player, v_wallet.wallet_id, p_game, v_tmt.rate, v_usd.rate, v_version,
          '-infinity'::timestamptz, v_country)
        ON CONFLICT (id) DO UPDATE SET debit_until = softaggregator_sessions.debit_until
        WHERE softaggregator_sessions.player_user_id = EXCLUDED.player_user_id
          AND softaggregator_sessions.wallet_id = EXCLUDED.wallet_id
          AND softaggregator_sessions.provider_game_id = EXCLUDED.provider_game_id
          AND softaggregator_sessions.rate_version = EXCLUDED.rate_version
          AND softaggregator_sessions.jurisdiction_country = EXCLUDED.jurisdiction_country;
        IF NOT FOUND THEN RAISE EXCEPTION 'SOFTAGGREGATOR_SESSION_CONFLICT'; END IF;
    END IF;
    RETURN jsonb_build_object('rateVersion', v_version, 'usdtTmt', v_tmt.rate::text,
      'usdtUsd', v_usd.rate::text, 'balanceUsdMinor',
      private.softaggregator_usd_minor(v_wallet.available_balance, v_tmt.rate, v_usd.rate),
      'country', v_country, 'eligibilityPolicyApplied', true);
END
$$;

CREATE OR REPLACE FUNCTION public.softaggregator_apply_callback(
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
        IF p_new_debits IS DISTINCT FROM true OR clock_timestamp() >= v_session.debit_until
           OR v_wallet.status <> 'active' OR v_wallet.migration_state NOT IN ('staging','active') THEN
            RETURN jsonb_build_object('error', 2, 'balance', 0);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM private.casino_eligibility(v_session.player_user_id) e
            WHERE e.casino_eligible AND e.country = v_session.jurisdiction_country) THEN
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

COMMIT;
