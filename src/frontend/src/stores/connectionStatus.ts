import { defineStore } from 'pinia';

/**
 * Background polls that are currently failing, by poll key ('settlement',
 * 'trade', 'fogMask', ...). The polls themselves stay best-effort — a failed
 * tick just keeps the previous data — but without this a dead backend looked
 * exactly like a quiet one: a stale HUD and an unhandled rejection in the
 * console. ConnectionBanner reads it to tell the player something is wrong.
 */
export interface ConnectionIssue {
  error: unknown;
  /** ms epoch of the most recent failure. */
  at: number;
  /** Consecutive failures since the last success. */
  failures: number;
}

export const useConnectionStatusStore = defineStore('connectionStatus', {
  state: () => ({
    issues: {} as Record<string, ConnectionIssue>,
  }),
  getters: {
    /** The most recently failed poll, or null when everything is healthy. */
    latest(state): (ConnectionIssue & { key: string }) | null {
      let latest: (ConnectionIssue & { key: string }) | null = null;
      for (const [key, issue] of Object.entries(state.issues)) {
        if (!latest || issue.at >= latest.at) latest = { key, ...issue };
      }
      return latest;
    },
  },
  actions: {
    report(key: string, error: unknown) {
      this.issues[key] = { error, at: Date.now(), failures: (this.issues[key]?.failures ?? 0) + 1 };
    },
    clear(key: string) {
      delete this.issues[key];
    },
  },
});
