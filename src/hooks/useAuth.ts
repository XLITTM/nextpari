import { clearDemoPlayerState, getPlayerSession, signOutPlayer } from '../lib/playerAuth';
import { supabase } from '../lib/supabase';

export const AUTH_KEY = 'nextpari-auth';

export function bootstrapGuestSession(): boolean {
  return false;
}

export function isAuthenticatedSession(): boolean {
  return false;
}

export function signInSession() {
  /* Player entry requires a real Supabase session. */
}

export function signOutSession() {
  void signOutPlayer();
}

export function readGuestPublicId(): string {
  return '';
}

export async function restorePlayerSession() {
  clearDemoPlayerState();
  return getPlayerSession();
}

export function subscribePlayerAuth(
  onSession: (authenticated: boolean) => void,
) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    onSession(Boolean(session?.user));
  });
  return () => {
    data.subscription.unsubscribe();
  };
}
