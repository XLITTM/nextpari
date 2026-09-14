import { handleVercelSecurityAuth, SECURITY_AUTH_LOGOUT_PATH } from '../../../server/staff/securityAuthHttp.js';

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
  await handleVercelSecurityAuth(req, res, SECURITY_AUTH_LOGOUT_PATH);
}
