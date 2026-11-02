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

// HudNav's "World map" button only renders for an authenticated player
// (HudNav.vue: `auth.isAuthenticated && player.hasFoundedSettlement`), and
// demo mode is anonymous, so a script that clicks it without this times out
// waiting for a button that never appears. Same session the e2e suite fakes
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
