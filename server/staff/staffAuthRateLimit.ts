import { createHash } from 'node:crypto';
import { createServiceRoleClient } from '../supabase/admin.js';
import { firstForwardedAddress, normalizeNetworkAddress } from '../player/playerSecuritySignals.js';
import { loadStaffOnboardingEnv } from './env.js';

export const STAFF_AUTH_IDENTIFIER_MAX_HITS = 8;
export const STAFF_AUTH_NETWORK_MAX_HITS = 40;
export const STAFF_AUTH_WINDOW_SECONDS = 15 * 60;

export const STAFF_AUTH_RATE_LIMITED = 'STAFF_AUTH_RATE_LIMITED';
export const STAFF_AUTH_RATE_LIMIT_UNAVAILABLE = 'STAFF_AUTH_RATE_LIMIT_UNAVAILABLE';

export type StaffAuthLoginRole = 'owner' | 'manager' | 'cashier' | 'security';

export const STAFF_AUTH_RATE_LIMIT_SCOPES = {
  owner: {
    identifier: 'staff-auth:owner:identifier',
    network: 'staff-auth:owner:network',
  },
  manager: {
    identifier: 'staff-auth:manager:identifier',
    network: 'staff-auth:manager:network',
  },
  cashier: {
    identifier: 'staff-auth:cashier:identifier',
    network: 'staff-auth:cashier:network',
  },
  security: {
    identifier: 'staff-auth:security:identifier',
    network: 'staff-auth:security:network',
  },
} as const;

export interface StaffAuthRateLimitConsumeInput {
  scope: string;
  keyHash: string;
  maxHits: number;
  windowSeconds: number;
}

export interface StaffAuthRateLimitConsumeResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface StaffAuthRateLimitPorts {
  consume(input: StaffAuthRateLimitConsumeInput): Promise<StaffAuthRateLimitConsumeResult>;
}

export type StaffAuthRateLimitDecision =
  | { ok: true }
  | {
    ok: false;
    status: 429;
    error: typeof STAFF_AUTH_RATE_LIMITED;
    retryAfterSeconds: number | null;
  }
  | {
    ok: false;
    status: 503;
    error: typeof STAFF_AUTH_RATE_LIMIT_UNAVAILABLE;
  };

const HASH_RE = /^[0-9a-f]{64}$/;

export function normalizeStaffAuthEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function hashStaffAuthSignal(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function trustedStaffForwardedAddress(
  forwardedFor: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return normalizeNetworkAddress(firstForwardedAddress(raw));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function parseStaffAuthRateLimitResult(data: unknown): StaffAuthRateLimitConsumeResult {
  const row = Array.isArray(data) ? data[0] : data;
  const rec = asRecord(row);
  if (!rec || typeof rec.allowed !== 'boolean') {
    throw new Error(STAFF_AUTH_RATE_LIMIT_UNAVAILABLE);
  }
  const retryRaw = rec.retry_after_seconds ?? rec.retryAfterSeconds;
  const retry = typeof retryRaw === 'number' && Number.isFinite(retryRaw)
    ? Math.max(0, Math.floor(retryRaw))
    : 0;
  return { allowed: rec.allowed, retryAfterSeconds: retry };
}

export function liveStaffAuthRateLimitPorts(): StaffAuthRateLimitPorts {
  const env = loadStaffOnboardingEnv();
  const client = createServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  return {
    async consume(input) {
      if (!HASH_RE.test(input.keyHash)) {
        throw new Error(STAFF_AUTH_RATE_LIMIT_UNAVAILABLE);
      }
      const { data, error } = await client.rpc('staff_auth_rate_limit_consume', {
        p_scope: input.scope,
        p_key_hash: input.keyHash,
        p_max_hits: input.maxHits,
        p_window_seconds: input.windowSeconds,
      });
      if (error) {
        throw new Error(STAFF_AUTH_RATE_LIMIT_UNAVAILABLE);
      }
      return parseStaffAuthRateLimitResult(data);
    },
  };
}

export function staffAuthRateLimitHttpFields(
  decision: Exclude<StaffAuthRateLimitDecision, { ok: true }>,
): {
  status: 429 | 503;
  body: { ok: false; error: string };
  headers?: Record<string, string>;
} {
  return {
    status: decision.status,
    body: { ok: false, error: decision.error },
    headers: decision.status === 429 && decision.retryAfterSeconds
      ? { 'Retry-After': String(decision.retryAfterSeconds) }
      : undefined,
  };
}

export function staffAuthRateLimitFromPorts(
  ports: { staffAuthRateLimit?: StaffAuthRateLimitPorts } | undefined,
): StaffAuthRateLimitPorts {
  return ports?.staffAuthRateLimit ?? liveStaffAuthRateLimitPorts();
}

export async function enforceStaffAuthLoginLimit(input: {
  role: StaffAuthLoginRole;
  normalizedIdentifier: string;
  networkAddress: string | null;
  ports: StaffAuthRateLimitPorts;
}): Promise<StaffAuthRateLimitDecision> {
  const scopes = STAFF_AUTH_RATE_LIMIT_SCOPES[input.role];
  try {
    const identifier = await input.ports.consume({
      scope: scopes.identifier,
      keyHash: hashStaffAuthSignal(`${scopes.identifier}:${input.normalizedIdentifier}`),
      maxHits: STAFF_AUTH_IDENTIFIER_MAX_HITS,
      windowSeconds: STAFF_AUTH_WINDOW_SECONDS,
    });
    const network = input.networkAddress
      ? await input.ports.consume({
        scope: scopes.network,
        keyHash: hashStaffAuthSignal(`${scopes.network}:${input.networkAddress}`),
        maxHits: STAFF_AUTH_NETWORK_MAX_HITS,
        windowSeconds: STAFF_AUTH_WINDOW_SECONDS,
      })
      : null;
    if (!identifier.allowed || (network != null && !network.allowed)) {
      const retry = Math.max(
        identifier.allowed ? 0 : identifier.retryAfterSeconds,
        network != null && !network.allowed ? network.retryAfterSeconds : 0,
      );
      return {
        ok: false,
        status: 429,
        error: STAFF_AUTH_RATE_LIMITED,
        retryAfterSeconds: retry > 0 ? retry : null,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      status: 503,
      error: STAFF_AUTH_RATE_LIMIT_UNAVAILABLE,
    };
  }
}
