import { handleVercelCashierControl } from './cashierControlHttp.js';
import type { StaffJsonResponse } from '../staff/httpHandler.js';

type VercelCashierReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

function queryValue(
  query: VercelCashierReq['query'],
  key: string,
): string {
  const value = query?.[key];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function vercelCashierControl(
  fallback: string | ((query: VercelCashierReq['query']) => string),
) {
  return async function handler(req: VercelCashierReq, res: StaffJsonResponse): Promise<void> {
    const pathname = typeof fallback === 'function' ? fallback(req.query) : fallback;
    await handleVercelCashierControl(req, res, pathname);
  };
}

export function vercelCashierParam(
  key: string,
  build: (id: string) => string,
) {
  return vercelCashierControl((query) => build(queryValue(query, key)));
}
