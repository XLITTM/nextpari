import { supabase } from './supabase';
import { fetchWallet } from './bets';

export const PLAYER_PROFILE_KEY = 'nextpari-player-profile';
export const WALLET_SYNC_EVENT = 'nextpari-wallet-sync';
export const DEMO_BALANCE = 1000;

export interface PlayerProfile {
  publicId: string;
  walletId: string | null;
  demoBalance: number;
}

function digitsId(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return /^\d{4,8}$/.test(digits) ? digits : null;
}

export function generatePublicId(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

export function readLocalProfile(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(PLAYER_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    const publicId = digitsId(parsed.publicId);
    if (!publicId) return null;
    return {
      publicId,
      walletId: typeof parsed.walletId === 'string' ? parsed.walletId : null,
      demoBalance: Number.isFinite(Number(parsed.demoBalance)) ? Number(parsed.demoBalance) : DEMO_BALANCE,
    };
  } catch {
    return null;
  }
}

export function writeLocalProfile(profile: PlayerProfile) {
  localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify(profile));
}

export function ensureLocalGuest(): PlayerProfile {
  const existing = readLocalProfile();
  if (existing) return existing;
  const created: PlayerProfile = {
    publicId: generatePublicId(),
    walletId: null,
    demoBalance: DEMO_BALANCE,
  };
  writeLocalProfile(created);
  return created;
}

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
  const local = ensureLocalGuest();
  const remote = await fetchWallet();

  if (remote?.id) {
    const publicId = digitsId(remote.publicId) ?? local.publicId;
    if (!digitsId(remote.publicId)) {
      await supabase.from('wallets').update({ public_id: publicId }).eq('id', remote.id);
    }
    const next = { publicId, walletId: remote.id, demoBalance: remote.balance };
    writeLocalProfile(next);
    return { publicId, balance: remote.balance, walletId: remote.id };
  }

  const inserted = await supabase
    .from('wallets')
    .insert({
      balance: local.demoBalance,
      public_id: local.publicId,
      currency: 'TMTM',
      updated_at: new Date().toISOString(),
    })
    .select('id, balance, public_id')
    .maybeSingle();

  if (!inserted.error && inserted.data?.id) {
    const publicId = digitsId(inserted.data.public_id as string) ?? local.publicId;
    const balance = Number(inserted.data.balance ?? local.demoBalance);
    writeLocalProfile({ publicId, walletId: inserted.data.id as string, demoBalance: balance });
    return { publicId, balance, walletId: inserted.data.id as string };
  }

  return { publicId: local.publicId, balance: local.demoBalance, walletId: local.walletId };
}

export function persistLocalBalance(balance: number) {
  const local = ensureLocalGuest();
  writeLocalProfile({ ...local, demoBalance: Number(Math.max(0, balance).toFixed(2)) });
}
