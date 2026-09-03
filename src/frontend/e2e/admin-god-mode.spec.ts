import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * The admin god-mode surface from issue #105 — instant build, the graphical
 * settlement editor, troop creation, troop editing, and world creation —
 * driven through the real admin UI.
 *
 * Like admin-activity.spec.ts, this runs against demo mode (`vite preview`
 * with no backend behind it, see playwright.config.ts's webServer), so the
 * admin endpoints are mocked and the assertions are about the views' own
 * wiring: that clicking a hex sends the right request to the right route,
 * and that the panel re-renders from what comes back. The endpoints
 * themselves are covered end to end by
 * `Bjarnoy.Api.IntegrationTests/AdminGodModeEndpointsTests`.
 */

const ADMIN_USER = { id: 'admin-1', userName: 'e2e-admin', role: 'admin', status: 'active', displayName: 'E2E Admin' };

const SETTLEMENT_ID = '11111111-1111-1111-1111-111111111111';
const ARMY_ID = '22222222-2222-2222-2222-222222222222';

async function loginAsAdmin(page: Page) {
  await page.addInitScript(() => localStorage.setItem('bjarnoy.refreshToken', 'seed-refresh-admin'));
  await page.route('**/api/v1/auth/refresh', (route: Route) =>
    route.fulfill({ json: { accessToken: 'e2e-access-token', refreshToken: 'e2e-refresh-token', user: ADMIN_USER } }),
  );
  await page.route('**/api/v1/auth/me', (route: Route) => route.fulfill({ json: ADMIN_USER }));
}

interface SettlementOverrides {
  longhouseLevel?: number;
  buildings?: { q: number; r: number; type: string; level: number }[];
  queue?: unknown[];
  garrison?: { unit: string; count: number }[];
}

function settlement(overrides: SettlementOverrides = {}) {
  return {
    id: SETTLEMENT_ID,
    worldId: 'world-1',
    islandId: 'island-1',
    name: 'Bjornstad',
    ownerName: 'Ragnar',
    q: 0,
    r: 0,
    longhouseLevel: overrides.longhouseLevel ?? 1,
    claimRadius: 1,
    resources: {
      stock: { wood: 300, stone: 200, food: 150, iron: 50 },
      ratePerHour: { wood: 10, stone: 5, food: 8, iron: 2 },
      capacity: { wood: 1000, stone: 1000, food: 1000, iron: 1000 },
    },
    buildings: overrides.buildings ?? [{ q: 0, r: 0, type: 'longhouse', level: 1 }],
    queue: overrides.queue ?? [],
    garrison: overrides.garrison ?? [],
    trainingQueue: [],
    world: { state: 'running', running: true, acceptsCommands: true, gameTime: '2026-01-01T00:00:00Z' },
  };
}

function layout(centreLevel = 1, extra: { q: number; r: number; building: string; level: number }[] = []) {
  const hexes = [
    { q: 0, r: 0, terrain: 'grass', isCoastalWater: false, building: 'longhouse', level: centreLevel, isCentre: true },
    { q: 1, r: 0, terrain: 'grass', isCoastalWater: false, building: null, level: null, isCentre: false },
    { q: 0, r: 1, terrain: 'forest', isCoastalWater: false, building: null, level: null, isCentre: false },
    { q: -1, r: 0, terrain: 'grass', isCoastalWater: false, building: null, level: null, isCentre: false },
  ];

  for (const placed of extra) {
    const hex = hexes.find((h) => h.q === placed.q && h.r === placed.r);
    if (hex) {
      hex.building = placed.building;
      hex.level = placed.level;
    }
  }

  return {
    settlementId: SETTLEMENT_ID,
    claimRadius: 1,
    hexes,
    buildingTypes: ['longhouse', 'farm', 'lumberjack'],
    maxLevel: 10,
  };
}

function armyEntry(overrides: { stacks?: { unit: string; count: number }[]; position?: { q: number; r: number } } = {}) {
  return {
    worldId: 'world-1',
    settlementName: 'Bjornstad',
    ownerName: 'Ragnar',
    army: {
      id: ARMY_ID,
      settlementId: SETTLEMENT_ID,
      mission: 'move',
      targetSettlementId: null,
      atHome: false,
      supporting: false,
      position: overrides.position ?? { q: 3, r: 4 },
      provisions: 120,
      totalSpeed: 3,
      totalUpkeepPerHour: 2,
      stacks: overrides.stacks ?? [{ unit: 'thrall', count: 5 }],
      movement: {
        departedAt: '2026-01-01T00:00:00Z',
        path: [],
        cumulativeHours: [],
        arrivesAt: '2026-01-01T10:00:00Z',
        returnPath: [],
        returnCumulativeHours: [],
        turnAroundAt: '2026-01-01T20:00:00Z',
        returnArrivesAt: '2026-01-02T06:00:00Z',
        isReturning: false,
      },
    },
  };
}

/**
 * The admin settlements area, wired so the detail panel opens with one
 * settlement whose queue holds one pending build. `state` is mutated by the
 * write routes so a later GET reflects the earlier write — the point being
 * that the panel re-renders from the server's answer, not from optimism.
 */
async function mockSettlementsApi(page: Page) {
  const state = { placed: [] as { q: number; r: number; building: string; level: number }[], longhouseLevel: 1 };

  // AdminLayout's header world selector fetches this on every admin page
  // load and the settlements view won't search until a world is selected
  // (see stores/adminWorld.ts) — without a world here, "world-1" (this
  // fixture's settlement) never gets picked and the Manage button never
  // appears.
  await page.route('**/api/v1/admin/worlds', (route: Route) =>
    route.fulfill({
      json: [
        {
          id: 'world-1',
          name: 'Midgard',
          status: 'active',
          maxPlayers: 500,
          playerCount: 3,
          speedFactor: 1,
          startsAt: null,
          joinsClosed: false,
          endbossAt: null,
          endbossTriggeredAt: null,
          runState: 'running',
          runStateSince: '2026-01-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
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
            worldId: 'world-1',
            worldName: 'Midgard',
            name: 'Bjornstad',
            ownerName: 'Ragnar',
            q: 0,
            r: 0,
            longhouseLevel: state.longhouseLevel,
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 25,
      },
    }),
  );

  await page.route(`**/api/v1/admin/settlements/${SETTLEMENT_ID}/layout`, (route: Route) =>
    route.fulfill({ json: layout(state.longhouseLevel, state.placed) }),
  );

  await page.route(`**/api/v1/admin/settlements/${SETTLEMENT_ID}/queue/complete`, (route: Route) => {
    state.longhouseLevel = 2;
    return route.fulfill({
      json: {
        completedBuilds: 1,
        completedTraining: 0,
        settlement: settlement({
          longhouseLevel: 2,
          buildings: [{ q: 0, r: 0, type: 'longhouse', level: 2 }],
        }),
      },
    });
  });

  await page.route(`**/api/v1/admin/settlements/${SETTLEMENT_ID}/garrison`, (route: Route) =>
    route.fulfill({ json: settlement({ garrison: [{ unit: 'spearman', count: 25 }] }) }),
  );

  await page.route(`**/api/v1/admin/settlements/${SETTLEMENT_ID}/buildings/*/*`, (route: Route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { building: string; level: number };
      state.placed = [{ q: 1, r: 0, building: body.building, level: body.level }];
      return route.fulfill({
        json: settlement({
          buildings: [
            { q: 0, r: 0, type: 'longhouse', level: state.longhouseLevel },
            { q: 1, r: 0, type: body.building, level: body.level },
          ],
        }),
      });
    }

    state.placed = [];
    return route.fulfill({ json: settlement() });
  });

  await page.route('**/api/v1/admin/armies?*', (route: Route) => route.fulfill({ json: [armyEntry()] }));
  await page.route(`**/api/v1/admin/armies/${ARMY_ID}`, (route: Route) => {
    const body = route.request().postDataJSON() as { position?: { q: number; r: number } };
    return route.fulfill({ json: armyEntry({ position: body.position ?? { q: 3, r: 4 } }) });
  });

  // The settlement detail fetch. Its pattern ends at the id with no trailing
  // wildcard, so it matches only the detail URL itself and never swallows the
  // /layout, /garrison, /queue or /buildings routes above — which matters,
  // because Playwright tries handlers in reverse registration order.
  await page.route(`**/api/v1/admin/settlements/${SETTLEMENT_ID}`, (route: Route) =>
    route.fulfill({
      json: settlement({
        longhouseLevel: state.longhouseLevel,
        queue: [
          {
            id: 'order-1',
            q: 0,
            r: 0,
            building: 'longhouse',
            targetLevel: 2,
            completesAtGameTime: '2026-01-01T10:00:00Z',
            completesInSeconds: 36_000,
          },
        ],
      }),
    }),
  );

  await page.route('**/api/v1/units', (route: Route) =>
    route.fulfill({
      json: [
        { type: 'spearman', class: 'infantry', attack: 10, defense: 10, speed: 3, carryCapacity: 10, foodCarryCapacity: 10, upkeepPerHour: 1, trainingCost: { wood: 10, stone: 0, food: 10, iron: 0 }, trainingSeconds: 60, requires: null },
      ],
    }),
  );
}

async function openSettlementPanel(page: Page) {
  await page.goto('/admin/settlements');
  await page.getByRole('button', { name: 'Manage' }).click();
  await expect(page.getByText('Settlement editor')).toBeVisible();
}

test.describe('admin god mode', { tag: '@g2' }, () => {
  test('finishes a queued build instantly and reports what it built', async ({ page }) => {
    await loginAsAdmin(page);
    await mockSettlementsApi(page);
    await openSettlementPanel(page);

    const instaBuild = page.locator('button.insta');
    await expect(instaBuild).toContainText('Instant build (1 queued)');
    await instaBuild.click();

    await expect(page.getByText('Finished 1 build(s)')).toBeVisible();
    // The row's longhouse column re-renders from the settlement the server
    // returned, so the level actually moved.
    await expect(page.locator('tbody tr').first()).toContainText('2');
  });

  test('places a building on a clicked hex and razes it again', async ({ page }) => {
    await loginAsAdmin(page);
    await mockSettlementsApi(page);
    await openSettlementPanel(page);

    await page.locator('polygon[data-hex="1,0"]').click();
    await expect(page.locator('.hex-form')).toContainText('Empty');

    await page.locator('.hex-form select').selectOption('farm');
    await page.locator('.hex-form input[type="number"]').fill('6');

    const placeRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PUT' && request.url().includes(`/admin/settlements/${SETTLEMENT_ID}/buildings/1/0`),
    );
    // Scoped: GrantResourcesForm's own submit button is also called "Apply".
    await page.locator('.hex-form').getByRole('button', { name: 'Apply' }).click();
    await placeRequest;

    // The grid reloads from the layout endpoint, which now reports the farm.
    await expect(page.locator('polygon[data-hex="1,0"]')).toHaveClass(/occupied/);

    const razeRequest = page.waitForRequest(
      (request) =>
        request.method() === 'DELETE' && request.url().includes(`/admin/settlements/${SETTLEMENT_ID}/buildings/1/0`),
    );
    await page.locator('polygon[data-hex="1,0"]').click();
    await page.getByRole('button', { name: 'Raze' }).click();
    await razeRequest;

    await expect(page.locator('polygon[data-hex="1,0"]')).not.toHaveClass(/occupied/);
  });

  test('creates troops straight into the garrison', async ({ page }) => {
    await loginAsAdmin(page);
    await mockSettlementsApi(page);
    await openSettlementPanel(page);

    await page.locator('.garrison-form select').selectOption('spearman');
    await page.locator('.garrison-form input[type="number"]').fill('25');
    await page.locator('.garrison-form').getByRole('button', { name: 'Create' }).click();

    await expect(page.locator('.garrison-form')).toContainText('spearman 25');
  });

  test('moves an army in the field to another hex', async ({ page }) => {
    await loginAsAdmin(page);
    await mockSettlementsApi(page);
    await openSettlementPanel(page);

    await expect(page.locator('.army-editor')).toContainText('5x thrall');
    await page.locator('.army-editor').getByRole('button', { name: 'Edit' }).click();

    const controls = page.locator('.army-editor .controls').nth(1);
    await controls.locator('input').first().fill('9');
    await controls.locator('input').nth(1).fill('9');
    await page.getByRole('button', { name: 'Move here' }).click();

    await expect(page.locator('.army-editor')).toContainText('(9, 9)');
  });

  test('creates a new world from the worlds page', async ({ page }) => {
    await loginAsAdmin(page);

    const existing = {
      id: 'world-1',
      name: 'Midgard',
      status: 'active',
      maxPlayers: 500,
      playerCount: 3,
      speedFactor: 1,
      startsAt: null,
      joinsClosed: false,
      endbossAt: null,
      endbossTriggeredAt: null,
      runState: 'running',
      runStateSince: '2026-01-01T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
    };

    await page.route('**/api/v1/admin/worlds', (route: Route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { name: string; maxPlayers: number };
        return route.fulfill({
          status: 201,
          json: { ...existing, id: 'world-2', name: body.name, maxPlayers: body.maxPlayers, playerCount: 0 },
        });
      }

      return route.fulfill({ json: [existing] });
    });

    await page.goto('/admin/worlds');
    await expect(page.getByRole('heading', { name: 'Create a world' })).toBeVisible();

    await page.locator('.create input[type="text"]').fill('Alfheim');
    await page.locator('.create input[type="number"]').nth(2).fill('120');
    await page.getByRole('button', { name: 'Create world' }).click();

    await expect(page.locator('tbody')).toContainText('Alfheim');
    await expect(page.locator('tbody')).toContainText('0 / 120');
  });
});
