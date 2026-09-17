import { createHash } from 'node:crypto';

export function digestAuthToken(rawToken: string): string {
  return createHash('sha256').update(String(rawToken ?? ''), 'utf8').digest('hex');
}
