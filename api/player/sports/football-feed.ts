import { FOOTBALL_FEED_PATH, handleFootballFeedRequest } from '../../../server/betsapi/footballFeedHttp.js';

export default async function handler(
  req: { method?: string; url?: string },
  res: {
    status: (code: number) => unknown;
    setHeader: (name: string, value: string) => unknown;
    json: (body: unknown) => unknown;
  },
): Promise<void> {
  const result = await handleFootballFeedRequest({
    method: req.method,
    url: req.url ?? FOOTBALL_FEED_PATH,
  });
  res.status(result.status);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.json(result.body);
}
