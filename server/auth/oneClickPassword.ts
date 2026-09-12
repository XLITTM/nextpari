import { randomBytes } from 'node:crypto';

const INTERNAL_AUTH_DOMAIN = 'auth.nextpari.invalid';

export function generateOneClickPassword(): string {
  return randomBytes(18).toString('base64url');
}

export function generateInternalAuthEmail(): string {
  return `${randomBytes(16).toString('hex')}@${INTERNAL_AUTH_DOMAIN}`;
}

export function isInternalAuthEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${INTERNAL_AUTH_DOMAIN}`);
}

export function publicAuthEmail(email: string): string {
  const value = email.trim();
  if (!value || isInternalAuthEmail(value)) return '';
  return value;
}
