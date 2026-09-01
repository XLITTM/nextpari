BEGIN;

-- NEXTPARI PHASE 031
-- Game stability, audited RTP, shared Aviator.
-- WRITE ONLY. Do not execute against production in this task.
-- Does not depend on unapplied migration 028.
-- Does not UPDATE historical settled rounds.
-- Does not change Apples financial math.

ALTER TABLE private.game_rounds
    ADD COLUMN IF NOT EXISTS math_version TEXT,
    ADD COLUMN IF NOT EXISTS session_id UUID;

CREATE TABLE IF NOT EXISTS private.game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_code TEXT NOT NULL REFERENCES private.game_catalog(game_code) ON DELETE RESTRICT,
    state TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    server_seed_hash TEXT NOT NULL,
    nonce BIGINT NOT NULL DEFAULT 1,
    betting_closes_at TIMESTAMPTZ NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    crash_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    public_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    private_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    math_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT game_sessions_state_check
        CHECK (state IN ('betting', 'flying', 'crashed'))
);

DO $fk$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'game_rounds_session_id_fkey'
    ) THEN
        ALTER TABLE private.game_rounds
            ADD CONSTRAINT game_rounds_session_id_fkey
            FOREIGN KEY (session_id) REFERENCES private.game_sessions(id) ON DELETE RESTRICT;
    END IF;
END;
$fk$;

CREATE INDEX IF NOT EXISTS game_sessions_game_created_idx
ON private.game_sessions (game_code, created_at DESC);

CREATE INDEX IF NOT EXISTS game_rounds_session_idx
ON private.game_rounds (session_id)
WHERE session_id IS NOT NULL;

REVOKE ALL ON TABLE private.game_sessions FROM PUBLIC, anon, authenticated;

UPDATE private.game_catalog
SET
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'rtpTarget', 0.875,
        'mathVersion', 'pharaoh-v2-rtp875',
        'prizes', '[
            {"id":"cat","mult":10000,"prizeWeight":70,"hitBps":13},
            {"id":"scroll","mult":1000,"prizeWeight":80,"hitBps":30},
            {"id":"nemes","mult":200,"prizeWeight":100,"hitBps":50},
            {"id":"pyramid","mult":100,"prizeWeight":150,"hitBps":80},
            {"id":"ring","mult":50,"prizeWeight":250,"hitBps":100},
            {"id":"ankh","mult":20,"prizeWeight":350,"hitBps":200},
            {"id":"canopic","mult":10,"prizeWeight":500,"hitBps":300},
            {"id":"lotus","mult":5,"prizeWeight":800,"hitBps":500},
            {"id":"cylinder","mult":4,"prizeWeight":1200,"hitBps":3000},
            {"id":"harp","mult":2,"prizeWeight":2500,"hitBps":5000},
            {"id":"sistrum","mult":1,"prizeWeight":4000,"hitBps":7063}
        ]'::jsonb
    ),
    updated_at = pg_catalog.now()
WHERE game_code = 'pharaoh';

UPDATE private.game_catalog
SET
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'rtpTarget', 0.875,
        'mathVersion', 'dice-v2-rtp875',
        'winMultiplier', 1.72,
        'drawMultiplier', 1.00
    ),
    updated_at = pg_catalog.now()
WHERE game_code = 'dice';

UPDATE private.game_catalog
SET
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'rtpTarget', 0.875,
        'mathVersion', 'blackjack-v2-rtp875',
        'winPayout', 1.84,
        'goldenPayout', 2.00,
        'pushPayout', 1.00
    ),
    updated_at = pg_catalog.now()
WHERE game_code = 'blackjack';

UPDATE private.game_catalog
SET
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'rtpTarget', 0.875,
        'mathVersion', 'crystal-v2-rtp875',
        'payoutScale', 1.00
    ),
    updated_at = pg_catalog.now()
WHERE game_code = 'crystal';

UPDATE private.game_catalog
SET
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'rtpTarget', 0.875,
        'mathVersion', 'aviator-v2-rtp875',
        'rtpNumerator', 0.875,
        'bettingSeconds', 5
    ),
    updated_at = pg_catalog.now()
WHERE game_code = 'aviator';

UPDATE private.game_catalog
SET
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'rtpModel', 'progressive',
        'mathVersion', 'apples-v1-progressive'
    ),
    updated_at = pg_catalog.now()
WHERE game_code = 'apples';


CREATE OR REPLACE FUNCTION private.game_math_version(p_game_code TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT c.config->>'mathVersion'
    FROM private.game_catalog AS c
    WHERE c.game_code = p_game_code;
$$;

CREATE OR REPLACE FUNCTION private.game_round_json(
    p_round private.game_rounds,
    p_balance NUMERIC,
    p_duplicate BOOLEAN,
    p_allowed JSONB DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_hash TEXT := p_round.server_seed_hash;
    v_seed TEXT := CASE
        WHEN p_round.state = 'settled' THEN p_round.server_seed
        ELSE NULL
    END;
    v_session private.game_sessions%ROWTYPE;
BEGIN
    -- Shared Aviator: public proof is the SESSION seed/hash, not the
    -- unrelated per-round seed created at insert. Reveal the session seed
    -- only after the flight has crashed. Historical session_id NULL rounds
    -- keep the legacy per-round seed fields.
    IF p_round.game_code = 'aviator' AND p_round.session_id IS NOT NULL THEN
        SELECT s.* INTO v_session
        FROM private.game_sessions AS s
        WHERE s.id = p_round.session_id;
        IF FOUND THEN
            v_hash := v_session.server_seed_hash;
            v_seed := CASE
                WHEN v_session.state = 'crashed' THEN v_session.server_seed
                ELSE NULL
            END;
        END IF;
    END IF;
    RETURN jsonb_build_object(
        'ok', true,
        'isDuplicate', COALESCE(p_duplicate, false),
        'roundId', p_round.id,
        'gameCode', p_round.game_code,
        'state', p_round.state,
        'stake', p_round.stake,
        'totalStake', p_round.total_stake,
        'payout', p_round.payout,
        'balanceAfter', private.game_money(p_balance),
        'serverSeedHash', v_hash,
        'serverSeed', v_seed,
        'nonce', p_round.nonce,
        'sessionId', p_round.session_id,
        'mathVersion', p_round.math_version,
        'publicResult', COALESCE(p_round.public_result, '{}'::jsonb),
        'allowedActions', COALESCE(p_allowed, '[]'::jsonb),
        'createdAt', p_round.created_at,
        'settledAt', p_round.settled_at
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_pharaoh_start(p_round_id UUID, p_actor UUID)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_prizes JSONB;
    v_total INTEGER := 0;
    v_roll INTEGER;
    v_acc INTEGER := 0;
    v_i INTEGER;
    v_inner INTEGER;
    v_prize JSONB;
    v_hit BOOLEAN := false;
    v_hit_bps INTEGER;
    v_tiles JSONB := '[]'::jsonb;
    v_hits JSONB := '[]'::jsonb;
    v_payout NUMERIC(20,2) := 0;
    v_mult NUMERIC;
    v_slot INTEGER;
    v_other JSONB := '[]'::jsonb;
    v_pick JSONB;
    v_ototal INTEGER := 0;
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    SELECT c.config->'prizes' INTO v_prizes FROM private.game_catalog AS c WHERE c.game_code = 'pharaoh';
    FOR v_i IN 0 .. jsonb_array_length(v_prizes) - 1 LOOP
        v_total := v_total + COALESCE((v_prizes->v_i->>'prizeWeight')::INTEGER, 0);
    END LOOP;
    v_roll := private.game_next_int(p_round_id, GREATEST(v_total, 1));
    FOR v_i IN 0 .. jsonb_array_length(v_prizes) - 1 LOOP
        v_acc := v_acc + COALESCE((v_prizes->v_i->>'prizeWeight')::INTEGER, 0);
        IF v_roll < v_acc THEN
            v_prize := v_prizes->v_i;
            EXIT;
        END IF;
    END LOOP;
    IF v_prize IS NULL THEN
        v_prize := v_prizes->(jsonb_array_length(v_prizes) - 1);
    END IF;
    v_hit_bps := COALESCE((v_prize->>'hitBps')::INTEGER, 0);
    v_hit := private.game_next_int(p_round_id, 10000) < v_hit_bps;
    v_mult := COALESCE((v_prize->>'mult')::NUMERIC, 0);

    FOR v_i IN 0 .. jsonb_array_length(v_prizes) - 1 LOOP
        IF (v_prizes->v_i->>'id') IS DISTINCT FROM (v_prize->>'id') THEN
            v_other := v_other || jsonb_build_array(v_prizes->v_i);
            v_ototal := v_ototal + COALESCE((v_prizes->v_i->>'prizeWeight')::INTEGER, 1);
        END IF;
    END LOOP;

    v_slot := CASE WHEN v_hit THEN private.game_next_int(p_round_id, 6) ELSE -1 END;
    FOR v_i IN 0..5 LOOP
        IF v_hit AND v_i = v_slot THEN
            v_pick := v_prize;
        ELSE
            v_roll := private.game_next_int(p_round_id, GREATEST(v_ototal, 1));
            v_acc := 0;
            v_pick := v_other->0;
            FOR v_inner IN 0 .. jsonb_array_length(v_other) - 1 LOOP
                v_acc := v_acc + COALESCE((v_other->v_inner->>'prizeWeight')::INTEGER, 1);
                IF v_roll < v_acc THEN
                    v_pick := v_other->v_inner;
                    EXIT;
                END IF;
            END LOOP;
        END IF;
        v_tiles := v_tiles || jsonb_build_array(jsonb_build_object('id', v_pick->>'id', 'mult', (v_pick->>'mult')::NUMERIC));
        v_hits := v_hits || to_jsonb(v_hit AND v_i = v_slot);
    END LOOP;

    IF v_hit THEN
        v_payout := private.game_money(v_round.stake * v_mult);
    END IF;

    RETURN private.game_settle_win(
        p_round_id,
        v_payout,
        jsonb_build_object(
            'prize', jsonb_build_object('id', v_prize->>'id', 'mult', v_mult),
            'tiles', v_tiles,
            'hits', v_hits,
            'matched', v_hit,
            'mathVersion', 'pharaoh-v2-rtp875',
            'outcome', CASE WHEN v_hit THEN 'win' ELSE 'lose' END
        ),
        jsonb_build_object('prize', v_prize, 'hit', v_hit),
        p_actor
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_dice_start(p_round_id UUID, p_actor UUID)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_p1 INTEGER;
    v_p2 INTEGER;
    v_r1 INTEGER;
    v_r2 INTEGER;
    v_ps INTEGER;
    v_rs INTEGER;
    v_outcome TEXT;
    v_payout NUMERIC(20,2);
    v_win NUMERIC := 1.72;
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    SELECT COALESCE((c.config->>'winMultiplier')::NUMERIC, 1.72)
    INTO v_win
    FROM private.game_catalog AS c
    WHERE c.game_code = 'dice';
    v_p1 := private.game_next_int(p_round_id, 6) + 1;
    v_p2 := private.game_next_int(p_round_id, 6) + 1;
    v_r1 := private.game_next_int(p_round_id, 6) + 1;
    v_r2 := private.game_next_int(p_round_id, 6) + 1;
    v_ps := v_p1 + v_p2;
    v_rs := v_r1 + v_r2;
    IF v_ps > v_rs THEN
        v_outcome := 'win';
        v_payout := private.game_money(v_round.stake * v_win);
    ELSIF v_ps = v_rs THEN
        v_outcome := 'draw';
        v_payout := private.game_money(v_round.stake);
    ELSE
        v_outcome := 'lose';
        v_payout := 0;
    END IF;

    RETURN private.game_settle_win(
        p_round_id,
        v_payout,
        jsonb_build_object(
            'playerDice', jsonb_build_array(v_p1, v_p2),
            'rivalDice', jsonb_build_array(v_r1, v_r2),
            'playerSum', v_ps,
            'rivalSum', v_rs,
            'winMultiplier', v_win,
            'mathVersion', 'dice-v2-rtp875',
            'outcome', v_outcome
        ),
        jsonb_build_object('outcome', v_outcome),
        p_actor
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_bj_payout(p_stake NUMERIC, p_result TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_win NUMERIC := 1.84;
    v_golden NUMERIC := 2.00;
BEGIN
    SELECT
        COALESCE((c.config->>'winPayout')::NUMERIC, 1.84),
        COALESCE((c.config->>'goldenPayout')::NUMERIC, 2.00)
    INTO v_win, v_golden
    FROM private.game_catalog AS c
    WHERE c.game_code = 'blackjack';
    RETURN CASE
        WHEN p_result = 'golden' THEN private.game_money(p_stake * v_golden)
        WHEN p_result IN ('blackjack', 'win') THEN private.game_money(p_stake * v_win)
        WHEN p_result = 'push' THEN private.game_money(p_stake)
        ELSE 0
    END;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_crystal_mult(p_kind TEXT, p_size INTEGER)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_base NUMERIC := 0;
    v_scale NUMERIC := 1.00;
BEGIN
    SELECT COALESCE((c.config->>'payoutScale')::NUMERIC, 1.00)
    INTO v_scale
    FROM private.game_catalog AS c
    WHERE c.game_code = 'crystal';
    IF p_size < 5 THEN
        RETURN 0;
    END IF;
    IF p_kind = 'coin' THEN
        IF p_size >= 10 THEN v_base := 20;
        ELSIF p_size = 9 THEN v_base := 16;
        ELSIF p_size = 8 THEN v_base := 12;
        ELSIF p_size = 7 THEN v_base := 10;
        ELSIF p_size = 6 THEN v_base := 8;
        ELSE v_base := 5;
        END IF;
    ELSE
        IF p_size >= 11 THEN v_base := 5;
        ELSIF p_size = 10 THEN v_base := 4.5;
        ELSIF p_size = 9 THEN v_base := 4;
        ELSIF p_size = 8 THEN v_base := 3.5;
        ELSIF p_size = 7 THEN v_base := 3;
        ELSIF p_size = 6 THEN v_base := 2;
        ELSE v_base := 0.6;
        END IF;
    END IF;
    RETURN v_base * v_scale;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_blackjack_finish(
    p_round_id UUID,
    p_player JSONB,
    p_dealer JSONB,
    p_deck JSONB,
    p_actor UUID
)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_dealer JSONB := private.game_bj_reveal(p_dealer);
    v_drawn JSONB;
    v_draws JSONB := '[]'::jsonb;
    v_result TEXT;
    v_pub JSONB;
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    WHILE private.game_bj_score(v_dealer) < 17 LOOP
        v_drawn := private.game_bj_draw(p_deck, false);
        v_dealer := v_dealer || jsonb_build_array(v_drawn->'card');
        v_draws := v_draws || jsonb_build_array(v_drawn->'card');
        p_deck := v_drawn->'deck';
    END LOOP;
    v_result := private.game_bj_resolve(p_player, v_dealer);
    v_pub := private.game_bj_public(p_player, v_dealer, 'gameOver', v_result)
        || jsonb_build_object('dealerDraws', v_draws, 'mathVersion', 'blackjack-v2-rtp875');
    RETURN private.game_settle_win(
        p_round_id,
        private.game_bj_payout(v_round.stake, v_result),
        v_pub,
        jsonb_build_object('deck', p_deck, 'playerHand', p_player, 'dealerHand', v_dealer, 'result', v_result, 'dealerDraws', v_draws),
        p_actor
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_aviator_crash_from_seed(p_seed TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_hex TEXT;
    v_e NUMERIC;
    v_raw NUMERIC;
BEGIN
    v_hex := substr(encode(private.game_hmac(p_seed, 'session:crash:1'), 'hex'), 1, 13);
    v_e := LEAST(('x' || v_hex)::bit(52)::bigint::NUMERIC / POWER(2::NUMERIC, 52), 0.999999999999);
    IF v_e <= 0 THEN
        v_e := 0.000000000001;
    END IF;
    v_raw := FLOOR((0.875 / v_e) * 100) / 100.0;
    RETURN GREATEST(1.00, LEAST(1000000, ROUND(v_raw, 2)));
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_aviator_time_to_mult(p_mult NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_delta NUMERIC;
BEGIN
    v_delta := GREATEST(0, COALESCE(p_mult, 1) - 1);
    IF v_delta <= 0 THEN
        RETURN 0;
    END IF;
    RETURN POWER(v_delta / 0.06, 1.0 / 1.7);
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_aviator_multiplier(p_seconds NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
BEGIN
    IF p_seconds <= 0 THEN
        RETURN 1;
    END IF;
    RETURN ROUND(1 + 0.06 * POWER(p_seconds, 1.7), 4);
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_aviator_session_public(p_session private.game_sessions, p_now TIMESTAMPTZ)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_crash NUMERIC;
    v_elapsed NUMERIC;
    v_mult NUMERIC;
    v_reveal BOOLEAN;
BEGIN
    v_crash := (p_session.private_state->>'crashPoint')::NUMERIC;
    v_reveal := p_session.state = 'crashed';
    v_elapsed := EXTRACT(EPOCH FROM (p_now - p_session.starts_at));
    -- Never cap the public multiplier by the hidden crash point: that would
    -- leak crash timing while the flight is still betting/flying.
    v_mult := CASE
        WHEN p_session.state = 'betting' THEN 1
        WHEN v_reveal THEN v_crash
        ELSE private.game_aviator_multiplier(GREATEST(0, v_elapsed))
    END;
    RETURN jsonb_build_object(
        'ok', true,
        'sessionId', p_session.id,
        'gameCode', 'aviator',
        'state', p_session.state,
        'serverNow', p_now,
        'bettingClosesAt', p_session.betting_closes_at,
        'startsAt', p_session.starts_at,
        'crashAt', CASE WHEN v_reveal THEN p_session.crash_at ELSE NULL END,
        'serverSeedHash', p_session.server_seed_hash,
        'mathVersion', p_session.math_version,
        'currentMultiplier', v_mult,
        'crashPoint', CASE WHEN v_reveal THEN v_crash ELSE NULL END,
        'serverSeed', CASE WHEN v_reveal THEN p_session.server_seed ELSE NULL END
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_aviator_settle_session_bets(p_session_id UUID, p_actor UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_session private.game_sessions%ROWTYPE;
    v_round private.game_rounds%ROWTYPE;
    v_crash NUMERIC;
    v_auto NUMERIC;
    v_payout NUMERIC;
BEGIN
    SELECT s.* INTO v_session FROM private.game_sessions AS s WHERE s.id = p_session_id FOR UPDATE;
    v_crash := (v_session.private_state->>'crashPoint')::NUMERIC;
    FOR v_round IN
        SELECT r.* FROM private.game_rounds AS r
        WHERE r.session_id = p_session_id AND r.state = 'open'
        FOR UPDATE
    LOOP
        v_auto := (v_round.private_state->>'autoCashout')::NUMERIC;
        IF v_auto IS NOT NULL AND v_auto < v_crash THEN
            v_payout := private.game_money(v_round.stake * v_auto);
            PERFORM private.game_settle_win(
                v_round.id,
                v_payout,
                jsonb_build_object(
                    'phase', 'cashed',
                    'sessionId', p_session_id,
                    'crashPoint', v_crash,
                    'cashedAt', v_auto,
                    'currentMultiplier', v_auto,
                    'outcome', 'win',
                    'startedAt', v_session.starts_at,
                    'serverNow', pg_catalog.now()
                ),
                v_round.private_state || jsonb_build_object('cashedAt', v_auto),
                COALESCE(p_actor, v_round.player_user_id)
            );
        ELSE
            PERFORM private.game_settle_win(
                v_round.id,
                0,
                jsonb_build_object(
                    'phase', 'crashed',
                    'sessionId', p_session_id,
                    'crashPoint', v_crash,
                    'currentMultiplier', v_crash,
                    'outcome', 'lose',
                    'startedAt', v_session.starts_at,
                    'serverNow', pg_catalog.now()
                ),
                v_round.private_state,
                COALESCE(p_actor, v_round.player_user_id)
            );
        END IF;
    END LOOP;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_aviator_finalize_session(p_session private.game_sessions, p_now TIMESTAMPTZ)
RETURNS private.game_sessions
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_session private.game_sessions%ROWTYPE := p_session;
BEGIN
    IF v_session.state = 'betting' AND p_now >= v_session.betting_closes_at THEN
        UPDATE private.game_sessions
        SET state = 'flying', updated_at = p_now
        WHERE id = v_session.id
        RETURNING * INTO v_session;
    END IF;
    IF v_session.state = 'flying' AND p_now >= v_session.crash_at THEN
        -- Mark crashed on the in-memory row first so session_public may reveal
        -- crashAt / crashPoint / serverSeed. Never publish those while flying.
        v_session.state := 'crashed';
        v_session.settled_at := p_now;
        UPDATE private.game_sessions
        SET
            state = 'crashed',
            settled_at = p_now,
            public_result = private.game_aviator_session_public(v_session, p_now),
            updated_at = p_now
        WHERE id = v_session.id
        RETURNING * INTO v_session;
        PERFORM private.game_aviator_settle_session_bets(v_session.id, NULL);
    END IF;
    RETURN v_session;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_aviator_get_or_create_current_session()
RETURNS private.game_sessions
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_now TIMESTAMPTZ := pg_catalog.now();
    v_session private.game_sessions%ROWTYPE;
    v_seed TEXT;
    v_hash TEXT;
    v_crash NUMERIC;
    v_bet_sec NUMERIC := 5;
    v_start TIMESTAMPTZ;
    v_close TIMESTAMPTZ;
    v_crash_at TIMESTAMPTZ;
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended('nextpari:aviator:current', 0));
    SELECT s.*
    INTO v_session
    FROM private.game_sessions AS s
    WHERE s.game_code = 'aviator'
    ORDER BY s.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        v_session := private.game_aviator_finalize_session(v_session, v_now);
        IF v_session.state IN ('betting', 'flying') THEN
            RETURN v_session;
        END IF;
        IF v_session.state = 'crashed' AND v_now < COALESCE(v_session.settled_at, v_session.crash_at) + INTERVAL '2 seconds' THEN
            RETURN v_session;
        END IF;
    END IF;

    SELECT COALESCE((c.config->>'bettingSeconds')::NUMERIC, 5)
    INTO v_bet_sec
    FROM private.game_catalog AS c
    WHERE c.game_code = 'aviator';

    v_seed := encode(extensions.gen_random_bytes(32), 'hex');
    v_hash := private.game_sha256_hex(v_seed);
    v_crash := private.game_aviator_crash_from_seed(v_seed);
    v_close := v_now + make_interval(secs => v_bet_sec);
    v_start := v_close;
    v_crash_at := v_start + make_interval(secs => private.game_aviator_time_to_mult(v_crash));

    INSERT INTO private.game_sessions (
        game_code, state, server_seed, server_seed_hash, nonce,
        betting_closes_at, starts_at, crash_at, math_version, private_state, public_result
    ) VALUES (
        'aviator', 'betting', v_seed, v_hash, 1,
        v_close, v_start, v_crash_at, 'aviator-v2-rtp875',
        jsonb_build_object('crashPoint', v_crash),
        jsonb_build_object('state', 'betting', 'serverSeedHash', v_hash)
    )
    RETURNING * INTO v_session;
    RETURN v_session;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_aviator_start(p_round_id UUID, p_options JSONB, p_actor UUID)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_session private.game_sessions%ROWTYPE;
    v_auto NUMERIC(20,2);
    v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    v_session := private.game_aviator_get_or_create_current_session();
    IF v_session.state IS DISTINCT FROM 'betting' THEN
        RAISE EXCEPTION 'BETTING_WINDOW_CLOSED';
    END IF;
    v_auto := NULL;
    IF p_options ? 'autoCashout' THEN
        v_auto := private.game_money((p_options->>'autoCashout')::NUMERIC);
        IF v_auto IS NULL OR v_auto < 1.01 THEN
            v_auto := NULL;
        END IF;
    END IF;

    UPDATE private.game_rounds
    SET
        session_id = v_session.id,
        math_version = 'aviator-v2-rtp875',
        public_result = jsonb_build_object(
            'sessionId', v_session.id,
            'phase', 'betting',
            'startedAt', v_session.starts_at,
            'bettingClosesAt', v_session.betting_closes_at,
            'serverNow', v_now,
            'autoCashout', v_auto,
            'currentMultiplier', 1,
            'serverSeedHash', v_session.server_seed_hash
        ),
        private_state = jsonb_build_object(
            'sessionId', v_session.id,
            'autoCashout', v_auto
        ),
        updated_at = v_now
    WHERE id = p_round_id
    RETURNING * INTO v_round;
    RETURN v_round;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_aviator_progress(p_round_id UUID, p_actor UUID)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_session private.game_sessions%ROWTYPE;
    v_now TIMESTAMPTZ := pg_catalog.now();
    v_auto NUMERIC;
    v_crash NUMERIC;
    v_elapsed NUMERIC;
    v_mult NUMERIC;
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    IF v_round.session_id IS NULL THEN
        RETURN v_round;
    END IF;
    SELECT s.* INTO v_session FROM private.game_sessions AS s WHERE s.id = v_round.session_id FOR UPDATE;
    v_session := private.game_aviator_finalize_session(v_session, v_now);
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id;
    IF v_round.state IS DISTINCT FROM 'open' THEN
        RETURN v_round;
    END IF;
    v_crash := (v_session.private_state->>'crashPoint')::NUMERIC;
    v_auto := (v_round.private_state->>'autoCashout')::NUMERIC;
    v_elapsed := EXTRACT(EPOCH FROM (v_now - v_session.starts_at));
    v_mult := private.game_aviator_multiplier(GREATEST(0, v_elapsed));

    IF v_session.state = 'crashed' THEN
        RETURN v_round;
    END IF;

    IF v_session.state = 'flying' AND v_auto IS NOT NULL AND v_auto < v_crash AND v_mult >= v_auto THEN
        RETURN private.game_settle_win(
            p_round_id,
            private.game_money(v_round.stake * v_auto),
            jsonb_build_object(
                'phase', 'cashed',
                'sessionId', v_session.id,
                'cashedAt', v_auto,
                'currentMultiplier', v_auto,
                'outcome', 'win',
                'startedAt', v_session.starts_at,
                'serverNow', v_now
            ),
            v_round.private_state || jsonb_build_object('cashedAt', v_auto),
            p_actor
        );
    END IF;

    UPDATE private.game_rounds
    SET
        public_result = jsonb_build_object(
            'sessionId', v_session.id,
            'phase', v_session.state,
            'startedAt', v_session.starts_at,
            'bettingClosesAt', v_session.betting_closes_at,
            'serverNow', v_now,
            'autoCashout', v_auto,
            'currentMultiplier', CASE
                WHEN v_session.state = 'betting' THEN 1
                ELSE v_mult
            END,
            'serverSeedHash', v_session.server_seed_hash
        ),
        updated_at = v_now
    WHERE id = p_round_id
    RETURNING * INTO v_round;
    RETURN v_round;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_aviator_action(
    p_round_id UUID,
    p_action TEXT,
    p_options JSONB,
    p_actor UUID
)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_session private.game_sessions%ROWTYPE;
    v_now TIMESTAMPTZ := pg_catalog.now();
    v_crash NUMERIC;
    v_elapsed NUMERIC;
    v_mult NUMERIC;
BEGIN
    v_round := private.game_adapter_aviator_progress(p_round_id, p_actor);
    IF v_round.state IS DISTINCT FROM 'open' THEN
        RETURN v_round;
    END IF;
    IF LOWER(BTRIM(p_action)) IS DISTINCT FROM 'cashout' THEN
        RAISE EXCEPTION 'ACTION_NOT_ALLOWED';
    END IF;
    SELECT s.* INTO v_session FROM private.game_sessions AS s WHERE s.id = v_round.session_id FOR UPDATE;
    IF v_session.state IS DISTINCT FROM 'flying' THEN
        RAISE EXCEPTION 'GAME_ROUND_NOT_OPEN';
    END IF;
    v_crash := (v_session.private_state->>'crashPoint')::NUMERIC;
    v_elapsed := EXTRACT(EPOCH FROM (v_now - v_session.starts_at));
    v_mult := private.game_aviator_multiplier(GREATEST(0, v_elapsed));
    IF v_mult >= v_crash THEN
        RETURN private.game_settle_win(
            p_round_id, 0,
            jsonb_build_object(
                'phase', 'crashed', 'sessionId', v_session.id,
                'currentMultiplier', v_crash, 'outcome', 'lose',
                'startedAt', v_session.starts_at, 'serverNow', v_now
            ),
            v_round.private_state, p_actor
        );
    END IF;
    RETURN private.game_settle_win(
        p_round_id,
        private.game_money(v_round.stake * v_mult),
        jsonb_build_object(
            'phase', 'cashed', 'sessionId', v_session.id,
            'cashedAt', v_mult, 'currentMultiplier', v_mult, 'outcome', 'win',
            'startedAt', v_session.starts_at, 'serverNow', v_now
        ),
        v_round.private_state || jsonb_build_object('cashedAt', v_mult),
        p_actor
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_engine_start(
    p_game_code TEXT,
    p_stake NUMERIC,
    p_idempotency_key TEXT,
    p_options JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_cat private.game_catalog%ROWTYPE;
    v_key TEXT;
    v_opts JSONB;
    v_fp TEXT;
    v_existing private.game_rounds%ROWTYPE;
    v_round private.game_rounds%ROWTYPE;
    v_seed TEXT;
    v_hash TEXT;
    v_stake NUMERIC(20,2);
    v_json JSONB;
    v_session UUID;
    v_math TEXT;
BEGIN
    SELECT * INTO v_ctx FROM private.game_require_player_context();
    v_cat := private.game_require_catalog(p_game_code);
    v_key := private.game_require_idempotency_key(p_idempotency_key);
    v_opts := private.game_sanitize_options(p_options);

    IF p_stake IS NULL OR p_stake <= 0 THEN
        RAISE EXCEPTION 'STAKE_NOT_POSITIVE';
    END IF;
    IF p_stake <> ROUND(p_stake, 2) THEN
        RAISE EXCEPTION 'STAKE_SCALE_INVALID';
    END IF;
    v_stake := ROUND(p_stake, 2);
    IF v_stake < v_cat.min_stake THEN
        RAISE EXCEPTION 'STAKE_BELOW_MIN';
    END IF;
    IF v_cat.max_stake IS NOT NULL AND v_stake > v_cat.max_stake THEN
        RAISE EXCEPTION 'STAKE_ABOVE_MAX';
    END IF;

    v_fp := private.game_fingerprint(jsonb_build_object(
        'gameCode', v_cat.game_code,
        'stake', v_stake,
        'options', v_opts
    ));

    SELECT r.*
    INTO v_existing
    FROM private.game_rounds AS r
    WHERE r.player_user_id = v_ctx.user_id
      AND r.start_idempotency_key = v_key
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing.start_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
        END IF;
        IF v_existing.start_response IS NOT NULL THEN
            RETURN v_existing.start_response;
        END IF;
        RETURN private.game_round_json(
            v_existing,
            private.game_current_balance(v_existing.wallet_id),
            true,
            private.game_allowed_actions(v_existing)
        );
    END IF;

    v_math := private.game_math_version(v_cat.game_code);
    v_session := NULL;
    IF v_cat.game_code = 'aviator' THEN
        v_session := (private.game_aviator_get_or_create_current_session()).id;
    END IF;

    v_seed := encode(extensions.gen_random_bytes(32), 'hex');
    v_hash := private.game_sha256_hex(v_seed);

    INSERT INTO private.game_rounds (
        player_user_id, wallet_id, game_code, state, stake, total_stake, payout,
        server_seed, server_seed_hash, nonce, start_idempotency_key, start_fingerprint,
        math_version, session_id
    ) VALUES (
        v_ctx.user_id, v_ctx.wallet_id, v_cat.game_code, 'open', v_stake, v_stake, 0,
        v_seed, v_hash, 0, v_key, v_fp, v_math, v_session
    )
    RETURNING * INTO v_round;

    PERFORM private.game_apply_bet(v_round, v_stake, v_ctx.user_id);
    v_round := private.game_adapter_start(v_round.id, v_cat.game_code, v_opts, v_ctx.user_id);
    v_json := private.game_round_json(
        v_round,
        private.game_current_balance(v_round.wallet_id),
        false,
        private.game_allowed_actions(v_round)
    );
    UPDATE private.game_rounds
    SET start_response = v_json, updated_at = pg_catalog.now()
    WHERE id = v_round.id;
    RETURN v_json;
EXCEPTION
    WHEN unique_violation THEN
        SELECT r.*
        INTO v_existing
        FROM private.game_rounds AS r
        WHERE r.player_user_id = v_ctx.user_id
          AND r.start_idempotency_key = v_key
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE;
        END IF;
        IF v_existing.start_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
        END IF;
        IF v_existing.start_response IS NOT NULL THEN
            RETURN v_existing.start_response;
        END IF;
        RETURN private.game_round_json(
            v_existing,
            private.game_current_balance(v_existing.wallet_id),
            true,
            private.game_allowed_actions(v_existing)
        );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_engine_get(p_round_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_round private.game_rounds%ROWTYPE;
BEGIN
    SELECT * INTO v_ctx FROM private.game_require_player_context();
    v_round := private.game_lock_round_owned(p_round_id, v_ctx.user_id);
    IF v_round.game_code = 'aviator' AND v_round.state = 'open' THEN
        v_round := private.game_adapter_aviator_progress(v_round.id, v_ctx.user_id);
    END IF;
    RETURN private.game_round_json(
        v_round,
        private.game_current_balance(v_round.wallet_id),
        false,
        private.game_allowed_actions(v_round)
    );
END;
$fn$;

-- Read-only eligibility for shared-flight observers. Auth + staff rejection +
-- profile existence only. Never locks wallet_accounts, never mutates balances,
-- and never grants financial authority. Start/action keep game_require_player_context.
CREATE OR REPLACE FUNCTION private.game_require_session_viewer()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_staff UUID;
    v_profile UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    SELECT s.auth_user_id
    INTO v_staff
    FROM private.staff_accounts AS s
    WHERE s.auth_user_id = v_uid
    LIMIT 1;
    IF v_staff IS NOT NULL THEN
        RAISE EXCEPTION 'STAFF_CANNOT_PLAY';
    END IF;

    SELECT p.id
    INTO v_profile
    FROM public.profiles AS p
    WHERE p.id = v_uid;

    IF v_profile IS NULL THEN
        RAISE EXCEPTION 'PLAYER_PROFILE_MISSING';
    END IF;

    RETURN v_uid;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.player_game_session_get(p_game_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_session private.game_sessions%ROWTYPE;
    v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
    PERFORM private.game_require_session_viewer();
    IF COALESCE(p_game_code, '') IS DISTINCT FROM 'aviator' THEN
        RAISE EXCEPTION 'GAME_NOT_FOUND';
    END IF;
    v_session := private.game_aviator_get_or_create_current_session();
    RETURN private.game_aviator_session_public(v_session, v_now);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_game_session_get(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_game_session_get(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.player_game_session_get(TEXT) TO authenticated;

COMMENT ON FUNCTION private.game_require_session_viewer() IS
'Read-only Aviator observer eligibility. Auth + staff rejection + profile existence. No wallet FOR UPDATE, no balance mutation, no financial authority.';

COMMENT ON FUNCTION public.player_game_session_get(TEXT) IS
'Authenticated shared game session snapshot. Aviator: one canonical flight. Hides crash point until crashed.';

COMMIT;

