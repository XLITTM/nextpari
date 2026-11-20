import { BETSAPI_SETTLEMENT_JOB_PATH, handleBetsapiSettlementJob } from '../../../server/sports/betsapiSettlementRun.js';

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
  },
  res: {
    status: (code: number) => unknown;
    setHeader: (name: string, value: string) => unknown;
    json: (body: unknown) => unknown;
  },
): Promise<void> {
  const pathname = (req.url ?? BETSAPI_SETTLEMENT_JOB_PATH).split('?')[0] ?? '';
  if (pathname.replace(/\/$/, '') !== BETSAPI_SETTLEMENT_JOB_PATH) {
    res.status(404);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: false, error: 'NOT_FOUND' });
    return;
  }
  const result = await handleBetsapiSettlementJob({
    method: req.method,
    authorization: headerValue(req.headers, 'authorization'),
  });
  res.status(result.status);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.json(result.body);
}
