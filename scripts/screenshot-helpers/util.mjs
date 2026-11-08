// Shared helpers for screenshot scripts that mutate WorldModel or
// HexMapRenderer's fogDebugFlags directly (via the demo-mode window hooks
// in src/frontend/src/main.ts) and then need the change to actually render.
//
// HexMapRenderer only rebuilds its terrain/fog/border layers when
// cameraMovedEnough() sees a real camera displacement past its own
// threshold (TILE_W * 0.4, see HexMapRenderer.ts's scheduleCull) — nothing
// else triggers it. A screenshot script that mutates state off-screen (e.g.
// `window.__demoWorld().model.placeBuilding(...)`) and then "nudges" the
// camera by a few pixels to force a redraw can silently do nothing at all:
// an early version of these scripts used a ~4px round-trip drag that never
// crossed the threshold in either direction, so the resulting screenshots
// looked identical to the unmutated state while still reporting success.
// forceRebuild() does a real, large enough drag (150px out, then back) so
// both legs are guaranteed past the threshold regardless of zoom level.
export async function forceRebuild(page, { x = 720, y = 450 } = {}) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y + 150, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

// Loads `url`, passes the landing intro and waits for the map to be ready to
// screenshot. A fresh visitor lands on the intro page (LandingPage.vue), which
// covers the map until they press "Go to the map": while the atlases still
// load that arms the button and the intro opens by itself once they are in
// (same path as e2e/onboarding-happy-path.spec.ts). Press it exactly once - a
// second press while armed disarms it again. `onIntro(page)` runs while the
// intro is showing, for a screenshot of it.
//
// Then the same signal e2e/helpers.ts's waitForMapReady uses
// (`data-map-ready`, then the loading overlay gone). Not
// `waitUntil: 'networkidle'`: once the map's own art is in, the app keeps
// warming the rest of the atlas in the background (atlas.ts's
// startBackgroundAtlasLoad), so the network can stay busy for a long while
// after the page is ready. Dev-server first loads are slow, hence the
// generous timeout.
export async function gotoMapReady(page, url, { timeout = 120_000, onIntro } = {}) {
  await page.goto(url);
  const toMap = page.getByRole('button', { name: /Go to the map/ });
  await toMap.waitFor({ timeout });
  if (onIntro) await onIntro(page);
  await toMap.click();
  await page.getByTestId('landing-page').waitFor({ state: 'detached', timeout });
  await page.locator('.map-container[data-map-ready]').first().waitFor({ timeout });
  await page.locator('[data-testid="map-status-overlay"]').waitFor({ state: 'detached', timeout });
}

// A logged-in player session for scripts that need one (demo mode is
// anonymous otherwise, and some HUD entries only show when logged in). Same session the e2e suite fakes
// (e2e/pages/AdminAuthFixture.ts, `loginAsPlayer`): a seeded refresh token
// plus `/auth/refresh` and `/auth/me` answered with a player. Call it before
// the page's first navigation - the init script only applies to later ones.
export async function loginDemoPlayer(page, userName = 'screenshot-player') {
  const user = { id: 'user-1', userName, role: 'player', status: 'active', displayName: userName };
  await page.addInitScript((token) => localStorage.setItem('bjarnoy.refreshToken', token), `seed-refresh-${userName}`);
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({ json: { accessToken: 'screenshot-access-token', refreshToken: 'screenshot-refresh-token', user } }),
  );
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: user }));
}
