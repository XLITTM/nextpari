export const OWNER_AUTH_STORAGE_KEY = 'nextpari-owner-auth-v1';
export const LEGACY_OWNER_SESSION_KEY = 'nextpari-owner-session';
export const LEGACY_BACKOFFICE_SESSION_KEY = 'nextpari-backoffice-session';

export interface OwnerStaffContext {
  authUserId: string;
  role: 'owner';
  status: 'active';
  displayName: string;
  networkId: string | null;
}

export interface OwnerAuthSession {
  access_token: string;
}

export interface OwnerAuthPorts {
  signInWithPassword: (input: {
    email: string;
    password: string;
  }) => Promise<{ session: OwnerAuthSession | null; error: { message?: string } | null }>;
  signOut: () => Promise<void>;
  getSession: () => Promise<OwnerAuthSession | null>;
  currentStaffContext: () => Promise<unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function firstRow(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return asRecord(data[0]);
  return asRecord(data);
}

export function assertActiveOwnerContext(raw: unknown): OwnerStaffContext {
  const rec = firstRow(raw);
  const role = String(rec.role ?? '');
  const status = String(rec.status ?? '');
  if (role !== 'owner') {
    throw new Error(role ? 'OWNER_REQUIRED' : 'STAFF_ACCOUNT_NOT_FOUND');
  }
  if (status !== 'active') {
    throw new Error(status === 'blocked' ? 'STAFF_ACCOUNT_BLOCKED' : 'STAFF_ACCOUNT_DISABLED');
  }
  const authUserId = String(rec.auth_user_id ?? rec.authUserId ?? '');
  if (!authUserId) throw new Error('STAFF_ACCOUNT_NOT_FOUND');
  return {
    authUserId,
    role: 'owner',
    status: 'active',
    displayName: String(rec.display_name ?? rec.displayName ?? ''),
    networkId: rec.network_id == null && rec.networkId == null
      ? null
      : String(rec.network_id ?? rec.networkId),
  };
}

export function accessTokenOf(session: OwnerAuthSession | null | undefined): string | null {
  const token = session?.access_token?.trim() ?? '';
  return token || null;
}

export async function authenticateOwnerWithPassword(
  ports: OwnerAuthPorts,
  email: string,
  password: string,
): Promise<{ accessToken: string; staff: OwnerStaffContext }> {
  const trimmedEmail = email.trim();
  if (!trimmedEmail || !password) {
    throw new Error('EMAIL_PASSWORD_REQUIRED');
  }
  const { session, error } = await ports.signInWithPassword({
    email: trimmedEmail,
    password,
  });
  if (error) {
    throw new Error(error.message || 'AUTH_FAILED');
  }
  const accessToken = accessTokenOf(session);
  if (!accessToken) {
    await ports.signOut();
    throw new Error('SESSION_NOT_CREATED');
  }
  try {
    const staff = assertActiveOwnerContext(await ports.currentStaffContext());
    return { accessToken, staff };
  } catch (err) {
    await ports.signOut();
    throw err;
  }
}

export async function restoreOwnerStaffSession(
  ports: OwnerAuthPorts,
): Promise<{ accessToken: string; staff: OwnerStaffContext } | null> {
  const session = await ports.getSession();
  const accessToken = accessTokenOf(session);
  if (!accessToken) return null;
  try {
    const staff = assertActiveOwnerContext(await ports.currentStaffContext());
    return { accessToken, staff };
  } catch (err) {
    await ports.signOut();
    throw err;
  }
}

export async function signOutOwner(ports: OwnerAuthPorts): Promise<void> {
  await ports.signOut();
}

export function clearOwnerAuthStorage(storage: {
  removeItem: (key: string) => void;
}): void {
  storage.removeItem(OWNER_AUTH_STORAGE_KEY);
  storage.removeItem(LEGACY_OWNER_SESSION_KEY);
  storage.removeItem(LEGACY_BACKOFFICE_SESSION_KEY);
}

export function ownerPortalUsesPlayerStorage(
  ownerKey: string,
  playerKey: string,
): boolean {
  return ownerKey === playerKey;
}
