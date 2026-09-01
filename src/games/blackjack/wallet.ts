import { blockedGamesWager, GAMES_WAGER_GATE_MESSAGE } from '../../lib/playerMoneyGate';

export async function persistWalletBalance(_next: number): Promise<{ ok: false; error: string } | { ok: true; balance: number }> {
  return { ok: false, error: 'CLIENT_BALANCE_WRITE_FORBIDDEN' };
}

export async function commitWalletBalance(_next: number): Promise<'ok' | 'skip' | 'error'> {
  return 'skip';
}
