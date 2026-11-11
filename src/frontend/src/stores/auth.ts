import { defineStore } from 'pinia';
import { ApiError, authHooks } from '../api/client';
import type { AuthResponse, UserResponse } from '../api/types';
import { API_BASE_URL } from '../config';
import { setLocale } from '../i18n';
import { isSupportedLocale } from '../i18n/locale';
import { clearStoredRefreshToken, readStoredRefreshToken, storeRefreshToken } from '../lib/storedLogin';

// Auth endpoints are called directly with fetch, not through `api` in
// api/client.ts: that module's `request()` attaches the access token and
// retries once on 401 via this store's hooks, which login/register/refresh
// themselves must not do (a failed login is not an expired token).
// The timeout keeps a dead server from leaving "Logging in…" hanging forever.
const AUTH_TIMEOUT_MS = 30_000;
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const problem = await res.json().catch(() => undefined);
    throw new ApiError(res.status, problem);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function getMe(accessToken: string): Promise<UserResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const problem = await res.json().catch(() => undefined);
    throw new ApiError(res.status, problem);
  }
  return (await res.json()) as UserResponse;
}

// Module-level, not store state: it is a promise, not something to serialise or devtools-inspect.
let refreshInFlight: Promise<boolean> | null = null;

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as UserResponse | null,
    // In-memory only, unlike the refresh token below: it disappears on
    // reload rather than sitting in storage. The refresh token has to
    // survive a reload to avoid forcing a re-login every visit, so it lives
    // in localStorage — the same tradeoff `stores/player.ts` already makes
    // for the local player id, and the same XSS caveat applies here too.
    accessToken: null as string | null,
    // Has `ensureInitialized` run yet? Lets the router guard await a single
    // startup attempt to restore a session, instead of every navigation
    // re-triggering it.
    initialized: false,
    // Set when any API call comes back 403 { error: "user_locked" } — see
    // `AccountRestrictedBanner.vue`, which reads this to show its banner.
    accountLocked: false,
  }),
  getters: {
    isAuthenticated: (state) => state.user !== null,
    isAdmin: (state) => state.user?.role === 'admin',
    isPremium: (state) => state.user?.isPremium ?? false,
  },
  actions: {
    applyAuthResponse(response: AuthResponse) {
      this.user = response.user;
      this.accessToken = response.accessToken;
      storeRefreshToken(response.refreshToken);
      this.applyUserLocale(response.user);
    },
    // The account's saved locale (if any) wins over whatever was already
    // detected/stored on this device — see detectInitialLocale's precedence
    // in i18n/locale.ts, which this keeps in sync with after the fact for
    // the login/register/refresh/me responses that arrive after boot.
    applyUserLocale(user: UserResponse) {
      if (isSupportedLocale(user.preferredLocale)) {
        setLocale(user.preferredLocale);
      }
    },
    clearSession() {
      this.user = null;
      this.accessToken = null;
      clearStoredRefreshToken();
    },
    async register(userName: string, password: string, existingOwnerId?: string | null) {
      const response = await post<AuthResponse>('/auth/register', { userName, password, existingOwnerId });
      this.applyAuthResponse(response);
    },
    async login(userName: string, password: string) {
      const response = await post<AuthResponse>('/auth/login', { userName, password });
      this.applyAuthResponse(response);
    },
    /**
     * Revokes the session server-side and forgets the stored refresh token,
     * but keeps the in-memory user and access token: for a caller that
     * replaces the whole page next (`useLogout`'s full load). Until that load
     * lands, the page's polls still read the player's realm, and a claimed
     * realm only answers to this JWT — dropping it first turns each of them
     * into a 403. The access token itself goes with the page.
     */
    async revokeSession() {
      const refreshToken = readStoredRefreshToken();
      clearStoredRefreshToken();
      if (refreshToken) {
        // Best-effort: the stored session is gone client-side either way.
        await post('/auth/logout', { refreshToken }).catch(() => {});
      }
    },
    /** Logs out and stays on the page (an in-app navigation follows). */
    async logout() {
      await this.revokeSession();
      this.clearSession();
      this.accountLocked = false;
    },
    /**
     * Trades the stored refresh token for a fresh access token (and a new,
     * rotated refresh token). Used both at startup (`ensureInitialized`) and
     * by the API client's one-shot retry-after-401 (see `authHooks` below).
     *
     * Single-flight: the server revokes a refresh token the moment it is used,
     * so concurrent callers (every parallel request that hits the expired
     * access token) must share one `/auth/refresh` call. A second call with the
     * same token would be rejected and — worse — wipe the session the first one
     * just restored.
     *
     * Only a server verdict that the token is no good (401/403) ends the
     * session. A network error or 5xx leaves the stored token alone so the next
     * call can retry it. A rejection while another tab has meanwhile replaced
     * the stored token is retried once with that token (the single-flight
     * promise is per tab; the token in localStorage is shared across tabs).
     */
    tryRefresh(): Promise<boolean> {
      if (!refreshInFlight) {
        refreshInFlight = this.performRefresh().finally(() => {
          refreshInFlight = null;
        });
      }
      return refreshInFlight;
    },
    async performRefresh(): Promise<boolean> {
      let refreshToken = readStoredRefreshToken();
      if (!refreshToken) return false;

      // At most one retry: see the comment on `tryRefresh` for why.
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await post<AuthResponse>('/auth/refresh', { refreshToken });
          this.applyAuthResponse(response);
          return true;
        } catch (err) {
          if (!(err instanceof ApiError) || (err.status !== 401 && err.status !== 403)) return false;

          // Another tab shares this localStorage token. If it rotated the token
          // while our call was in flight, ours was rejected only because it was
          // already spent — the stored one is the live one, so try that
          // instead of ending a session that is still good.
          const stored = readStoredRefreshToken();
          if (attempt === 0 && stored && stored !== refreshToken) {
            refreshToken = stored;
            continue;
          }
          this.clearSession();
          return false;
        }
      }
    },
    async fetchMe() {
      if (!this.accessToken) return;
      try {
        this.user = await getMe(this.accessToken);
        this.applyUserLocale(this.user);
      } catch {
        this.clearSession();
      }
    },
    /**
     * Runs once, awaited by the router guard before its first navigation
     * resolves — so a page reload restores a logged-in user from the stored
     * refresh token instead of bouncing them to /login.
     */
    async ensureInitialized() {
      if (this.initialized) return;
      this.initialized = true;
      if (await this.tryRefresh()) {
        await this.fetchMe();
      }
    },
  },
});

// Wired once, at module load: see the comment on `authHooks` in
// api/client.ts for why this is a hook object rather than a direct import.
authHooks.getAccessToken = () => useAuthStore().accessToken;
authHooks.refreshAccessToken = () => useAuthStore().tryRefresh();
authHooks.onAccountLocked = () => {
  useAuthStore().accountLocked = true;
};
