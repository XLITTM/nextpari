BEGIN;

-- NEXTPARI PHASE 033
-- Apples start array_append fix ONLY.
-- WRITE ONLY. Do not execute against production in this task.
-- Does not UPDATE historical settled rounds.
-- Does not change Dice, Blackjack, Pharaoh, Crystal, or Aviator.
-- Does not change Apples financial math / catalog levels.
-- Does not change Wallet Core or ledger.

CREATE OR REPLACE FUNCTION private.game_adapter_apples_start(p_round_id UUID, p_actor UUID)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_levels JSONB;
    v_rows JSONB := '[]'::jsonb;
    v_level JSONB;
    v_i INTEGER;
    v_k INTEGER;
    v_kinds TEXT[];
    v_j INTEGER;
    v_tmp TEXT;
    v_cells JSONB;
    v_priv JSONB;
    v_round private.game_rounds%ROWTYPE;
BEGIN
    SELECT c.config->'levels' INTO v_levels FROM private.game_catalog AS c WHERE c.game_code = 'apples';
    FOR v_i IN 0 .. jsonb_array_length(v_levels) - 1 LOOP
        v_level := v_levels->v_i;
        v_kinds := ARRAY[]::TEXT[];
        FOR v_k IN 1 .. COALESCE((v_level->>'good')::INTEGER, 0) LOOP
            v_kinds := array_append(v_kinds, 'good');
        END LOOP;
        FOR v_k IN 1 .. COALESCE((v_level->>'bad')::INTEGER, 0) LOOP
            v_kinds := array_append(v_kinds, 'bad');
        END LOOP;
        FOR v_k IN REVERSE COALESCE(array_length(v_kinds, 1), 0) .. 2 LOOP
            v_j := private.game_next_int(p_round_id, v_k) + 1;
            v_tmp := v_kinds[v_k];
            v_kinds[v_k] := v_kinds[v_j];
            v_kinds[v_j] := v_tmp;
        END LOOP;
        v_cells := '[]'::jsonb;
        FOR v_k IN 1 .. COALESCE(array_length(v_kinds, 1), 0) LOOP
            v_cells := v_cells || jsonb_build_array(jsonb_build_object(
                'id', (v_level->>'level') || '-' || (v_k - 1)::TEXT,
                'kind', v_kinds[v_k],
                'revealed', false,
                'picked', false
            ));
        END LOOP;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
            'level', (v_level->>'level')::INTEGER,
            'multiplier', (v_level->>'multiplier')::NUMERIC,
            'cells', v_cells
        ));
    END LOOP;

    v_priv := jsonb_build_object(
        'rows', v_rows,
        'activeLevel', 1,
        'lastWonLevel', 0,
        'cashoutValue', 0
    );
    UPDATE private.game_rounds
    SET
        public_result = private.game_apples_public(v_priv, 'playing'),
        private_state = v_priv,
        updated_at = pg_catalog.now()
    WHERE id = p_round_id
    RETURNING * INTO v_round;
    RETURN v_round;
END;
$fn$;

COMMIT;
