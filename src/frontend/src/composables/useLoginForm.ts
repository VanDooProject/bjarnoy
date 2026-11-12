// Shared form state behind LoginView.vue and ReturningLoginPanel.vue: the
// username/password refs plus a thin delegation to the login flow store
// (stores/loginFlow.ts), which owns the whole attempt (login, error mapping,
// busy phases, slow hint). Each caller still owns its own restore and
// navigation (LoginView's linked-world branch differs from the panel's).
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useLoginFlowStore, type LoginSteps } from '../stores/loginFlow';
import { useWorldStore } from '../stores/world';
import { DEMO_MODE } from '../config';

export function useLoginForm() {
  const world = useWorldStore();
  const flow = useLoginFlowStore();
  const { phase, slow, error, credentialsRejected } = storeToRefs(flow);

  const userName = ref('');
  const password = ref('');

  function submit(steps: LoginSteps): Promise<void> {
    return flow.submit(userName.value, password.value, steps);
  }

  // Restore realm after login (player-logout-login-gate): a plain login (no
  // linked world — see LoginView's own `linkedWorldId` branch, which calls
  // `world.joinWorld` directly with a *different* world id than whatever is
  // already loaded) still needs the account's existing realm in the
  // currently-loaded world restored before landing back in the game,
  // otherwise the router guard sees an unfounded player and leaves them on
  // the founding flow even though they own a settlement there already.
  // Demo mode has no backend realm to restore — `world.joinWorld` itself is
  // a no-op there, but skip the call entirely rather than relying on that.
  // Returns whether a restore actually ran.
  async function restoreRealmIfAny(): Promise<boolean> {
    if (!DEMO_MODE && world.worldId) {
      await world.joinWorld(world.worldId);
      return true;
    }
    return false;
  }

  return { userName, password, phase, slow, error, credentialsRejected, submit, restoreRealmIfAny };
}
