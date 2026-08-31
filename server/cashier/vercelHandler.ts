import { handleVercelCashierControl } from './cashierControlHttp.js';
import type { StaffJsonResponse } from '../staff/httpHandler.js';

type VercelCashierReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

export function vercelCashierControl(fallback: string) {
  return async function handler(req: VercelCashierReq, res: StaffJsonResponse): Promise<void> {
    await handleVercelCashierControl(req, res, fallback);
  };
}
