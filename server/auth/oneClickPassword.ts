import { randomBytes, randomInt } from 'node:crypto';

const INTERNAL_AUTH_DOMAIN = 'auth.nextpari.invalid';
const ONE_CLICK_PASSWORD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ONE_CLICK_PASSWORD_LENGTH = 9;

export function generateOneClickPassword(): string {
  let password = '';
  for (let i = 0; i < ONE_CLICK_PASSWORD_LENGTH; i += 1) {
    password += ONE_CLICK_PASSWORD_ALPHABET[randomInt(ONE_CLICK_PASSWORD_ALPHABET.length)];
  }
  return password;
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
