import { handleVercelPlayerResults } from '../../../server/sports/resultsHttp.js';

export default async function handler(
  req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined> },
  res: { status: (code: number) => unknown; setHeader: (name: string, value: string | string[]) => unknown; json: (body: unknown) => unknown },
): Promise<void> {
  await handleVercelPlayerResults(req, res, '/api/player/sports/results');
}
