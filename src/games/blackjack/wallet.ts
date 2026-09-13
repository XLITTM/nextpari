export async function persistWalletBalance(next: number): Promise<{ ok: false; error: string } | { ok: true; balance: number }> {
  void next;
  return { ok: false, error: 'CLIENT_BALANCE_WRITE_FORBIDDEN' };
}

export async function commitWalletBalance(next: number): Promise<'ok' | 'skip' | 'error'> {
  void next;
  return 'skip';
}
