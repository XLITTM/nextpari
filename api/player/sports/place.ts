import { PLAYER_SPORTS_PLACE_PATH, handleVercelPlayerSports } from '../../../server/player/sportsPlaceHttp.js';

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
  if (String(process.env.ODDSPAPI_V5_READONLY_FEED ?? '').trim() === '1') {
    res.status(503);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: false, error: 'SPORTSBOOK_EMERGENCY_STOP' });
    return;
  }
  await handleVercelPlayerSports(req, res, PLAYER_SPORTS_PLACE_PATH);
}
