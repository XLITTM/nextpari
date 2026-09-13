import { createServiceRoleClient } from '../supabase/admin.js';
import { loadStaffOnboardingEnv } from '../staff/env.js';
import { extractErrorCode, rpcMessage } from '../staff/errors.js';
import type { StaffLog } from '../staff/types.js';
import {
  hashPlayerSecuritySignal,
  isPlayerDeviceToken,
  loadPlayerSecurityPepper,
  sanitizePlayerSecurityMetadata,
  serverObservedNetworkAddress,
  coarseUserAgent,
  warnPlayerSecurityConfig,
  type PlayerSecurityEventType,
  type PlayerSecurityRiskLevel,
} from './playerSecuritySignals.js';
import { ensurePlayerDeviceCookie, type PlayerDeviceCookieResult } from './playerCookies.js';

export interface PlayerSecurityHashes {
  identifierHash: string | null;
  deviceHash: string | null;
  networkHash: string | null;
  userAgentHash: string | null;
}

export interface PlayerSecurityRecordInput extends PlayerSecurityHashes {
  playerUserId?: string | null;
  eventType: PlayerSecurityEventType;
  riskLevel?: PlayerSecurityRiskLevel;
  metadata?: Record<string, unknown>;
}

export interface PlayerSecurityPorts {
  checkLoginRateLimit: (hashes: PlayerSecurityHashes) => Promise<{ allowed: boolean }>;
  recordEvent: (input: PlayerSecurityRecordInput) => Promise<void>;
}

export interface PlayerSecurityObserver extends PlayerSecurityHashes {
  device: PlayerDeviceCookieResult;
  checkLoginRateLimit: () => Promise<boolean>;
  record: (
    eventType: PlayerSecurityEventType,
    playerUserId?: string | null,
    metadata?: Record<string, unknown>,
    riskLevel?: PlayerSecurityRiskLevel,
  ) => Promise<void>;
}

export interface PlayerSecurityBoundary {
  cookieHeader?: string;
  cookieSecure: boolean;
  forwardedFor?: string;
  realIp?: string;
  userAgent?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function riskForEvent(eventType: PlayerSecurityEventType, fallback?: PlayerSecurityRiskLevel): PlayerSecurityRiskLevel {
  if (fallback) return fallback;
  if (eventType === 'SHARED_DEVICE_SIGNAL') return 'high';
  if (eventType === 'SHARED_NETWORK_SIGNAL' || eventType === 'AUTH_RATE_LIMITED') return 'medium';
  if (eventType === 'LOGIN_FAILURE' || eventType === 'REGISTER_FAILURE') return 'low';
  return 'info';
}

export function buildPlayerSecurityHashes(input: {
  identifier?: string;
  deviceToken?: string | null;
  forwardedFor?: string;
  realIp?: string;
  userAgent?: string;
  log?: StaffLog;
}): PlayerSecurityHashes {
  const pepper = loadPlayerSecurityPepper(input.log);
  if (!pepper.ok) {
    return {
      identifierHash: null,
      deviceHash: null,
      networkHash: null,
      userAgentHash: null,
    };
  }
  const identifier = String(input.identifier ?? '').trim();
  const deviceToken = isPlayerDeviceToken(input.deviceToken) ? input.deviceToken : '';
  const network = serverObservedNetworkAddress({
    forwardedFor: input.forwardedFor,
    realIp: input.realIp,
  });
  const ua = coarseUserAgent(input.userAgent);
  return {
    identifierHash: identifier ? hashPlayerSecuritySignal('id', identifier, pepper.pepper) : null,
    deviceHash: deviceToken ? hashPlayerSecuritySignal('device', deviceToken, pepper.pepper) : null,
    networkHash: network ? hashPlayerSecuritySignal('net', network, pepper.pepper) : null,
    userAgentHash: ua ? hashPlayerSecuritySignal('ua', ua, pepper.pepper) : null,
  };
}

export function createPlayerSecurityObserver(
  boundary: PlayerSecurityBoundary & { device?: PlayerDeviceCookieResult },
  identifier: string,
  ports: PlayerSecurityPorts | undefined,
  log?: StaffLog,
): PlayerSecurityObserver {
  const device = boundary.device ?? ensurePlayerDeviceCookie(boundary.cookieHeader, boundary.cookieSecure);
  const hashes = buildPlayerSecurityHashes({
    identifier,
    deviceToken: device.token,
    forwardedFor: boundary.forwardedFor,
    realIp: boundary.realIp,
    userAgent: boundary.userAgent,
    log,
  });
  return {
    ...hashes,
    device,
    async checkLoginRateLimit() {
      if (!ports) return true;
      try {
        const result = await ports.checkLoginRateLimit(hashes);
        return result.allowed !== false;
      } catch {
        warnPlayerSecurityConfig('RATE_LIMIT_UNAVAILABLE', log);
        return true;
      }
    },
    async record(eventType, playerUserId, metadata, riskLevel) {
      if (!ports) return;
      try {
        await ports.recordEvent({
          ...hashes,
          playerUserId: playerUserId ?? null,
          eventType,
          riskLevel: riskForEvent(eventType, riskLevel),
          metadata: sanitizePlayerSecurityMetadata(metadata),
        });
      } catch {
        warnPlayerSecurityConfig('EVENT_INGEST_UNAVAILABLE', log);
      }
    },
  };
}

function securityClient(): ReturnType<typeof createServiceRoleClient> | null {
  try {
    const env = loadStaffOnboardingEnv();
    return createServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  } catch {
    warnPlayerSecurityConfig('SERVICE_ROLE_UNAVAILABLE');
    return null;
  }
}

export function livePlayerSecurityPorts(log?: StaffLog): PlayerSecurityPorts {
  return {
    async checkLoginRateLimit(hashes) {
      const client = securityClient();
      if (!client) return { allowed: true };
      const { data, error } = await client.rpc('player_security_check_login', {
        p_identifier_hash: hashes.identifierHash,
        p_device_hash: hashes.deviceHash,
        p_network_hash: hashes.networkHash,
      });
      if (error) {
        warnPlayerSecurityConfig(extractErrorCode(rpcMessage(error)) ?? 'CHECK_LOGIN_RPC_FAILED', log);
        return { allowed: true };
      }
      const rec = asRecord(data);
      return { allowed: rec.allowed !== false };
    },
    async recordEvent(input) {
      const client = securityClient();
      if (!client) return;
      const metadata = sanitizePlayerSecurityMetadata(input.metadata);
      const { error } = await client.rpc('player_security_record_event', {
        p_player_user_id: input.playerUserId ?? null,
        p_event_type: input.eventType,
        p_identifier_hash: input.identifierHash,
        p_device_hash: input.deviceHash,
        p_network_hash: input.networkHash,
        p_user_agent_hash: input.userAgentHash,
        p_risk_level: riskForEvent(input.eventType, input.riskLevel),
        p_metadata: metadata,
      });
      if (error) {
        warnPlayerSecurityConfig(extractErrorCode(rpcMessage(error)) ?? 'RECORD_EVENT_RPC_FAILED', log);
      }
    },
  };
}
