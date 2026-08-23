import { persistLocalBalance, notifyWalletSync, ensureLocalGuest } from '../../lib/playerProfile';
import { useUserStore } from '../../stores/userStore';
import { supabase } from '../../lib/supabase';

export async function persistWalletBalance(next: number): Promise<{ ok: true; balance: number }> {
  const amount = Number(Math.max(0, next).toFixed(2));
  persistLocalBalance(amount);
  useUserStore.getState().setBalance(amount);
  notifyWalletSync();
  void writeWalletsBalance(amount).then((ok) => {
    if (ok) void syncProfilesBalance(amount);
  });
  return { ok: true, balance: amount };
}

async function writeWalletsBalance(amount: number): Promise<boolean> {
  const stamp = new Date().toISOString();
  const { data: rows, error: readError } = await supabase
    .from('wallets')
    .select('id, balance')
    .order('created_at', { ascending: true })
    .limit(1);

  if (readError) {
    console.warn('Wallet sync skipped:', readError.message);
    return false;
  }

  const walletId = (rows?.[0]?.id as string | undefined) ?? useUserStore.getState().walletId ?? undefined;
  if (walletId) {
    const { data, error } = await supabase
      .from('wallets')
      .update({ balance: amount, updated_at: stamp })
      .eq('id', walletId)
      .select('id, balance')
      .maybeSingle();
    if (!error && data?.id) return true;

    const retry = await supabase
      .from('wallets')
      .update({ balance: amount, updated_at: stamp })
      .eq('id', walletId);
    if (!retry.error) return true;
    console.warn('Failed to update wallets balance:', error?.message ?? retry.error.message);
    return false;
  }

  const inserted = await supabase
    .from('wallets')
    .insert({
      balance: amount,
      currency: 'TMTM',
      public_id: ensureLocalGuest().publicId,
      updated_at: stamp,
    })
    .select('id, balance')
    .maybeSingle();
  if (!inserted.error && inserted.data?.id) {
    useUserStore.getState().hydrate({
      publicId: useUserStore.getState().publicId,
      balance: amount,
      walletId: inserted.data.id as string,
    });
    return true;
  }
  console.warn('Failed to persist wallets balance:', inserted.error?.message);
  return false;
}

async function syncProfilesBalance(amount: number): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getUser();
    const userId = sessionData.user?.id;
    const payload = { balance: amount };
    if (userId) {
      const byId = await supabase.from('profiles').update(payload).eq('id', userId);
      if (!byId.error) return;
      const byUser = await supabase.from('profiles').update(payload).eq('user_id', userId);
      if (!byUser.error) return;
    }

    const { data: row } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
    if (row?.id) {
      await supabase.from('profiles').update(payload).eq('id', row.id);
    }
  } catch {
    /* profiles table is optional */
  }
}

export async function commitWalletBalance(next: number): Promise<'ok' | 'skip' | 'error'> {
  await persistWalletBalance(next);
  return 'ok';
}
