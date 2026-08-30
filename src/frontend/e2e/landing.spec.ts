import { expect, test } from './fixtures';
import { foundSettlement, waitForMapReady } from './helpers';

test('landing page is the village view, not a marketing page in front of it', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  // zip 6a: a real plot of terrain is on screen immediately — no world map,
  // no click-through, no separate marketing page.
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: /put your longhouse somewhere/i })).toBeVisible();
  await expect(page.getByText('Longhouse & yard')).toBeVisible();

  // Founding, then the 2 guided onboarding buildings, then the nickname
  // prompt, then the full game — all without ever visiting a world map.
  await foundSettlement(page);
  await expect(page).toHaveURL(/\/settlement$/);
});

test('onboarding build step offers a ring menu with the tile-appropriate guided building enabled and everything else disabled', async ({ page }) => {
  // Regression coverage: the onboarding build step used to pop a
  // BuildingModal with a single "Build here" button hardcoded to a type
  // ('farm') that fails outside grass terrain — "can't actually select the
  // correct building". It now opens the same kind of RingMenu the full
  // settlement view uses, simplified to one flat ring (no build-category
  // drill-down): only the guided type matching the *clicked tile's own
  // terrain* is enabled (Farm needs grass, Lumberjack needs forest) —
  // enabling both regardless of terrain would just reintroduce the same
  // silent-failure bug for whichever one doesn't fit.
  test.setTimeout(90_000);
  await page.goto('/');
  await waitForMapReady(page);

  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  // Matches helpers.ts's own foundSettlement click point: the real world's
  // own starter plot via WorldModel.findLandfall, shifted by screenBiasX.
  await page.mouse.click(box.x + box.width * (0.5 + 0.16), box.y + box.height / 2);
  await page.waitForFunction(
    () => !!(window as unknown as { __demoWorld?: () => { selectedSettlementId: string | null } }).__demoWorld?.()
      ?.selectedSettlementId,
    undefined,
    { timeout: 15_000 },
  );

  // A guessed pixel offset only happens to land on a real hex at one
  // particular zoom/camera framing — ask the model for a real empty *grass*
  // hex inside the just-founded realm (deterministically exercising Farm's
  // own terrain requirement), then the renderer's own camera math
  // (__settlementRenderer's hexCenterScreen) for that hex's exact screen
  // position. Same technique settlement-interactions.spec.ts uses for the
  // full settlement view's own ring menu.
  const target = await page.evaluate(() => {
    const win = window as unknown as {
      __demoWorld: () => { model: any; selectedSettlementId: string };
      __settlementRenderer: () => { hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number } };
    };
    const world = win.__demoWorld();
    const settlement = world.model.getSettlement(world.selectedSettlementId);
    const radius = world.model.borderRadius(settlement);
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 > radius) continue;
        const at = { q: settlement.q + dq, r: settlement.r + dr };
        const tile = world.model.getTile(at.q, at.r);
        if (tile.ownerId === world.selectedSettlementId && tile.terrain === 'grass' && !tile.buildingType) {
          return win.__settlementRenderer().hexCenterScreen(at);
        }
      }
    }
    throw new Error('no empty grass hex found inside the realm');
  });

  await page.mouse.click(box.x + target.x, box.y + target.y);

  const farm = page.locator('.ring-bubble', { hasText: 'Farm' });
  const lumberjack = page.locator('.ring-bubble', { hasText: 'Lumberjack' });
  const quarry = page.locator('.ring-bubble', { hasText: 'Quarry' });
  await expect(farm).toBeVisible();
  await expect(lumberjack).toBeVisible();
  await expect(quarry).toBeVisible();
  await expect(farm).toBeEnabled();
  await expect(lumberjack).toBeDisabled();
  await expect(quarry).toBeDisabled();

  const countBuildings = () =>
    page.evaluate(() => {
      const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string } })
        .__demoWorld();
      return world.model.countBuildings(world.selectedSettlementId) as number;
    });
  const before = await countBuildings();
  await farm.click();
  await expect.poll(countBuildings, { timeout: 5_000 }).toBeGreaterThan(before);
  await expect(page.locator('.tray-item .sub').nth(1)).toHaveText('Placed');
});

test('impressum page is reachable and links back', async ({ page }) => {
  await page.goto('/impressum');
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await page.getByRole('button', { name: /back/i }).click();
  await page.waitForURL('**/');
});
