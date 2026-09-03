import { PLAYER_SPORTS_BETS_PATH, handleVercelPlayerSports } from '../../../server/player/sportsPlaceHttp.js';

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
  await handleVercelPlayerSports(req, res, PLAYER_SPORTS_BETS_PATH);
}
