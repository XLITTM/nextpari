import { fetchPlayerMe } from './playerAuth';

export interface PlayerWalletBootstrap {
  publicId: string;
  balance: number;
  migrationState: string | null;
}

export async function ensureOwnPlayerWallet(): Promise<PlayerWalletBootstrap> {
  const snapshot = await fetchPlayerMe();
  if (!snapshot?.authenticated) {
    throw new Error('AUTH_REQUIRED');
  }
  return {
    publicId: snapshot.player.publicId,
    balance: snapshot.wallet.balance,
    migrationState: snapshot.wallet.migrationState,
  };
}

export async function bootstrapOwnPlayerAccount() {
  return ensureOwnPlayerWallet();
}
