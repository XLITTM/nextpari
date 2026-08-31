import { handleVercelOwnerControl } from './ownerControlHttp.js';
import type { StaffJsonResponse } from '../staff/httpHandler.js';

type VercelOwnerReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

function queryValue(
  query: VercelOwnerReq['query'],
  key: string,
): string {
  const value = query?.[key];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function vercelOwnerControl(
  fallback: string | ((query: VercelOwnerReq['query']) => string),
) {
  return async function handler(req: VercelOwnerReq, res: StaffJsonResponse): Promise<void> {
    const pathname = typeof fallback === 'function' ? fallback(req.query) : fallback;
    await handleVercelOwnerControl(req, res, pathname);
  };
}

export function vercelOwnerParam(
  key: string,
  build: (id: string) => string,
) {
  return vercelOwnerControl((query) => build(queryValue(query, key)));
}
