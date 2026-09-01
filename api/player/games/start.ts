import { PLAYER_GAMES_START_PATH, handleVercelPlayerGames } from '../../../server/player/playerGamesHttp.js';

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
  await handleVercelPlayerGames(req, res, PLAYER_GAMES_START_PATH);
}
