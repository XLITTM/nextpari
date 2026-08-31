import { blockedGamesWager, GAMES_WAGER_GATE_MESSAGE } from '../../lib/playerMoneyGate';

export async function persistWalletBalance(_next: number): Promise<{ ok: false; error: string } | { ok: true; balance: number }> {
  const blocked = blockedGamesWager();
  if (blocked) {
    return { ok: false, error: blocked };
  }
  return { ok: false, error: GAMES_WAGER_GATE_MESSAGE };
}

export async function commitWalletBalance(_next: number): Promise<'ok' | 'skip' | 'error'> {
  return 'skip';
}
