const PUBLIC_ID_RE = /^[0-9]{6}$/;
const INT32_MAX = 2147483647;

export function casinoPlayerIdFromPublicId(publicId: string): {
  playerId: number;
  canonicalPublicId: string;
} {
  const canonicalPublicId = String(publicId ?? '').trim();
  if (!PUBLIC_ID_RE.test(canonicalPublicId)) {
    throw new Error('BETCONSTRUCT_PLAYER_ID_INVALID');
  }
  const playerId = Number(canonicalPublicId);
  if (!Number.isInteger(playerId) || playerId < 0 || playerId > INT32_MAX) {
    throw new Error('BETCONSTRUCT_PLAYER_ID_INVALID');
  }
  return { playerId, canonicalPublicId };
}

export function canonicalPublicIdFromPlayerId(playerId: number): string {
  if (!Number.isInteger(playerId) || playerId < 0 || playerId > INT32_MAX) {
    throw new Error('BETCONSTRUCT_PLAYER_ID_INVALID');
  }
  return String(playerId).padStart(6, '0');
}

export function assertPlayerIdMatches(publicId: string, providerPlayerId: unknown): void {
  const expected = casinoPlayerIdFromPublicId(publicId).playerId;
  const incoming = Number(providerPlayerId);
  if (!Number.isInteger(incoming) || incoming !== expected) {
    throw new Error('WRONG_PLAYER_ID');
  }
}

export function provePublicIdIntegerUnique(publicIds: string[]): boolean {
  const seen = new Set<number>();
  const reverse = new Set<string>();
  for (const id of publicIds) {
    const mapped = casinoPlayerIdFromPublicId(id);
    if (seen.has(mapped.playerId)) return false;
    const back = canonicalPublicIdFromPlayerId(mapped.playerId);
    if (back !== mapped.canonicalPublicId) return false;
    if (reverse.has(back)) return false;
    seen.add(mapped.playerId);
    reverse.add(back);
  }
  return true;
}
