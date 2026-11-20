import { FOOTBALL_FEED_PATH, handleFootballFeedRequest } from '../../../server/betsapi/footballFeedHttp.js';
import { handleV5SportsFeed } from '../../../server/oddspapi/feedHttp.js';

export default async function handler(
  req: { method?: string; url?: string },
  res: {
    status: (code: number) => unknown;
    setHeader: (name: string, value: string) => unknown;
    json: (body: unknown) => unknown;
  },
): Promise<void> {
  const result = await (String(process.env.ODDSPAPI_V5_READONLY_FEED ?? '').trim() === '1' ? handleV5SportsFeed : handleFootballFeedRequest)({
    method: req.method,
    url: req.url ?? FOOTBALL_FEED_PATH,
  });
  res.status(result.status);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.json(result.body);
}
