import { handleVercelManagerControl } from './managerControlHttp.js';
import type { StaffJsonResponse } from '../staff/httpHandler.js';

type VercelManagerReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

function queryValue(
  query: VercelManagerReq['query'],
  key: string,
): string {
  const value = query?.[key];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function vercelManagerControl(
  fallback: string | ((query: VercelManagerReq['query']) => string),
) {
  return async function handler(req: VercelManagerReq, res: StaffJsonResponse): Promise<void> {
    const pathname = typeof fallback === 'function' ? fallback(req.query) : fallback;
    await handleVercelManagerControl(req, res, pathname);
  };
}

export function vercelManagerParam(
  key: string,
  build: (id: string) => string,
) {
  return vercelManagerControl((query) => build(queryValue(query, key)));
}
