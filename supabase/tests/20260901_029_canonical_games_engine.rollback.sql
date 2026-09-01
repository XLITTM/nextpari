BEGIN;

-- Phase 029 rollback probe. Do not execute production game rounds.
-- Structural assertions only. ROLLBACK always.

CREATE OR REPLACE FUNCTION pg_temp.np_assert(p_ok BOOLEAN, p_msg TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF NOT COALESCE(p_ok, false) THEN
        RAISE EXCEPTION 'ROLLBACK_ASSERT: %', p_msg;
    END IF;
END;
$fn$;

SELECT pg_temp.np_assert(
    to_regclass('private.game_catalog') IS NOT NULL,
    'game_catalog exists'
);
SELECT pg_temp.np_assert(
    to_regclass('private.game_rounds') IS NOT NULL,
    'game_rounds exists'
);
SELECT pg_temp.np_assert(
    to_regclass('private.game_actions') IS NOT NULL,
    'game_actions exists'
);

SELECT pg_temp.np_assert(
    (
        SELECT COUNT(*) = 6
        FROM private.game_catalog
        WHERE game_code IN ('pharaoh', 'dice', 'blackjack', 'apples', 'crystal', 'aviator')
    ),
    'initial six catalog rows'
);

SELECT pg_temp.np_assert(
    NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS c
        JOIN pg_catalog.pg_class AS rel ON rel.oid = c.conrelid
        JOIN pg_catalog.pg_namespace AS n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'private'
          AND rel.relname = 'game_rounds'
          AND pg_catalog.pg_get_constraintdef(c.oid) ILIKE '%pharaoh%dice%blackjack%'
    ),
    'no hardcoded six-game CHECK on game_rounds'
);

SELECT pg_temp.np_assert(
    NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS c
        JOIN pg_catalog.pg_class AS rel ON rel.oid = c.conrelid
        JOIN pg_catalog.pg_namespace AS n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'private'
          AND rel.relname = 'game_catalog'
          AND pg_catalog.pg_get_constraintdef(c.oid) ILIKE '%IN (%pharaoh%aviator%'
    ),
    'catalog game_code is not a six-game CHECK'
);

SELECT pg_temp.np_assert(
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS p
        JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'player_game_start'
    )
    AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS p
        JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'player_game_action'
    )
    AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS p
        JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'player_game_get'
    ),
    'generic public game RPCs exist'
);

SELECT pg_temp.np_assert(
    NOT has_table_privilege('anon', 'private.game_rounds', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'private.game_rounds', 'SELECT')
    AND NOT has_table_privilege('anon', 'private.game_catalog', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'private.game_catalog', 'SELECT')
    AND NOT has_table_privilege('anon', 'private.game_actions', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'private.game_actions', 'SELECT'),
    'private game tables have no browser grants'
);

SELECT pg_temp.np_assert(
    has_function_privilege('authenticated', 'public.player_game_start(text,numeric,text,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.player_game_start(text,numeric,text,jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.player_game_action(uuid,text,text,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.player_game_action(uuid,text,text,jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.player_game_get(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.player_game_get(uuid)', 'EXECUTE'),
    'authenticated-only public game RPCs'
);

SELECT pg_temp.np_assert(
    (
        SELECT COUNT(*) = 0
        FROM private.game_rounds
        WHERE created_at >= pg_catalog.now() - INTERVAL '1 second'
          AND start_idempotency_key LIKE 'rollback:%'
    ),
    'this probe did not insert production game rounds'
);

ROLLBACK;
