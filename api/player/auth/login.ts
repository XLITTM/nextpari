import { PLAYER_AUTH_LOGIN_PATH, handleVercelPlayerAuth } from '../../../server/player/playerAuthHttp.js';

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
  await handleVercelPlayerAuth(req, res, PLAYER_AUTH_LOGIN_PATH);
}
