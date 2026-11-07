-- DO NOT APPLY FROM THIS REPOSITORY.
-- Do not run this against production until the catalog query below
-- shows every column that the GRANT lines name.
-- Do not add group_control to the Supabase Data API exposed schemas.
-- Do not put a password in this file. The owner types the password once
-- in the SQL editor and stores it only as GROUP_CONTROL_DATABASE_URL.
-- This file does not create a user, an email, or an owner UUID.

BEGIN;

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'group_control'
  AND table_name IN (
    'brands',
    'owner_identities',
    'owner_permissions',
    'brand_owners',
    'brand_staff_grants',
    'player_id_reservations',
    'brand_report_snapshots',
    'audit_events'
  )
ORDER BY table_name, ordinal_position;

-- Stop here if a GRANT column below is missing from that result.
-- Delete that GRANT line. Do not rename a live column to match this file.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'group_control_reader') THEN
    CREATE ROLE group_control_reader
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS
      CONNECTION LIMIT 5;
  END IF;
END $$;

REVOKE ALL ON SCHEMA group_control FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA group_control FROM PUBLIC, anon, authenticated, service_role, group_control_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA group_control FROM PUBLIC, anon, authenticated, service_role, group_control_reader;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA group_control FROM PUBLIC, anon, authenticated, service_role, group_control_reader;

GRANT CONNECT ON DATABASE postgres TO group_control_reader;
GRANT USAGE ON SCHEMA group_control TO group_control_reader;

GRANT SELECT (code, slug, display_name, status) ON group_control.brands TO group_control_reader;
GRANT SELECT (auth_user_id, id, status) ON group_control.owner_identities TO group_control_reader;
GRANT SELECT (owner_id, identity_id, permission) ON group_control.owner_permissions TO group_control_reader;
GRANT SELECT (owner_id, brand_code) ON group_control.brand_owners TO group_control_reader;
GRANT SELECT (brand_code, role, staff_subject) ON group_control.brand_staff_grants TO group_control_reader;
GRANT SELECT (public_id, brand_code, source) ON group_control.player_id_reservations TO group_control_reader;
GRANT SELECT (brand_code, currency, player_count, operational_status, deposits, withdrawals, ggr)
  ON group_control.brand_report_snapshots TO group_control_reader;
GRANT SELECT (id, actor, action, brand_code, created_at) ON group_control.audit_events TO group_control_reader;

-- The transaction pooler rejects statement_timeout in the startup packet.
-- This role default applies on the database side instead.
ALTER ROLE group_control_reader SET statement_timeout = '5s';
ALTER ROLE group_control_reader SET search_path = group_control;

-- The role is NOBYPASSRLS. If RLS is enabled and no SELECT policy exists,
-- a successful SELECT returns zero rows. Recovery must not treat that as an
-- invalid token. These policies let the reader see rows its column grants
-- already name. They do not grant INSERT, UPDATE, or DELETE.
-- Creating a policy does not enable RLS.

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY[
    'brands',
    'owner_identities',
    'owner_permissions',
    'brand_owners',
    'brand_staff_grants',
    'player_id_reservations',
    'brand_report_snapshots',
    'audit_events'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS group_control_reader_select ON group_control.%I', rel);
    EXECUTE format(
      'CREATE POLICY group_control_reader_select ON group_control.%I FOR SELECT TO group_control_reader USING (true)',
      rel
    );
  END LOOP;
END $$;

-- The owner sets the password in the SQL editor and does not commit that statement.

COMMIT;

-- First owner, run separately as the database owner after the role exists.
-- Create the Auth user in the Supabase Auth dashboard yourself.
-- Copy that user's UUID from the dashboard. Do not invent it.
-- Use auth_user_id when that column is the one the catalog showed.
-- Use id when auth_user_id is absent. Do not insert both guesses.
--
-- INSERT INTO group_control.owner_identities (auth_user_id, status)
-- VALUES ('<auth user uuid from the dashboard>', 'active');
--
-- INSERT INTO group_control.owner_permissions (owner_id, permission)
-- VALUES
--   ('<same auth user uuid>', 'brands.read'),
--   ('<same auth user uuid>', 'reports.read'),
--   ('<same auth user uuid>', 'staff.map');
--
-- INSERT INTO group_control.brand_owners (owner_id, brand_code)
-- VALUES ('<same auth user uuid>', '001');
--
-- Do not insert ids.reserve, brands.register, a treasury row, or a player balance.
-- Sign in to the Group Owner app only after these rows exist.
-- The app then allows TOTP enrollment. It does not create the Auth user.
