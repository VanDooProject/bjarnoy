import { defineStore } from 'pinia';
import { ApiError, authHooks } from '../api/client';
import type { AuthResponse, UserResponse } from '../api/types';
import { API_BASE_URL } from '../config';

const REFRESH_TOKEN_KEY = 'bjarnoy.refreshToken';

function storedRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

// Auth endpoints are called directly with fetch, not through `api` in
// api/client.ts: that module's `request()` attaches the access token and
// retries once on 401 via this store's hooks, which login/register/refresh
// themselves must not do (a failed login is not an expired token).
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  },
  actions: {
    applyAuthResponse(response: AuthResponse) {
      this.user = response.user;
      this.accessToken = response.accessToken;
      localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    },
    clearSession() {
      this.user = null;
      this.accessToken = null;
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    },
    async register(userName: string, password: string, legacyPlayerId?: string | null) {
      const response = await post<AuthResponse>('/auth/register', { userName, password, legacyPlayerId });
      this.applyAuthResponse(response);
    },
    async login(userName: string, password: string) {
      const response = await post<AuthResponse>('/auth/login', { userName, password });
      this.applyAuthResponse(response);
    },
    async logout() {
      const refreshToken = storedRefreshToken();
      this.clearSession();
      this.accountLocked = false;
      if (refreshToken) {
        // Best-effort: the session is already cleared client-side either way.
        await post('/auth/logout', { refreshToken }).catch(() => {});
      }
    },
    /**
     * Trades the stored refresh token for a fresh access token (and a new,
     * rotated refresh token). Used both at startup (`ensureInitialized`) and
     * by the API client's one-shot retry-after-401 (see `authHooks` below).
     */
    async tryRefresh(): Promise<boolean> {
      const refreshToken = storedRefreshToken();
      if (!refreshToken) return false;

      try {
        const response = await post<AuthResponse>('/auth/refresh', { refreshToken });
        this.applyAuthResponse(response);
        return true;
      } catch {
        this.clearSession();
        return false;
      }
    },
    async fetchMe() {
      if (!this.accessToken) return;
      try {
        this.user = await getMe(this.accessToken);
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
