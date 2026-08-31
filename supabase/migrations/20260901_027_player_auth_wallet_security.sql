-- Phase 027: player auth + wallet security cutover
-- Browser clients must not mint, update, or read another player's balance.
-- ensure_player_account remains the authenticated bootstrap RPC.
-- This file is written only; it is not executed by the cutover.

BEGIN;

DROP POLICY IF EXISTS "anon_select_wallets" ON public.wallets;
DROP POLICY IF EXISTS "anon_update_wallets" ON public.wallets;
DROP POLICY IF EXISTS "anon_insert_wallets" ON public.wallets;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.wallets FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.wallets FROM authenticated;

DROP POLICY IF EXISTS "player_select_own_wallet" ON public.wallets;
CREATE POLICY "player_select_own_wallet"
ON public.wallets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.wallet_id = wallets.id
  )
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'ensure_player_account'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    REVOKE ALL ON FUNCTION public.ensure_player_account() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.ensure_player_account() FROM anon;
    GRANT EXECUTE ON FUNCTION public.ensure_player_account() TO authenticated;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('private.wallet_accounts') IS NOT NULL THEN
    REVOKE ALL ON TABLE private.wallet_accounts FROM PUBLIC;
    REVOKE ALL ON TABLE private.wallet_accounts FROM anon;
    REVOKE ALL ON TABLE private.wallet_accounts FROM authenticated;
  END IF;
END
$$;

COMMIT;
