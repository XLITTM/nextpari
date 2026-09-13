import type { IncomingMessage } from 'node:http';
import { ipAddress } from '@vercel/functions';
import { firstForwardedAddress, normalizeNetworkAddress } from './playerSecuritySignals.js';

export const PLAYER_SECURITY_TRUSTED_PROXY_ENV = 'PLAYER_SECURITY_TRUSTED_PROXY';

function headerValue(
  headers: IncomingMessage['headers'] | Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'string') return value;
  return undefined;
}

export function headersFromNodeRecord(
  headers: Record<string, string | string[] | undefined>,
): Headers {
  const out = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) out.append(key, item);
      }
      continue;
    }
    if (value) out.append(key, value);
  }
  return out;
}

export function isPlayerSecurityTrustedProxyEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = String(env[PLAYER_SECURITY_TRUSTED_PROXY_ENV] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function trustedClientAddressFromVercel(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const ip = ipAddress(headersFromNodeRecord(headers));
  return normalizeNetworkAddress(ip);
}

export function trustedClientAddressFromNode(
  req: Pick<IncomingMessage, 'headers' | 'socket'>,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (isPlayerSecurityTrustedProxyEnabled(env)) {
    const forwarded = headerValue(req.headers, 'x-forwarded-for');
    const realIp = headerValue(req.headers, 'x-real-ip');
    return normalizeNetworkAddress(firstForwardedAddress(forwarded))
      ?? normalizeNetworkAddress(realIp)
      ?? normalizeNetworkAddress(req.socket.remoteAddress);
  }
  return normalizeNetworkAddress(req.socket.remoteAddress);
}
