import { handleVercelOwnerAuth, OWNER_AUTH_SESSION_PATH } from '../../../server/staff/ownerAuthHttp.js';

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
  await handleVercelOwnerAuth(req, res, OWNER_AUTH_SESSION_PATH);
}
