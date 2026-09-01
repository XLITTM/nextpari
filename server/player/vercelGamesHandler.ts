import { handleVercelPlayerGames } from './playerGamesHttp.js';
import type { StaffJsonResponse } from '../staff/httpHandler.js';

type VercelPlayerReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

function queryValue(
  query: VercelPlayerReq['query'],
  key: string,
): string {
  const value = query?.[key];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function vercelPlayerGames(
  fallback: string | ((query: VercelPlayerReq['query']) => string),
) {
  return async function handler(req: VercelPlayerReq, res: StaffJsonResponse): Promise<void> {
    const pathname = typeof fallback === 'function' ? fallback(req.query) : fallback;
    await handleVercelPlayerGames(req, res, pathname);
  };
}

export function vercelPlayerGameRound(
  build: (roundId: string) => string,
) {
  return vercelPlayerGames((query) => build(queryValue(query, 'roundId')));
}
