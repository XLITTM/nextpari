-- DO NOT APPLY FROM THIS REPOSITORY.
-- Review only. This is not a production migration and it is not
-- registered under supabase/migrations.
-- Stop if information_schema does not show group_control.brand_staff_grants
-- with brand_code, role, and staff_subject.
-- Do not put a password, an email, a phone number, or an invented UUID here.
-- The Group Owner app does not insert, update, or delete these rows.
-- Invite, suspend, and revoke stay refused until a later writer is approved.
-- Do not disable RLS. Do not grant writes to anon, authenticated,
-- service_role, or group_control_reader.

BEGIN;

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'group_control'
  AND table_name = 'brand_staff_grants'
ORDER BY ordinal_position;

ALTER TABLE group_control.brand_staff_grants
  ADD COLUMN IF NOT EXISTS status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'brand_staff_grants_status_check'
  ) THEN
    ALTER TABLE group_control.brand_staff_grants
      ADD CONSTRAINT brand_staff_grants_status_check
      CHECK (status IS NULL OR status IN ('active', 'suspended', 'revoked'));
  END IF;
END $$;

-- NULL status stays NULL. Do not backfill it as active.

CREATE TABLE IF NOT EXISTS group_control.brand_staff_permissions (
  brand_code text NOT NULL,
  staff_subject uuid NOT NULL,
  permission text NOT NULL,
  PRIMARY KEY (brand_code, staff_subject, permission),
  CONSTRAINT brand_staff_permissions_permission_check
    CHECK (permission IN ('players', 'balances', 'transactions', 'staff'))
);

CREATE TABLE IF NOT EXISTS group_control.staff_invitations (
  id uuid PRIMARY KEY,
  brand_code text NOT NULL,
  staff_subject uuid NOT NULL,
  role text NOT NULL,
  permission text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_invitations_role_check
    CHECK (role IN ('manager', 'cashier', 'security')),
  CONSTRAINT staff_invitations_permission_check
    CHECK (permission IN ('players', 'balances', 'transactions', 'staff')),
  CONSTRAINT staff_invitations_status_check
    CHECK (status IN ('pending', 'rejected'))
);

REVOKE ALL ON TABLE group_control.brand_staff_permissions FROM PUBLIC, anon, authenticated, service_role, group_control_reader;
REVOKE ALL ON TABLE group_control.staff_invitations FROM PUBLIC, anon, authenticated, service_role, group_control_reader;

GRANT SELECT (status) ON group_control.brand_staff_grants TO group_control_reader;
GRANT SELECT (brand_code, staff_subject, permission)
  ON group_control.brand_staff_permissions TO group_control_reader;
GRANT SELECT (id, brand_code, staff_subject, role, permission, status, created_at)
  ON group_control.staff_invitations TO group_control_reader;

ALTER TABLE group_control.brand_staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_control.brand_staff_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE group_control.staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_control.staff_invitations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS group_control_reader_select ON group_control.brand_staff_permissions;
CREATE POLICY group_control_reader_select
  ON group_control.brand_staff_permissions
  FOR SELECT
  TO group_control_reader
  USING (true);

DROP POLICY IF EXISTS group_control_reader_select ON group_control.staff_invitations;
CREATE POLICY group_control_reader_select
  ON group_control.staff_invitations
  FOR SELECT
  TO group_control_reader
  USING (true);

-- No INSERT, UPDATE, or DELETE policy. A forced RLS table with only a
-- SELECT policy rejects writes from the reader and from the table owner.

COMMIT;
