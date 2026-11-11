// State of one login attempt, from the credentials POST through the realm
// restore that follows it. It lives in a store (not in the form component)
// because the landing gate panel unmounts the moment `auth.isAuthenticated`
// flips, while the restore is still running: the progress and any restore
// error have to survive that, and a second submit must stay blocked until the
// whole flow is done. LoginView.vue and ReturningLoginPanel.vue both drive it
// through useLoginForm.
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { ApiError } from '../api/client';
import { useAuthStore } from './auth';
import { i18n } from '../i18n';

export type LoginPhase = 'idle' | 'auth' | 'restore';

// After this long in one phase the UI says the server is slow.
export const LOGIN_SLOW_MS = 3000;

export interface LoginSteps {
  /** Runs after a successful login (restores the account's realm). */
  restore: () => Promise<void>;
  /** Runs once the restore worked (navigation); the flow is busy until it finished. */
  done: () => Promise<void>;
}

export const useLoginFlowStore = defineStore('loginFlow', () => {
  const auth = useAuthStore();
  const t = (key: string) => i18n.global.t(key);

  const phase = ref<LoginPhase>('idle');
  const slow = ref(false);
  const error = ref<string | null>(null);
  const credentialsRejected = ref(false);
  const restoreError = shallowRef<unknown>(null);
  const noRealmWorldName = ref<string | null>(null);
  const accountName = ref<string | null>(null);

  // Not state: a pending timer and the callbacks `retryRestore` re-runs.
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  let steps: LoginSteps | null = null;

  function clearSlowTimer() {
    if (slowTimer !== undefined) {
      clearTimeout(slowTimer);
      slowTimer = undefined;
    }
  }

  function setPhase(next: LoginPhase) {
    clearSlowTimer();
    slow.value = false;
    phase.value = next;
    if (next !== 'idle') {
      slowTimer = setTimeout(() => {
        slow.value = true;
      }, LOGIN_SLOW_MS);
    }
  }

  function messageFor(err: unknown): string {
    if (err instanceof ApiError && err.status === 403) return t('login.errors.banned');
    if (err instanceof ApiError && err.status === 401) return t('login.errors.invalidCredentials');
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return t('login.errors.timeout');
    }
    if (err instanceof TypeError) return t('login.errors.network');
    return t('login.errors.generic');
  }

  async function runRestore() {
    if (!steps) return;
    restoreError.value = null;
    try {
      await steps.restore();
      await steps.done();
    } catch (err) {
      console.error('login restore failed', err);
      restoreError.value = err;
      return;
    }
    steps = null;
    setPhase('idle');
  }

  async function submit(userName: string, password: string, next: LoginSteps): Promise<void> {
    if (phase.value !== 'idle') return;
    error.value = null;
    credentialsRejected.value = false;
    restoreError.value = null;
    noRealmWorldName.value = null;
    accountName.value = userName;
    setPhase('auth');
    try {
      await auth.login(userName, password);
    } catch (err) {
      error.value = messageFor(err);
      credentialsRejected.value = err instanceof ApiError && err.status === 401;
      setPhase('idle');
      return;
    }
    steps = next;
    setPhase('restore');
    await runRestore();
  }

  // Re-runs the realm restore only: the login itself already succeeded.
  async function retryRestore(): Promise<void> {
    if (phase.value !== 'restore' || restoreError.value === null) return;
    await runRestore();
  }

  function clearError() {
    error.value = null;
    credentialsRejected.value = false;
  }

  function reset() {
    clearSlowTimer();
    steps = null;
    phase.value = 'idle';
    slow.value = false;
    error.value = null;
    credentialsRejected.value = false;
    restoreError.value = null;
    noRealmWorldName.value = null;
    accountName.value = null;
  }

  return {
    phase,
    slow,
    error,
    credentialsRejected,
    restoreError,
    noRealmWorldName,
    accountName,
    submit,
    retryRestore,
    clearError,
    reset,
  };
});
