import { handleVercelOwnerExpress } from '../../../../server/sports/expressOfDayHttp.js';

export default async function handler(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    query?: Record<string, string | string[] | undefined>;
  },
  res: { status: (code: number) => unknown; setHeader: (name: string, value: string | string[]) => unknown; json: (body: unknown) => unknown },
): Promise<void> {
  const raw = req.query?.expressId;
  const id = Array.isArray(raw) ? raw[0] : raw;
  await handleVercelOwnerExpress(req, res, `/api/owner/express/${id ?? ''}/unpublish`);
}
