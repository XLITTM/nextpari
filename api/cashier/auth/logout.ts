import { CASHIER_AUTH_LOGOUT_PATH, handleVercelCashierAuth } from '../../../server/staff/cashierAuthHttp.js';

export default async function handler(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
  },
  res: {
    status: (code: number) => unknown;
    setHeader: (name: string, value: string | string[]) => unknown;
    json: (body: unknown) => unknown;
  },
): Promise<void> {
  await handleVercelCashierAuth(req, res, CASHIER_AUTH_LOGOUT_PATH);
}
