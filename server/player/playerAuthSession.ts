import { createServiceRoleClient } from '../supabase/admin.js';
import { loadStaffOnboardingEnv } from '../staff/env.js';
import { staffError } from '../staff/errors.js';

const SESSION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sessionIdFromVerifiedAccessToken(accessToken: string): string | null {
  const parts = String(accessToken ?? '').split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as Record<string, unknown>;
    const sessionId = String(payload.session_id ?? '').trim();
    return SESSION_UUID_RE.test(sessionId) ? sessionId.toLowerCase() : null;
  } catch {
    return null;
  }
}

function staffClient() {
  const loaded = loadStaffOnboardingEnv();
  return createServiceRoleClient(loaded.supabaseUrl, loaded.supabaseServiceRoleKey);
}

export async function liveAssertPlayerAuthSession(userId: string, sessionId: string): Promise<boolean> {
  if (!userId || !sessionId) return false;
  try {
    const client = staffClient();
    const { data, error } = await client.rpc('player_auth_session_is_active', {
      p_player_user_id: userId,
      p_session_id: sessionId,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export async function liveRevokePlayerAuthSessions(userId: string): Promise<number> {
  const client = staffClient();
  const { data, error } = await client.rpc('player_password_recovery_revoke_sessions', {
    p_player_user_id: userId,
  });
  if (error) {
    throw staffError('PASSWORD_RESET_SESSION_REVOCATION_FAILED', 503);
  }
  const deleted = Number(data ?? 0);
  return Number.isFinite(deleted) ? deleted : 0;
}
