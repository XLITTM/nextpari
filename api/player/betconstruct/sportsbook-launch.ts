import {
  PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH,
  handleVercelBetConstruct,
} from '../../../server/betconstruct/http.js';

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
  await handleVercelBetConstruct(req, res, PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH);
}
