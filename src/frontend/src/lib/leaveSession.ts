import { usePlayerStore } from '../stores/player';

/**
 * Ends this browser's session with an account and lands on the returning-player login gate: forgets the local
 * identity tied to the account (keeping its name for the gate's "log back in as …") and makes a *full page load* of
 * `/`. The load, not an in-app navigation, is what stops every poller and drops every in-memory store the session
 * built up. Shared by logging out (`useLogout`) and by a refresh token the server rejected (`stores/auth.ts`).
 */
export function leaveToReturningLogin(accountName: string): void {
  usePlayerStore().forgetLocalIdentity(accountName);
  window.location.assign('/');
}
