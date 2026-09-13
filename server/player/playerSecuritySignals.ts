import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { loadPlayerSecuritySignalPepper } from '../staff/env.js';
import {
  normalizePlayerEmail,
  normalizePlayerPhone,
  parseLoginPlayerId,
  validatePlayerEmail,
} from './playerValidators.js';

export const PLAYER_SECURITY_HASH_RE = /^[0-9a-f]{64}$/;
export const PLAYER_DEVICE_TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
export const PLAYER_DEVICE_TOKEN_BYTES = 32;

export type PlayerSecurityPepperState =
  | { ok: true; pepper: string }
  | { ok: false; reason: string };

export type PlayerSecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'REGISTER_SUCCESS'
  | 'REGISTER_FAILURE'
  | 'PASSWORD_CHANGED'
  | 'EMAIL_VERIFIED'
  | 'AUTH_RATE_LIMITED'
  | 'SHARED_DEVICE_SIGNAL'
  | 'SHARED_NETWORK_SIGNAL';

export type PlayerSecurityRiskLevel = 'info' | 'low' | 'medium' | 'high';

const warnedReasons = new Set<string>();

export function warnPlayerSecurityConfig(reason: string, log?: { error(event: string, fields: Record<string, unknown>): void }): void {
  if (warnedReasons.has(reason)) return;
  warnedReasons.add(reason);
  const fields = { reason };
  if (log) {
    log.error('player_security_telemetry_unconfigured', fields);
    return;
  }
  console.warn('player_security_telemetry_unconfigured', reason);
}

export function resetPlayerSecurityConfigWarnings(): void {
  warnedReasons.clear();
}

export function loadPlayerSecurityPepper(log?: { error(event: string, fields: Record<string, unknown>): void }): PlayerSecurityPepperState {
  const loaded = loadPlayerSecuritySignalPepper();
  if (!loaded.ok) {
    warnPlayerSecurityConfig(loaded.reason, log);
  }
  return loaded;
}

export function generatePlayerDeviceToken(): string {
  return randomBytes(PLAYER_DEVICE_TOKEN_BYTES).toString('base64url');
}

export function isPlayerDeviceToken(value: string | null | undefined): value is string {
  const token = String(value ?? '').trim();
  return PLAYER_DEVICE_TOKEN_RE.test(token);
}

export function hashPlayerSecuritySignal(kind: 'device' | 'net' | 'ua' | 'id', value: string, pepper: string): string {
  return createHmac('sha256', pepper).update(`${kind}:${value}`).digest('hex');
}

export function presentedLoginIdentifier(input: {
  mode?: unknown;
  email?: unknown;
  identifier?: unknown;
  phone?: unknown;
}): string {
  const mode = String(input.mode ?? '').trim().toLowerCase();
  const email = String(input.email ?? '').trim();
  const phone = String(input.phone ?? '').trim();
  const identifier = String(input.identifier ?? '').trim();
  if (mode === 'phone' || (!mode && phone && !email)) {
    return normalizePlayerPhone(phone);
  }
  if (mode === 'identifier') {
    if (!validatePlayerEmail(identifier)) return normalizePlayerEmail(identifier);
    return parseLoginPlayerId(identifier) ?? identifier;
  }
  if (email) return normalizePlayerEmail(email);
  if (phone) return normalizePlayerPhone(phone);
  return identifier;
}

export function presentedRegisterIdentifier(input: {
  method?: unknown;
  email?: unknown;
  phone?: unknown;
}): string {
  const method = String(input.method ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (method === 'phone') return normalizePlayerPhone(String(input.phone ?? ''));
  if (method === 'email') return normalizePlayerEmail(String(input.email ?? ''));
  return '';
}

export function firstForwardedAddress(value: string | undefined): string {
  return String(value ?? '').split(',')[0]?.trim() ?? '';
}

export function normalizeNetworkAddress(raw: string | undefined): string | null {
  let value = String(raw ?? '').trim();
  if (!value) return null;
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1).trim();
  }
  if (value.startsWith('[') && value.includes(']')) {
    const end = value.indexOf(']');
    const inner = value.slice(1, end);
    const rest = value.slice(end + 1);
    value = rest.startsWith(':') ? inner : inner;
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.slice(0, value.lastIndexOf(':'));
  }
  const zone = value.indexOf('%');
  if (zone >= 0) value = value.slice(0, zone);
  value = value.toLowerCase();

  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) value = mapped[1];

  const kind = isIP(value);
  if (kind === 4) return value;
  if (kind === 6) return canonicalizeIPv6(value);
  return null;
}

function canonicalizeIPv6(ip: string): string {
  const halves = ip.split('::');
  let groups: string[];
  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
    const right = halves[1] ? halves[1].split(':').filter(Boolean) : [];
    const fill = Math.max(0, 8 - left.length - right.length);
    groups = [...left, ...Array.from({ length: fill }, () => '0'), ...right];
  } else {
    groups = ip.split(':');
  }
  if (groups.length !== 8) return ip;
  return groups.map((group) => group.padStart(4, '0')).join(':');
}

export function coarseUserAgent(raw: string | undefined): string | null {
  const value = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 256);
  return value || null;
}

export function trustedNetworkAddressForHash(trustedNetworkAddress?: string | null): string | null {
  return normalizeNetworkAddress(trustedNetworkAddress ?? undefined);
}

const FORBIDDEN_META_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'ip',
  'deviceid',
  'devicetoken',
  'useragent',
  'pepper',
  'apikey',
  'servicerolekey',
  'servicerole',
  'network',
]);

const FORBIDDEN_META_TEXT = /(password|access_token|refresh_token|authorization|service_role|pepper|api[_-]?key|device_token|bearer )/i;
const RAW_IPV4_TEXT = /(^|[^0-9])((25[0-5]|2[0-4][0-9]|[01]?\d{1,2})\.){3}(25[0-5]|2[0-4][0-9]|[01]?\d{1,2})([^0-9]|$)/;

export function sanitizePlayerSecurityMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const compact = key.toLowerCase().replace(/[_-]/g, '');
    if (FORBIDDEN_META_KEYS.has(compact)) continue;
    if (typeof nested === 'string' && (FORBIDDEN_META_TEXT.test(nested) || RAW_IPV4_TEXT.test(nested))) {
      continue;
    }
    if (nested && typeof nested === 'object') continue;
    out[key] = nested;
  }
  const dumped = JSON.stringify(out);
  if (FORBIDDEN_META_TEXT.test(dumped) || RAW_IPV4_TEXT.test(dumped)) return {};
  return out;
}
