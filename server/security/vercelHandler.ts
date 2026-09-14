import { handleVercelSecurityControl } from './securityControlHttp.js';
import type { StaffJsonResponse } from '../staff/httpHandler.js';

type VercelSecurityReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

function queryValue(
  query: VercelSecurityReq['query'],
  key: string,
): string {
  const value = query?.[key];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function vercelSecurityControl(
  fallback: string | ((query: VercelSecurityReq['query']) => string),
) {
  return async function handler(req: VercelSecurityReq, res: StaffJsonResponse): Promise<void> {
    const pathname = typeof fallback === 'function' ? fallback(req.query) : fallback;
    await handleVercelSecurityControl(req, res, pathname);
  };
}

export function vercelSecurityParam(
  key: string,
  build: (id: string) => string,
) {
  return vercelSecurityControl((query) => build(queryValue(query, key)));
}
