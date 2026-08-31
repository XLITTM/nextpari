import { supabase } from './supabase';

export interface PlayerWalletBootstrap {
  walletId: string;
  publicId: string;
  balance: number;
  migrationState: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function firstRow(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

export async function ensureOwnPlayerWallet(): Promise<PlayerWalletBootstrap> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) {
    throw new Error('AUTH_REQUIRED');
  }

  const { data, error } = await supabase.rpc('ensure_player_account');
  if (error) {
    throw new Error(error.message || 'WALLET_UNAVAILABLE');
  }

  const row = firstRow(data);
  const walletId = String(row.wallet_id ?? row.walletId ?? '');
  const publicId = String(row.public_id ?? row.publicId ?? '').replace(/\D/g, '');
  if (!walletId || !publicId) {
    throw new Error('WALLET_UNAVAILABLE');
  }

  const own = await supabase
    .from('wallets')
    .select('id, balance, public_id')
    .eq('id', walletId)
    .maybeSingle();

  if (own.error) {
    throw new Error(own.error.message || 'WALLET_UNAVAILABLE');
  }

  const ownId = String(own.data?.id ?? '');
  if (ownId && ownId !== walletId) {
    throw new Error('WALLET_UNAVAILABLE');
  }

  const rpcBalance = Number(row.legacy_balance ?? row.legacyBalance);
  const tableBalance = own.data ? Number(own.data.balance) : NaN;
  const balance = Number.isFinite(tableBalance)
    ? tableBalance
    : Number.isFinite(rpcBalance)
      ? rpcBalance
      : NaN;

  if (!Number.isFinite(balance)) {
    throw new Error('WALLET_UNAVAILABLE');
  }

  return {
    walletId,
    publicId: String(own.data?.public_id ?? publicId).replace(/\D/g, '') || publicId,
    balance,
    migrationState: row.migration_state == null && row.migrationState == null
      ? null
      : String(row.migration_state ?? row.migrationState),
  };
}

export async function bootstrapOwnPlayerAccount() {
  return ensureOwnPlayerWallet();
}
