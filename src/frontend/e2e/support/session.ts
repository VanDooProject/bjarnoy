import type { Page } from '@playwright/test';
import { AdminAuthFixture } from '../pages/AdminAuthFixture';

/**
 * Logs the page in as an ordinary authenticated player, before the page's
 * first navigation — same pattern as `AdminAuthFixture.loginAsPlayer`
 * (issue #189's shared mocked-session helper, reused here rather than
 * duplicated): seeds a refresh token into localStorage and mocks
 * `/auth/refresh` + `/auth/me`, rather than driving `/register` through the
 * real form every time. Demo mode (what this whole harness runs against —
 * see playwright.config.ts) has no real `/auth/login` to hit anyway, so this
 * is also the *fastest* path to `auth.isAuthenticated === true` this suite
 * has, not just the most convenient.
 *
 * Added for the returning-player nav work: HudNav's "Leaderboards" link
 * requires `auth.isAuthenticated` (see useHudNavEntries.ts), so any spec that
 * clicks it needs a real authenticated session first. Must be
 * called before the page's first navigation — an `addInitScript` only takes
 * effect on a *subsequent* one — so call it before
 * `SettlementPage.found`/`WorldMapPage.open`, not after.
 */
export async function loginTestUser(page: Page, userName = 'e2e-player'): Promise<void> {
  await new AdminAuthFixture(page).loginAsPlayer(userName);
}
