BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 068
-- LEGACY PUBLIC TABLE ACCESS LOCKDOWN
--
-- Sequence: after 067 (fix_fund_attribution_wallet_ledger_key).
-- Repository-only. NOT applied by this change.
--
-- Remove unnecessary DIRECT client (anon / authenticated) table
-- access on legacy public tables. Keep the tables, keep the rows,
-- keep existing SECURITY DEFINER / server routines.
--
-- Does NOT drop tables or data.
-- Does NOT rewrite cashier/payout/owner/manager functions.
-- Does NOT change public.next_mobcash_code().
-- Does NOT touch Wallet Ledger, Operational Ledger, fund attribution,
-- BetConstruct, LSports, auth, or staff IAM.
-- ============================================================

-- A. public.mobcash_orders — no direct client table access
REVOKE ALL ON TABLE public.mobcash_orders FROM PUBLIC;
REVOKE ALL ON TABLE public.mobcash_orders FROM anon;
REVOKE ALL ON TABLE public.mobcash_orders FROM authenticated;

DROP POLICY IF EXISTS "anon_select_mobcash_orders" ON public.mobcash_orders;
DROP POLICY IF EXISTS "anon_insert_mobcash_orders" ON public.mobcash_orders;
DROP POLICY IF EXISTS "anon_update_mobcash_orders" ON public.mobcash_orders;
DROP POLICY IF EXISTS "anon_delete_mobcash_orders" ON public.mobcash_orders;

-- B. public.game_history — no direct client table access
REVOKE ALL ON TABLE public.game_history FROM PUBLIC;
REVOKE ALL ON TABLE public.game_history FROM anon;
REVOKE ALL ON TABLE public.game_history FROM authenticated;

DROP POLICY IF EXISTS "anon_select_game_history" ON public.game_history;
DROP POLICY IF EXISTS "anon_insert_game_history" ON public.game_history;
DROP POLICY IF EXISTS "anon_update_game_history" ON public.game_history;
DROP POLICY IF EXISTS "anon_delete_game_history" ON public.game_history;

-- C. public.product_wagers — no direct client table access
REVOKE ALL ON TABLE public.product_wagers FROM PUBLIC;
REVOKE ALL ON TABLE public.product_wagers FROM anon;
REVOKE ALL ON TABLE public.product_wagers FROM authenticated;

DROP POLICY IF EXISTS "anon_select_product_wagers" ON public.product_wagers;
DROP POLICY IF EXISTS "anon_insert_product_wagers" ON public.product_wagers;
DROP POLICY IF EXISTS "anon_update_product_wagers" ON public.product_wagers;
DROP POLICY IF EXISTS "anon_delete_product_wagers" ON public.product_wagers;

-- D. public.tournaments — write closed; SELECT kept temporarily
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.tournaments FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.tournaments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.tournaments FROM authenticated;

DROP POLICY IF EXISTS "Allow anon insert tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "anon_insert_tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "anon_update_tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "anon_delete_tournaments" ON public.tournaments;

-- Drop any remaining client-facing policies on the locked tables,
-- and remaining write/ALL policies on tournaments. Keep SELECT
-- policies on tournaments (including anon_select_tournaments).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('mobcash_orders', 'game_history', 'product_wagers')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
  END LOOP;

  FOR r IN
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tournaments'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.tournaments',
      r.policyname
    );
  END LOOP;
END
$$;

-- Effective privilege assertions. Abort if client access remains.
DO $$
DECLARE
  v_role TEXT;
  v_priv TEXT;
  v_table TEXT;
  v_locked CONSTANT TEXT[] := ARRAY['mobcash_orders', 'game_history', 'product_wagers'];
  v_locked_privs CONSTANT TEXT[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];
  v_write_privs CONSTANT TEXT[] := ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];
BEGIN
  IF to_regclass('public.mobcash_orders') IS NULL
     OR to_regclass('public.game_history') IS NULL
     OR to_regclass('public.product_wagers') IS NULL
     OR to_regclass('public.tournaments') IS NULL THEN
    RAISE EXCEPTION '068_LOCKDOWN: one or more legacy tables are missing';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      RAISE EXCEPTION '068_LOCKDOWN: role % is missing', v_role;
    END IF;

    FOREACH v_table IN ARRAY v_locked LOOP
      FOREACH v_priv IN ARRAY v_locked_privs LOOP
        IF has_table_privilege(v_role, format('public.%s', v_table), v_priv) THEN
          RAISE EXCEPTION
            '068_LOCKDOWN: % still has % on public.%',
            v_role, v_priv, v_table;
        END IF;
      END LOOP;
    END LOOP;

    FOREACH v_priv IN ARRAY v_write_privs LOOP
      IF has_table_privilege(v_role, 'public.tournaments', v_priv) THEN
        RAISE EXCEPTION
          '068_LOCKDOWN: % still has % on public.tournaments',
          v_role, v_priv;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

COMMIT;
