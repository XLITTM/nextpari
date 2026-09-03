import { INTERNAL_SPORTS_SETTLE_PATH, handleVercelSportsSettle } from '../../../server/sports/settleHttp.js';

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
  await handleVercelSportsSettle(req, res, INTERNAL_SPORTS_SETTLE_PATH);
}
