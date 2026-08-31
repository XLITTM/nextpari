import { ensureOwnPlayerWallet } from './playerWallet';

export const PLAYER_PROFILE_KEY = 'nextpari-player-profile';
export const PLAYER_BALANCE_KEY = 'player_balance';
export const WALLET_SYNC_EVENT = 'nextpari-wallet-sync';

export function notifyWalletSync() {
  window.dispatchEvent(new Event(WALLET_SYNC_EVENT));
  try {
    const channel = new BroadcastChannel(WALLET_SYNC_EVENT);
    channel.postMessage('refresh');
    channel.close();
  } catch {
    /* BroadcastChannel may be unavailable */
  }
}

export async function syncPlayerWallet(): Promise<{
  publicId: string;
  balance: number;
  walletId: string | null;
}> {
  const wallet = await ensureOwnPlayerWallet();
  return {
    publicId: wallet.publicId,
    balance: wallet.balance,
    walletId: null,
  };
}

export function persistLocalBalance(_balance: number) {
  /* Local balances are not financial authority. */
}

export function creditPlayerBalanceLocal(_amount: number): number {
  return 0;
}

export function readPlayerBalance(_fallback = 0): number {
  return 0;
}

export function writePlayerBalance(_balance: number) {
  return 0;
}
