import { clearDemoPlayerState, fetchPlayerMe, signOutPlayer } from '../lib/playerAuth';

export const AUTH_KEY = 'nextpari-auth';

export function bootstrapGuestSession(): boolean {
  return false;
}

export function isAuthenticatedSession(): boolean {
  return false;
}

export function signInSession() {
  /* Player entry requires a real same-origin session. */
}

export function signOutSession() {
  void signOutPlayer();
}

export function readGuestPublicId(): string {
  return '';
}

export async function restorePlayerSession() {
  clearDemoPlayerState();
  return fetchPlayerMe();
}

export function subscribePlayerAuth(
  onSession: (authenticated: boolean) => void,
) {
  void fetchPlayerMe().then((snapshot) => {
    onSession(Boolean(snapshot?.authenticated));
  });
  return () => {
    /* same-origin session has no browser auth subscription */
  };
}
