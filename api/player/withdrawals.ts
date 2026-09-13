import { PLAYER_WITHDRAWALS_PATH, handleVercelPlayerWithdrawals } from '../../server/player/playerWithdrawalHttp.js';

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
  await handleVercelPlayerWithdrawals(req, res, PLAYER_WITHDRAWALS_PATH);
}
