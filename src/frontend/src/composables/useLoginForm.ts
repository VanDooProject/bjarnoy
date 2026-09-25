// Shared submit logic behind LoginView.vue and ReturningLoginPanel.vue
// (player-logout-login-gate): both forms take a username/password, call
// auth.login, map a failed login to the same three error messages, and —
// once login succeeds — restore this account's realm in whatever world the
// browser is already pointed at before the caller navigates on. Pulled out
// so the panel doesn't duplicate LoginView's `onSubmit` (auth.login, 403/401
// handling) byte for byte; each caller still owns its own success
// navigation (LoginView's linked-world branch differs from the panel's).
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useWorldStore } from '../stores/world';
import { DEMO_MODE } from '../config';
import type { MessageSchema } from '../i18n/schema';

export function useLoginForm() {
  const auth = useAuthStore();
  const world = useWorldStore();
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

  const userName = ref('');
  const password = ref('');
  const submitting = ref(false);
  const error = ref<string | null>(null);

  // Attempts the login itself. Returns whether it succeeded; on failure,
  // `error` is set to the same copy LoginView always showed (403 → banned,
  // 401 → invalid credentials, anything else → generic) and nothing else
  // runs, so a caller can just `if (!(await login(...))) return;`.
  async function login(userNameValue: string, passwordValue: string): Promise<boolean> {
    if (submitting.value) return false;
    submitting.value = true;
    error.value = null;
    try {
      await auth.login(userNameValue, passwordValue);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        error.value = t('login.errors.banned');
      } else if (err instanceof ApiError && err.status === 401) {
        error.value = t('login.errors.invalidCredentials');
      } else {
        error.value = t('login.errors.generic');
      }
      return false;
    } finally {
      submitting.value = false;
    }
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
  async function restoreRealmIfAny(): Promise<void> {
    if (!DEMO_MODE && world.worldId) {
      await world.joinWorld(world.worldId);
    }
  }

  return { userName, password, submitting, error, login, restoreRealmIfAny };
}
