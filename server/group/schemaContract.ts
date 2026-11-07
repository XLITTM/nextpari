export const GROUP_PROJECT_REF = 'lsmfdhenmceiammyptzu';
export const GROUP_READER_ROLE = 'group_control_reader';
export const GROUP_ROW_LIMIT = 200;

export const GROUP_READ_TABLES = [
  'brands',
  'owner_identities',
  'owner_permissions',
  'brand_owners',
  'brand_staff_grants',
  'player_id_reservations',
  'brand_report_snapshots',
  'audit_events',
] as const;

export type GroupReadTable = (typeof GROUP_READ_TABLES)[number];

/**
 * Columns the reader must find in the live catalog before it selects them.
 * Subject columns are chosen separately from the live catalog.
 * Treasury tables are intentionally absent.
 */
export const GROUP_READ_COLUMNS: Record<GroupReadTable, readonly string[]> = {
  brands: ['code', 'slug', 'display_name', 'status'],
  owner_identities: ['status'],
  owner_permissions: ['permission'],
  brand_owners: ['brand_code'],
  brand_staff_grants: ['brand_code', 'role', 'staff_subject'],
  player_id_reservations: ['public_id', 'brand_code', 'source'],
  brand_report_snapshots: ['brand_code', 'currency', 'player_count', 'operational_status', 'deposits', 'withdrawals', 'ggr'],
  audit_events: ['id', 'actor', 'action', 'brand_code', 'created_at'],
};

/**
 * Selected when the live catalog already has them.
 * A missing optional column is not GROUP_COLUMN_MISMATCH.
 */
export const GROUP_OPTIONAL_COLUMNS: Partial<Record<GroupReadTable, readonly string[]>> = {
  brand_staff_grants: ['status'],
};

/** Closed candidate lists. The live catalog picks the one column that exists. */
export const GROUP_SUBJECT_COLUMNS: Partial<Record<GroupReadTable, readonly string[]>> = {
  owner_identities: ['auth_user_id', 'id'],
  owner_permissions: ['owner_id', 'identity_id'],
  brand_owners: ['owner_id'],
};
