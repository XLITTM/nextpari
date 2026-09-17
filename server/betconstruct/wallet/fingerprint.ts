import { createHash } from 'node:crypto';

export function financialFingerprint(fields: Record<string, unknown>): string {
  const keys = Object.keys(fields).sort((a, b) => a.localeCompare(b));
  const payload: Record<string, unknown> = {};
  for (const key of keys) {
    const value = fields[key];
    if (value === undefined) continue;
    payload[key] = value;
  }
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

export function payloadHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? {}), 'utf8').digest('hex');
}

export function providerEconomicExternalId(canonicalId: string, leg: 'bet' | 'win' | 'payout' | 'rollback'): string {
  return `${canonicalId}:${leg}`;
}
