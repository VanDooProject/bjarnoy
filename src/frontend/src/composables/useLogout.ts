// Player logout/login gate: the account dropdown's "Log out" action
// (HudNav.vue). Deliberately ends in a *full page load*
// (`window.location.assign('/')`) rather than an in-app `router.push('/')`
// — logging out has to drop every in-memory store the session built up
// (the loaded WorldModel, HudNav's/ReportsStore's polling intervals, the
// selected settlement, …), and hand-resetting each one as new state gets
// added is exactly the kind of thing that quietly rots. A real navigation
// re-runs the whole app from scratch instead: the next load's
// `stablePlayerId()` (stores/player.ts) mints a fresh local identity since
// `forgetLocalIdentity` below has just cleared the old one.
import { useAuthStore } from '../stores/auth';
import { usePlayerStore } from '../stores/player';

export function useLogout() {
  const auth = useAuthStore();
  const player = usePlayerStore();

  async function logout() {
    // Read before auth.logout() clears the session — that's the only place
    // this account's username is available client-side.
    const lastAccountName = auth.user?.userName ?? '';
    await auth.logout();
    player.forgetLocalIdentity(lastAccountName);
    window.location.assign('/');
  }

  return { logout };
}
