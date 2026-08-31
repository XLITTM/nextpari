import {
  OWNER_STAFF_MANAGER_PATH,
} from '../../../server/staff/httpHandler.js';
import { handleVercelOwnerStaff } from '../../../server/staff/vercelHandler.js';

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
  await handleVercelOwnerStaff(req, res, OWNER_STAFF_MANAGER_PATH);
}
