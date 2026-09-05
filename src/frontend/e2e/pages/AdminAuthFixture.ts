import type { Page, Route } from '@playwright/test';

/**
 * The one place a spec gets an authenticated session (issue #189).
 *
 * Demo mode (`vite preview` with no backend behind it — see
 * playwright.config.ts) has no `/auth/login` to drive, so every spec that
 * needs a logged-in user seeds a refresh token and answers the two calls
 * `authStore.ensureInitialized()` makes: `tryRefresh()` (awaited by the
 * router guard on every navigation) and the `fetchMe()` that follows it —
 * `fetchMe()` calls `clearSession()` on ANY failure, silently undoing the
 * refresh if it isn't mocked too.
 *
 * That block used to be copy-pasted verbatim across five admin specs plus a
 * player-role variant in leaderboard.spec.ts. It lives here now; the
 * `adminAuth` fixture in `fixtures.ts` hands one to any spec that asks for
 * it.
 */

/** The session `authStore.isAdmin` accepts, and the `/admin` route's `requiresAdmin` guard lets through. */
export const ADMIN_USER = {
  id: 'admin-1',
  userName: 'e2e-admin',
  role: 'admin',
  status: 'active',
  displayName: 'E2E Admin',
};

export interface SessionUser {
  id: string;
  userName: string;
  role: string;
  status: string;
  displayName: string | null;
}

export class AdminAuthFixture {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Logs in as `ADMIN_USER` — what the five `/admin/*` specs need. */
  login(): Promise<void> {
    return this.loginAs(ADMIN_USER, 'seed-refresh-admin');
  }

  /** Logs in as an ordinary player, by user name (leaderboard.spec.ts's own case). */
  loginAsPlayer(userName: string): Promise<void> {
    return this.loginAs(
      { id: 'user-1', userName, role: 'player', status: 'active', displayName: userName },
      `seed-refresh-${userName}`,
    );
  }

  /**
   * Seeds `refreshToken` into localStorage before the app boots, then
   * answers `/auth/refresh` and `/auth/me` with `user` for the rest of the
   * session. Routes registered up front apply to every later navigation.
   */
  async loginAs(user: SessionUser, refreshToken: string): Promise<void> {
    await this.page.addInitScript(
      (token) => localStorage.setItem('bjarnoy.refreshToken', token),
      refreshToken,
    );
    await this.page.route('**/api/v1/auth/refresh', (route: Route) =>
      route.fulfill({ json: { accessToken: 'e2e-access-token', refreshToken: 'e2e-refresh-token', user } }),
    );
    await this.page.route('**/api/v1/auth/me', (route: Route) => route.fulfill({ json: user }));
  }
}
