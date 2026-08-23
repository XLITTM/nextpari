import { ensureLocalGuest, persistLocalBalance, notifyWalletSync } from '../../lib/playerProfile';
import { supabase } from '../../lib/supabase';

export async function persistWalletBalance(next: number): Promise<{ ok: true; balance: number } | { ok: false }> {
  const amount = Number(Math.max(0, next).toFixed(2));
  const saved = await writeWalletsBalance(amount);
  if (!saved) return { ok: false };
  persistLocalBalance(amount);
  notifyWalletSync();
  await syncProfilesBalance(amount);
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
    console.error('Failed to read wallets balance:', readError.message);
    return false;
  }

  const walletId = rows?.[0]?.id as string | undefined;
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
    console.error('Failed to update wallets balance:', error?.message ?? retry.error.message);
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
  if (!inserted.error && inserted.data?.id) return true;
  console.error('Failed to persist wallets balance:', inserted.error?.message);
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
    // profiles table is optional in this project
  }
}

export async function commitWalletBalance(next: number): Promise<'ok' | 'skip' | 'error'> {
  const result = await persistWalletBalance(next);
  return result.ok ? 'ok' : 'error';
}
