-- Phase 027C: bind personal_data to the authenticated player.
-- Not executed by this change. Auth user_metadata is the live profile store
-- until this migration is applied.

ALTER TABLE public.personal_data
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS personal_data_user_id_uidx
  ON public.personal_data (user_id)
  WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS "anon_select_personal_data" ON public.personal_data;
DROP POLICY IF EXISTS "anon_insert_personal_data" ON public.personal_data;
DROP POLICY IF EXISTS "anon_update_personal_data" ON public.personal_data;
DROP POLICY IF EXISTS "anon_delete_personal_data" ON public.personal_data;

REVOKE ALL ON TABLE public.personal_data FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.personal_data FROM authenticated;

CREATE POLICY personal_data_select_own
  ON public.personal_data
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY personal_data_insert_own
  ON public.personal_data
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY personal_data_update_own
  ON public.personal_data
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
