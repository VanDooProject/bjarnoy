import { onBeforeUnmount, onMounted } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

/** How often a focused, visible, authenticated tab pings the heartbeat endpoint. */
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Closes a gap the primary activity signals (the request-tracking endpoint
 * filter, and the JWT-refresh hook) can't: a logged-in user who has the tab
 * open and focused but isn't triggering any API call. While the tab is
 * visible and the user is authenticated, this pings
 * `POST /api/v1/activity/heartbeat` on a ~5 minute cadence.
 *
 * The interval itself is paused (not just skipped) while the tab is hidden,
 * so a backgrounded tab does nothing at all rather than quietly polling. On
 * regaining visibility, it fires immediately if the last heartbeat is
 * already overdue (more than one interval old) — covering a tab that was
 * hidden for hours — otherwise it just resumes the normal cadence, so a
 * quick tab-switch doesn't trigger an extra call.
 *
 * Optional and best-effort: a failed heartbeat call is swallowed, same as
 * `AuthStore.logout`'s best-effort call — missing one ping is not worth
 * surfacing to the user, since the other two tracking signals still cover
 * most activity.
 */
export function useActivityHeartbeat() {
  const authStore = useAuthStore();

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastHeartbeatAtMs = 0;

  function sendHeartbeat() {
    lastHeartbeatAtMs = Date.now();
    api.heartbeat().catch(() => {});
  }

  function tick() {
    if (document.visibilityState === 'visible' && authStore.isAuthenticated) {
      sendHeartbeat();
    }
  }

  function startInterval() {
    if (intervalId !== null) return;
    intervalId = setInterval(tick, HEARTBEAT_INTERVAL_MS);
  }

  function stopInterval() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      stopInterval();
      return;
    }

    const overdue = Date.now() - lastHeartbeatAtMs > HEARTBEAT_INTERVAL_MS;
    if (authStore.isAuthenticated && overdue) {
      sendHeartbeat();
    }
    startInterval();
  }

  onMounted(() => {
    // Seeds the "overdue" clock at mount time rather than leaving it at 0,
    // so a visibility change shortly after mount isn't always treated as
    // overdue (there is no real prior heartbeat to be overdue relative to).
    lastHeartbeatAtMs = Date.now();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (document.visibilityState === 'visible') {
      startInterval();
    }
  });

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    stopInterval();
  });
}
