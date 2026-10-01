import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { HEAVY_MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';
import { waitForMapReady } from './helpers';

/**
 * The full onboarding happy path, driven through the real UI end to end:
 * landfall -> the two guided ring-menu builds -> completion hand-off ->
 * the "Name your jarl" nudge -> a real register form -> back in the game
 * authenticated -> log out via the account menu -> the returning-login
 * gate -> log back in.
 *
 * Every existing landing/register spec places the guided buildings straight
 * into the model (`__demoWorld`) or drives the API directly. This is the
 * one spec that clicks the ring menu for both guided buildings and fills
 * the real register/login forms. Each path is one long test rather than
 * split up; the paths share the founding + two-building setup through
 * `foundAndFinishGuidedBuilds` below and diverge at the "Name your jarl"
 * nudge (register straight away vs. "Later" and register from the HUD
 * trigger).
 *
 * Demo mode (this whole harness — see playwright.config.ts) has no backend:
 * `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me` and
 * `/auth/refresh` are all mocked with `page.route`, the same way
 * register.spec.ts and AdminAuthFixture do.
 *
 * docs/ci/e2e-sharding.md: a new heavy single-test file. Real CI durations
 * aren't in hand to bin-pack it properly (the doc's own instructions), so
 * it's tagged into `@g2` — already the suite's largest group by test count,
 * so one more heavy test changes its total the least relative to the other
 * groups, and it isn't sequentially next to another tight-margin test
 * there. Re-balance with real numbers per that doc once this has run in CI.
 */
/**
 * Shared setup for every happy path in this file: mocks the auth endpoints
 * (demo mode has no backend), makes landfall, places both guided buildings
 * through the real ring menu and continues into /settlement — leaving the
 * "Name your jarl" nudge on screen, which is where the paths diverge.
 */
async function foundAndFinishGuidedBuilds(page: Page) {
  const username = `e2ejarl${Date.now()}`;
  const password = 'correct horse battery staple';
  const registeredUser = { id: 'u-happy-path', userName: username, role: 'player', status: 'active', displayName: null };

  let registerRequestBody: { userName: string; password: string; existingOwnerId: string | null } | undefined;
  await page.route('**/api/v1/auth/register', (route: Route) => {
    registerRequestBody = route.request().postDataJSON();
    return route.fulfill({
      json: { accessToken: 'e2e-register-access-token', refreshToken: 'e2e-register-refresh-token', user: registeredUser },
    });
  });
  await page.route('**/api/v1/auth/login', (route: Route) =>
    route.fulfill({
      json: { accessToken: 'e2e-relogin-access-token', refreshToken: 'e2e-relogin-refresh-token', user: registeredUser },
    }),
  );
  await page.route('**/api/v1/auth/logout', (route: Route) => route.fulfill({ status: 204 }));
  await page.route('**/api/v1/auth/me', (route: Route) => route.fulfill({ json: registeredUser }));
  await page.route('**/api/v1/auth/refresh', (route: Route) =>
    route.fulfill({
      json: { accessToken: 'e2e-access-token', refreshToken: 'e2e-refresh-token', user: registeredUser },
    }),
  );

  // --- Landfall -----------------------------------------------------------
  const settlement = await SettlementPage.openLanding(page);
  const playerIdAtRegistration = await page.evaluate(() => localStorage.getItem('bjarnoy.playerId'));

  await settlement.claimLandfall();
  await expect(settlement.banner).toBeVisible();
  await expect(settlement.banner).toContainText('Landfall made.');

  // --- Guided build 1: Reindeer Herder on a grass hex, via the real ring menu -------
  const grassHex = await settlement.findHex({ terrain: 'grass' });
  await settlement.clickHex(grassHex);
  const farm = settlement.ring.action('Reindeer Herder');
  await expect(farm).toBeVisible();
  await expect(farm).toBeEnabled();
  const buildingsBeforeFarm = await settlement.countBuildings();
  await farm.click();
  await expect.poll(() => settlement.countBuildings(), { timeout: 5_000 }).toBeGreaterThan(buildingsBeforeFarm);

  // --- Guided build 2: Lumberjack on a forest hex, via the ring menu -----
  // LandingView.vue's GUIDED_BUILD_TERRAIN maps Lumberjack -> forest, the
  // same way Reindeer Herder requires grass — only the tile-matching action is
  // enabled (see landing.spec.ts's ring-gating test for that regression
  // coverage). This spec just needs a forest hex to actually place it on.
  const forestHex = await settlement.findHex({ terrain: 'forest' });
  await settlement.clickHex(forestHex);
  const lumberjack = settlement.ring.action('Lumberjack');
  await expect(lumberjack).toBeVisible();
  await expect(lumberjack).toBeEnabled();
  const buildingsBeforeLumberjack = await settlement.countBuildings();
  await lumberjack.click();
  await expect
    .poll(() => settlement.countBuildings(), { timeout: 5_000 })
    .toBeGreaterThan(buildingsBeforeLumberjack);

  // --- Completion hand-off -------------------------------------------------
  await expect(settlement.banner).toBeVisible();
  await expect(settlement.banner).toContainText('All three placed.');
  await settlement.continueButton.click();
  await page.waitForURL('**/settlement');
  await waitForMapReady(page);

  return { settlement, username, password, getRegisterRequestBody: () => registerRequestBody, playerIdAtRegistration };
}

/**
 * The happy paths run at one desktop size and two phone sizes. On a phone
 * the in-game HUD collapses into a pull-down drawer (TopBar.vue /
 * MobileHudDrawer.vue): the nudge, the "Name your jarl" entry and the
 * account menu all move in there, so `accountHud` below hides that one
 * difference and everything else is the same click path.
 *
 * Tags: the desktop run stays in `@g2` next to the rest of the heavy
 * desktop specs; the phone runs go to `@g1`, the group with the most
 * headroom (docs/ci/e2e-sharding.md). Phone frames are also far cheaper to
 * render on CI's GPU-less runner (fewer pixels), so they add less time than
 * the desktop run.
 */
interface ScreenSize {
  name: string;
  viewport: { width: number; height: number };
  phone: boolean;
  tag: string;
}

const SCREEN_SIZES: ScreenSize[] = [
  { name: 'desktop 1280x800', viewport: { width: 1280, height: 800 }, phone: false, tag: '@g2' },
  { name: 'medium phone 390x844', viewport: { width: 390, height: 844 }, phone: true, tag: '@g1' },
  { name: 'small phone 320x568', viewport: { width: 320, height: 568 }, phone: true, tag: '@g1' },
];

/** The account/registration entry points, wherever this screen size puts them. */
function accountHud(page: Page, phone: boolean) {
  const grip = page.locator('.hud-grip');
  const scope = phone ? page.locator('.hud-drawer') : page;
  async function reveal() {
    if (phone && (await grip.getAttribute('aria-expanded')) !== 'true') await grip.click();
  }
  return {
    /** Opens the phone drawer if it isn't already; a no-op on desktop. */
    reveal,
    nudge: scope.getByTestId('profile-nudge'),
    async expectLoggedIn() {
      if (phone) {
        await reveal();
        await expect(page.getByTestId('drawer-account-logout')).toBeVisible();
      } else {
        await expect(page.getByTestId('account-menu-trigger')).toBeVisible();
      }
    },
    async logout() {
      if (phone) {
        await reveal();
        await page.getByTestId('drawer-account-logout').click();
      } else {
        await page.getByTestId('account-menu-trigger').click();
        await page.getByTestId('account-menu-logout').click();
      }
    },
  };
}

for (const size of SCREEN_SIZES) {
  test.describe(size.name, () => {
    test.use(size.phone ? { viewport: size.viewport, hasTouch: true, isMobile: true } : { viewport: size.viewport });

    test(
      `the full onboarding happy path: landfall, guided ring builds, register, and a logout/login round trip (${size.name})`,
      { tag: size.tag },
      async ({ page }) => {
        test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);

        const { settlement, username, password, getRegisterRequestBody, playerIdAtRegistration } =
          await foundAndFinishGuidedBuilds(page);

        // --- Profile nudge -> real /register form --------------------------------
        const hud = accountHud(page, size.phone);
        await hud.reveal();
        await expect(hud.nudge).toBeVisible();
        await hud.nudge.getByTestId('profile-nudge-cta').click();
        await expect(page).toHaveURL(/\/register$/);

        await page.getByLabel('Username').fill(username);
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page.getByLabel('Confirm password').fill(password);
        await page.getByRole('button', { name: 'Create account' }).click();

        // RegisterView's own redirect defaults to '/' when nothing set a
        // `?redirect=` query — ProfileNudge's "Name your jarl" navigates to
        // /register with no query at all, so registration itself pushes '/'.
        // But router/index.ts's own guard immediately bounces a `to.name ===
        // 'landing'` navigation to `{ name: 'settlement' }` once
        // `player.hasFoundedSettlement && player.onboardingComplete` — both true
        // here — so the browser actually lands on /settlement, not bare '/'.
        // Verified by running this spec for real: an earlier version of this
        // test asserted '/' here from reading RegisterView.vue alone and failed
        // against the router guard's own redirect.
        await expect(page).toHaveURL(/\/settlement$/);
        expect(getRegisterRequestBody()).toEqual({ userName: username, password, existingOwnerId: playerIdAtRegistration });
        await expect
          .poll(() => page.evaluate(() => localStorage.getItem('bjarnoy.refreshToken')))
          .toBe('e2e-register-refresh-token');

        // Authenticated and still in-game: HudNav (not the pre-founding header)
        // is mounted because player.hasFoundedSettlement is true, so its
        // account menu is up (the avatar on desktop, the drawer's account
        // section on a phone).
        await hud.expectLoggedIn();

        // --- Log out via the account menu ----------------------------------------
        await hud.logout();

        // useLogout ends in a full page reload to '/' (window.location.assign),
        // not an in-app navigation — wait on what the reloaded page shows
        // rather than a URL change (the path doesn't change).
        await expect(settlement.returningLoginPanel).toBeVisible();
        await expect(page).toHaveURL('/');

        // The founding hero and the guided-onboarding UI must not reappear
        // underneath the gate — a visitor who just logged out of a real account
        // must not be nudged toward starting a throwaway new realm on top of it.
        await expect(page.getByRole('heading', { name: /put your longhouse somewhere/i })).toHaveCount(0);
        await expect(settlement.guidancePointer).toHaveCount(0);
        await expect(settlement.checklist).toHaveCount(0);

        // localStorage: every key tying this browser to the account that just
        // logged out is gone, and a brand new local identity has taken its
        // place (stores/player.ts's forgetLocalIdentity + the next boot's
        // stablePlayerId()).
        const playerIdAfterLogout = await page.evaluate(() => localStorage.getItem('bjarnoy.playerId'));
        expect(playerIdAfterLogout).not.toBeNull();
        expect(playerIdAfterLogout).not.toBe(playerIdAtRegistration);
        // Demo mode never writes `bjarnoy.settlementId` in the first place
        // (stores/player.ts: `persistedSettlementId` is always `null` there —
        // WorldModel is pure in-memory, nothing to restore across a reload), so
        // this is really asserting `forgetLocalIdentity`'s `removeItem` left no
        // stale value behind rather than proving something was cleared.
        await expect
          .poll(() => page.evaluate(() => localStorage.getItem('bjarnoy.settlementId')))
          .toBeNull();
        await expect
          .poll(() => page.evaluate(() => localStorage.getItem('bjarnoy.lastAccount')))
          .toBe(username);
        await expect
          .poll(() => page.evaluate(() => localStorage.getItem('bjarnoy.refreshToken')))
          .toBeNull();

        // --- Log back in via the returning-login gate ----------------------------
        await settlement.submitReturningLogin(password);
        await expect(settlement.returningLoginPanel).toHaveCount(0);

        // Login itself succeeded — a fresh refresh token is stored and the gate
        // is gone.
        await expect
          .poll(() => page.evaluate(() => localStorage.getItem('bjarnoy.refreshToken')))
          .toBe('e2e-relogin-refresh-token');

        // Demo mode has no backend to restore a realm from (WorldModel is pure
        // in-memory — see stores/player.ts's own remarks on why
        // `persistedSettlementId` is always null in demo mode), so
        // `player.hasFoundedSettlement` stays false even though the login
        // itself succeeded: this browser's local identity was dropped at
        // logout and demo mode has nothing server-side to hand it back. That
        // means the founding hero for a *fresh* realm reappears, and — since
        // LandingView only mounts HudNav (and its account-menu avatar) once
        // `player.hasFoundedSettlement` is true — the pre-founding header with
        // ReturningPlayerMenu's own trigger is what's actually on screen next,
        // not an account menu. The one thing this spec can't prove is "the same
        // realm comes back after logging back in" — that needs a real backend,
        // which is exactly what
        // Bjarnoy.AppHost.Tests/OnboardingHappyPathTests.cs (the companion
        // real-backend test for this same flow) asserts instead.
        await expect(page.getByRole('heading', { name: /put your longhouse somewhere/i })).toBeVisible();
        await expect(page.getByTestId('returning-player-trigger')).toBeVisible();
        await expect(settlement.accountMenuTrigger).toHaveCount(0);
      },
    );

  /**
   * The same onboarding, but the player answers the "Name your jarl" nudge
   * with "Later". The HUD must then still lead with "Name your jarl" (not
   * "I already have a realm" — the realm is the one on screen, the jarl is
   * what's missing): on desktop the top-right trigger and the first row of
   * its panel, on a phone the drawer's account section. Either way it must
   * reach a real registration and land back in the game authenticated.
   */
  test(
    `onboarding happy path via "Later": the HUD still offers "Name your jarl" and registers (${size.name})`,
    { tag: size.tag },
    async ({ page }) => {
      test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);

      const { username, password, getRegisterRequestBody, playerIdAtRegistration } =
        await foundAndFinishGuidedBuilds(page);

      // --- "Later" on the nudge ---------------------------------------------
      const hud = accountHud(page, size.phone);
      await hud.reveal();
      await expect(hud.nudge).toBeVisible();
      await hud.nudge.getByTestId('profile-nudge-later').click();
      await expect(hud.nudge).toHaveCount(0);

      // --- "Name your jarl" leads, "Log in" follows -------------------------
      if (size.phone) {
        // The in-game phone bar has no room for the trigger; its entries
        // live in the drawer's account section instead (MobileHudDrawer.vue).
        const entries = page.locator('.hud-drawer .drawer-account button');
        await expect(entries.nth(0)).toHaveAttribute('data-testid', 'drawer-account-name-jarl');
        await expect(entries.nth(1)).toHaveAttribute('data-testid', 'drawer-account-login');
        await entries.nth(0).click();
      } else {
        const trigger = page.getByTestId('returning-player-trigger');
        await expect(trigger).toContainText('Name your jarl');
        await expect(trigger).toContainText('or I already have a realm');

        await trigger.click();
        const menu = page.getByTestId('returning-player-menu');
        await expect(menu).toBeVisible();
        const rows = menu.getByRole('menuitem');
        await expect(rows.nth(0)).toHaveAttribute('data-testid', 'returning-player-name-jarl');
        await expect(rows.nth(1)).toHaveAttribute('data-testid', 'returning-player-login');
        await rows.nth(0).click();
      }
      await expect(page).toHaveURL(/\/register$/);

      // --- Real register form -> back in the game, authenticated ------------
      await page.getByLabel('Username').fill(username);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Confirm password').fill(password);
      await page.getByRole('button', { name: 'Create account' }).click();

      await expect(page).toHaveURL(/\/settlement$/);
      expect(getRegisterRequestBody()).toEqual({ userName: username, password, existingOwnerId: playerIdAtRegistration });
      await hud.expectLoggedIn();
      await expect(page.getByTestId('returning-player-trigger')).toHaveCount(0);
    },
  );
  });
}
