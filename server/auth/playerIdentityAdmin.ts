import { createServiceRoleClient } from '../supabase/admin.js';
import { loadStaffOnboardingEnv } from '../staff/env.js';
import { extractErrorCode, rpcMessage, staffError } from '../staff/errors.js';
import { generateInternalAuthEmail } from './oneClickPassword.js';

export type PlayerLoginResolve =
  | { ok: true; email: string }
  | { ok: false; reason: 'missing' | 'ambiguous' };

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function staffClient() {
  const env = loadStaffOnboardingEnv();
  return createServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey);
}

export async function resolvePlayerLoginEmail(
  kind: 'public_id' | 'phone',
  value: string,
): Promise<PlayerLoginResolve> {
  try {
    const client = staffClient();
    const { data, error } = await client.rpc('resolve_player_login_email', {
      p_kind: kind,
      p_value: value,
    });
    if (error) {
      const text = rpcMessage(error);
      const code = extractErrorCode(text) ?? '';
      if (code === 'AUTH_AMBIGUOUS') return { ok: false, reason: 'ambiguous' };
      return { ok: false, reason: 'missing' };
    }
    const email = String(data ?? '').trim();
    if (!email) return { ok: false, reason: 'missing' };
    return { ok: true, email };
  } catch {
    return { ok: false, reason: 'missing' };
  }
}

export async function claimPlayerLoginPhone(authUserId: string, phone: string): Promise<void> {
  const client = staffClient();
  const { error } = await client.rpc('claim_player_login_phone', {
    p_auth_user_id: authUserId,
    p_phone: phone,
  });
  if (error) {
    const text = rpcMessage(error);
    const code = extractErrorCode(text) ?? '';
    if (code === 'INVALID_PHONE') throw staffError('INVALID_PHONE', 400);
    throw staffError('REGISTRATION_FAILED', 409);
  }
}

export async function createManagedPasswordUser(input: {
  password: string;
  phone?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ id: string; email: string }> {
  const client = staffClient();
  const email = generateInternalAuthEmail();
  const metadata = asRecord(input.metadata);
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    phone: input.phone || undefined,
    phone_confirm: false,
    user_metadata: metadata,
  });
  if (error || !data.user?.id) {
    throw staffError('REGISTRATION_FAILED', 409);
  }
  return { id: data.user.id, email };
}

export async function deleteManagedAuthUser(id: string): Promise<void> {
  try {
    const client = staffClient();
    await client.auth.admin.deleteUser(id);
  } catch {
    /* best-effort cleanup */
  }
}
