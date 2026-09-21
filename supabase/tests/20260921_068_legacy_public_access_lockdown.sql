BEGIN;

-- Phase 068 catalog/security regression.
-- Verify effective table privileges after legacy public access lockdown.
-- Do not invoke payout, cashier, wallet, or other money-changing functions.
-- ROLLBACK always. Do not apply against production.

CREATE OR REPLACE FUNCTION pg_temp.np_assert(p_ok BOOLEAN, p_msg TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NOT COALESCE(p_ok, false) THEN
    RAISE EXCEPTION '068_REGRESSION: %', p_msg;
  END IF;
END;
$fn$;

SELECT pg_temp.np_assert(
  to_regclass('public.mobcash_orders') IS NOT NULL,
  'mobcash_orders exists'
);
SELECT pg_temp.np_assert(
  to_regclass('public.game_history') IS NOT NULL,
  'game_history exists'
);
SELECT pg_temp.np_assert(
  to_regclass('public.product_wagers') IS NOT NULL,
  'product_wagers exists'
);
SELECT pg_temp.np_assert(
  to_regclass('public.tournaments') IS NOT NULL,
  'tournaments exists'
);

SELECT pg_temp.np_assert(
  NOT has_table_privilege('anon', 'public.mobcash_orders', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.mobcash_orders', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.mobcash_orders', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.mobcash_orders', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.mobcash_orders', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.mobcash_orders', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.mobcash_orders', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.mobcash_orders', 'DELETE')
  AND NOT has_table_privilege('anon', 'public.mobcash_orders', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.mobcash_orders', 'TRUNCATE'),
  'mobcash_orders: anon/authenticated have no SELECT/INSERT/UPDATE/DELETE/TRUNCATE'
);

SELECT pg_temp.np_assert(
  NOT has_table_privilege('anon', 'public.game_history', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.game_history', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.game_history', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.game_history', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.game_history', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.game_history', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.game_history', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.game_history', 'DELETE')
  AND NOT has_table_privilege('anon', 'public.game_history', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.game_history', 'TRUNCATE'),
  'game_history: anon/authenticated have no SELECT/INSERT/UPDATE/DELETE/TRUNCATE'
);

SELECT pg_temp.np_assert(
  NOT has_table_privilege('anon', 'public.product_wagers', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.product_wagers', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.product_wagers', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.product_wagers', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.product_wagers', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.product_wagers', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.product_wagers', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.product_wagers', 'DELETE')
  AND NOT has_table_privilege('anon', 'public.product_wagers', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.product_wagers', 'TRUNCATE'),
  'product_wagers: anon/authenticated have no SELECT/INSERT/UPDATE/DELETE/TRUNCATE'
);

SELECT pg_temp.np_assert(
  has_table_privilege('anon', 'public.tournaments', 'SELECT')
  AND has_table_privilege('authenticated', 'public.tournaments', 'SELECT'),
  'tournaments: SELECT remains for anon/authenticated'
);

SELECT pg_temp.np_assert(
  NOT has_table_privilege('anon', 'public.tournaments', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.tournaments', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.tournaments', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.tournaments', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.tournaments', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.tournaments', 'DELETE')
  AND NOT has_table_privilege('anon', 'public.tournaments', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.tournaments', 'TRUNCATE'),
  'tournaments: anon/authenticated have no INSERT/UPDATE/DELETE/TRUNCATE'
);

SELECT pg_temp.np_assert(
  to_regprocedure('public.cashier_lookup_payout_code(text)') IS NOT NULL,
  'cashier_lookup_payout_code(text) exists'
);
SELECT pg_temp.np_assert(
  to_regprocedure('public.cashier_payout_by_code(uuid,text)') IS NOT NULL,
  'cashier_payout_by_code(uuid,text) exists'
);
SELECT pg_temp.np_assert(
  to_regprocedure('public.player_create_cash_payout(numeric)') IS NOT NULL,
  'player_create_cash_payout(numeric) exists'
);
SELECT pg_temp.np_assert(
  to_regprocedure('public.player_list_cash_payouts()') IS NOT NULL,
  'player_list_cash_payouts() exists'
);
SELECT pg_temp.np_assert(
  to_regprocedure('public.owner_player_dossier(text)') IS NOT NULL,
  'owner_player_dossier(text) exists'
);
SELECT pg_temp.np_assert(
  to_regprocedure('private.dashboard_stats_for_manager_account(uuid)') IS NOT NULL,
  'private.dashboard_stats_for_manager_account(uuid) exists'
);

ROLLBACK;
