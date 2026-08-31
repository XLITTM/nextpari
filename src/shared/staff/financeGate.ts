export function isOperationalMoneyEnabled(input: {
  activationPending?: boolean | null;
  migrationState?: string | null;
  status?: string | null;
}): boolean {
  return input.activationPending === false
    && String(input.migrationState ?? '').toLowerCase() === 'active'
    && String(input.status ?? '').toLowerCase() === 'active';
}

export function isOperationalAccountActive(input: {
  migrationState?: string | null;
  status?: string | null;
} | null | undefined): boolean {
  if (!input) return false;
  return String(input.migrationState ?? '').toLowerCase() === 'active'
    && String(input.status ?? '').toLowerCase() === 'active';
}

export function retainIdempotencyKey(
  slot: { key: string; fingerprint: string } | null,
  fingerprint: string,
): { key: string; fingerprint: string } {
  if (slot && slot.fingerprint === fingerprint) return slot;
  return { key: crypto.randomUUID(), fingerprint };
}

export function isAmbiguousStaffError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /NETWORK|INTERNAL|UNAVAILABLE|Failed to fetch|TypeError|timeout/i.test(message);
}
