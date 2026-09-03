import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Issue #98: admin-granting 3000 of a resource to a fresh level-1
 * settlement (real capacity 750 — `BaseStorageCapacity` 500 +
 * level-1 Longhouse's 250 bonus, see `BuildingCatalogue.cs`) is correctly
 * clamped to 750 server-side (`ResourcePool.Adjust`), but two bugs made
 * that look like the grant mostly vanished:
 *   1. The header's storage cap was a client-side guess
 *      (`WorldModel.storageCapFor`) that ignored the real
 *      `ResourcesResponse.Capacity` the backend already sends, so a
 *      level-1 settlement's header showed "750 / 3,000" instead of the
 *      true "750 / 750".
 *   2. The admin grant UI applied a clamped grant silently, with no
 *      indication the request was truncated.
 *
 * Like admin-activity.spec.ts, this runs against demo mode (no backend
 * behind `npm run test:e2e`), so it mocks the admin settlement endpoints
 * rather than standing up a real world/settlement. This spec's job is
 * AdminSettlementsView's/ResourceBar's own rendering logic against known
 * response shapes, not the real backend clamp (covered server-side by
 * `SettlementTests.cs`).
 */

const ADMIN_USER = { id: 'admin-1', userName: 'e2e-admin', role: 'admin', status: 'active', displayName: 'E2E Admin' };
const WORLD_ID = 'world-1';
const SETTLEMENT_ID = 'settlement-1';

/** Same shape as admin-activity.spec.ts's loginAsAdmin. */
async function loginAsAdmin(page: Page) {
  await page.addInitScript(() => localStorage.setItem('bjarnoy.refreshToken', 'seed-refresh-admin'));
  await page.route('**/api/v1/auth/refresh', (route: Route) =>
    route.fulfill({ json: { accessToken: 'e2e-access-token', refreshToken: 'e2e-refresh-token', user: ADMIN_USER } }),
  );
  await page.route('**/api/v1/auth/me', (route: Route) => route.fulfill({ json: ADMIN_USER }));
}

function resourceLine(wood: number, stone: number, food: number, iron: number) {
  return { wood, stone, food, iron };
}

/** A fresh level-1 settlement's true capacity: 500 base + 250 level-1 longhouse bonus. */
const CAPACITY = resourceLine(750, 750, 900, 375);

function settlementResponse(stock: ReturnType<typeof resourceLine>) {
  return {
    id: SETTLEMENT_ID,
    worldId: WORLD_ID,
    islandId: 'island-1',
    name: "Astrid's realm",
    ownerName: 'Astrid',
    q: 0,
    r: 0,
    longhouseLevel: 1,
    claimRadius: 2,
    resources: { stock, ratePerHour: resourceLine(0, 0, 0, 0), capacity: CAPACITY },
    buildings: [],
    queue: [],
    garrison: [],
    trainingQueue: [],
    world: { state: 'Running', running: true, acceptsCommands: true, gameTime: '2026-08-30T00:00:00Z' },
  };
}

test.describe('admin settlements: grant resources honors real storage capacity', { tag: '@g2' }, () => {
  test('a grant clamped by capacity shows the true cap and reports the clamp, not a silent partial grant', async ({
    page,
  }) => {
    await loginAsAdmin(page);

    await page.route('**/api/v1/admin/worlds', (route: Route) =>
      route.fulfill({
        json: [
          {
            id: WORLD_ID,
            name: 'World One',
            status: 'Running',
            maxPlayers: 100,
            playerCount: 1,
            speedFactor: 1,
            startsAt: null,
            joinsClosed: false,
            endbossAt: null,
            endbossTriggeredAt: null,
            runState: 'Running',
            runStateSince: '2026-08-01T00:00:00Z',
          },
        ],
      }),
    );

    await page.route('**/api/v1/admin/settlements?*', (route: Route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: SETTLEMENT_ID,
              worldId: WORLD_ID,
              worldName: 'World One',
              name: "Astrid's realm",
              ownerName: 'Astrid',
              q: 0,
              r: 0,
              longhouseLevel: 1,
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 25,
        },
      }),
    );

    // The settlement already sits at its 750 wood cap before the grant —
    // matches the issue's "new settlement" scenario closely enough to prove
    // the clamp math without needing partial-fill arithmetic.
    await page.route(`**/api/v1/admin/settlements/${SETTLEMENT_ID}`, (route: Route) =>
      route.fulfill({ json: settlementResponse(resourceLine(750, 0, 0, 0)) }),
    );

    // The grant request (wood: 3000) is truncated to the 750 cap — the
    // stock doesn't move at all since it was already full.
    await page.route(`**/api/v1/admin/settlements/${SETTLEMENT_ID}/resources`, (route: Route) =>
      route.fulfill({ json: settlementResponse(resourceLine(750, 0, 0, 0)) }),
    );

    await page.goto('/admin/settlements');
    await expect(page.getByRole('heading', { name: 'Settlements' })).toBeVisible();

    await page.getByRole('button', { name: 'Manage' }).click();

    // Bug 1 fixed: the detail panel shows the *real* backend capacity
    // (750), not a synthetic client-side guess (which for a level-1
    // settlement would read 3,000).
    await expect(page.locator('.stocks')).toContainText('Wood 750 / 750');

    // Grant 3000 wood — server-side this is clamped to the 750 cap.
    const grantForm = page.locator('.grant-form');
    await grantForm.locator('label', { hasText: 'Wood' }).locator('input').fill('3000');
    await grantForm.getByRole('button', { name: 'Apply' }).click();

    // Bug 2 fixed: the clamp is surfaced, not applied silently.
    await expect(page.locator('.clamp-notice')).toContainText('wood: granted 0 of 3000');
    await expect(page.locator('.clamp-notice')).toContainText('storage full at 750');

    // The detail panel still reads the true "750 / 750", never "750 / 3,000".
    await expect(page.locator('.stocks')).toContainText('Wood 750 / 750');
  });
});
