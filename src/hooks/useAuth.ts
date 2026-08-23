import { ensureLocalGuest } from '../lib/playerProfile';

export const AUTH_KEY = 'nextpari-auth';

export function bootstrapGuestSession(): boolean {
  ensureLocalGuest();
  if (typeof sessionStorage === 'undefined') return true;
  if (sessionStorage.getItem(AUTH_KEY) === '1') return true;
  sessionStorage.setItem(AUTH_KEY, '1');
  return true;
}

export function isAuthenticatedSession(): boolean {
  return sessionStorage.getItem(AUTH_KEY) === '1';
}

export function signInSession() {
  ensureLocalGuest();
  sessionStorage.setItem(AUTH_KEY, '1');
}

export function signOutSession() {
  sessionStorage.removeItem(AUTH_KEY);
}

export function readGuestPublicId(): string {
  return ensureLocalGuest().publicId;
}
