import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { waitForMapReady } from './helpers';

/**
 * Issue #133: an admin picks a candidate seed, sees the map it produces
 * rendered by the real world-map renderer, and only then commits it.
 *
 * Like admin-activity.spec.ts, this runs against demo mode (`vite preview`
 * with no backend behind it — see playwright.config.ts), so the two admin
 * endpoints are mocked; the backend's own guard and cascade are covered by
 * AdminWorldEndpointsTests. What is genuinely exercised here is the part that
 * cannot be unit-tested: the preview response actually driving
 * `HexMapRenderer` in `world` mode, which never applies fog — the reason
 * "no fog" needed no new code at all.
 */

const ADMIN_USER = { id: 'admin-1', userName: 'e2e-admin', role: 'admin', status: 'active', displayName: 'E2E Admin' };

const WORLD = {
  id: 'world-1',
  name: 'Midgard',
  status: 'active',
  maxPlayers: 500,
  playerCount: 1,
  speedFactor: 1,
  startsAt: null,
  joinsClosed: false,
  endbossAt: null,
  endbossTriggeredAt: null,
  runState: 'running',
  runStateSince: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
};

/** Same shape as admin-activity.spec.ts's: seeds a refresh token, then answers the refresh/me calls. */
async function loginAsAdmin(page: Page) {
  await page.addInitScript(() => localStorage.setItem('bjarnoy.refreshToken', 'seed-refresh-admin'));
  await page.route('**/api/v1/auth/refresh', (route: Route) =>
    route.fulfill({ json: { accessToken: 'e2e-access-token', refreshToken: 'e2e-refresh-token', user: ADMIN_USER } }),
  );
  await page.route('**/api/v1/auth/me', (route: Route) => route.fulfill({ json: ADMIN_USER }));
}

/**
 * A small but real preview payload: two islands with a river, positioned where
 * seed 4242's terrain actually puts land, so the labels the renderer draws sit
 * over the generated islands rather than in open sea.
 */
const PREVIEW = {
  worldId: WORLD.id,
  seed: 4242,
  radius: 30,
  islandCount: 2,
  landTileCount: 96,
  islands: [
    {
      index: 0,
      name: 'Skarnsey',
      q: 0,
      r: 0,
      tileCount: 52,
      startPositions: [{ q: 0, r: 0 }],
      riverTiles: [{ q: 0, r: 0, shape: 'spring', inDirections: [], outDirection: 'E' }],
    },
    {
      index: 1,
      name: 'Vargholm',
      q: 9,
      r: -4,
      tileCount: 44,
      startPositions: [{ q: 9, r: -4 }],
      riverTiles: [],
    },
  ],
};

test.describe('admin world reseed', () => {
  test('previews a candidate seed on the world map, then commits it behind two confirmations', async ({ page }) => {
    await loginAsAdmin(page);
    await page.route('**/api/v1/admin/worlds', (route: Route) => route.fulfill({ json: [WORLD] }));

    let previewBody: unknown = null;
    await page.route('**/api/v1/admin/worlds/*/preview-seed', (route: Route) => {
      previewBody = route.request().postDataJSON();
      route.fulfill({ json: PREVIEW });
    });

    let reseedBody: unknown = null;
    await page.route('**/api/v1/admin/worlds/*/reseed', (route: Route) => {
      reseedBody = route.request().postDataJSON();
      route.fulfill({
        json: {
          world: { ...WORLD, playerCount: 0 },
          seed: PREVIEW.seed,
          islandCount: PREVIEW.islandCount,
          deletedSettlements: 1,
        },
      });
    });

    // Reached through the real admin UI, not a direct goto: the link from the
    // worlds list is the entry point the issue asks for.
    await page.goto('/admin/worlds');
    await page.getByRole('link', { name: 'Reseed map…' }).click();
    await page.waitForURL('**/admin/worlds/world-1/reseed');
    await expect(page.getByRole('heading', { name: /Reseed/ })).toBeVisible();

    // Nothing to commit before a map has been looked at.
    await expect(page.locator('#confirm-name')).toHaveCount(0);

    await page.locator('#seed').fill(String(PREVIEW.seed));
    await page.getByRole('button', { name: 'Preview seed' }).click();

    await expect(page.getByTestId('preview-summary')).toContainText('2 islands');
    expect(previewBody).toEqual({ seed: PREVIEW.seed });

    // The real renderer mounted and drew a frame — same signal every other
    // map-bearing spec waits on.
    await waitForMapReady(page);
    const canvas = page.locator('.map-panel canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    // Wrong name: still refused, however hard the button is clicked.
    const commit = page.getByRole('button', { name: 'Reseed world' });
    await page.locator('#confirm-name').fill('midgard');
    await expect(commit).toBeDisabled();

    await page.locator('#confirm-name').fill(WORLD.name);
    await expect(commit).toBeEnabled();

    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain(WORLD.name);
      void dialog.accept();
    });
    await commit.click();

    await expect(page.getByTestId('reseed-done')).toContainText('1 settlement(s) deleted');
    expect(reseedBody).toEqual({ confirmWorldName: WORLD.name, seed: PREVIEW.seed });
  });
});
