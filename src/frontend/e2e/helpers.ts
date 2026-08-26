import type { Page } from '@playwright/test';

/**
 * Founds a settlement on the landing page (zip 6a: the landing page is the
 * village view — the starter plot is deterministic, so there's exactly one
 * hex to click, not a grid sweep across a world map), places the 2 guided
 * onboarding buildings, confirms the nickname prompt, and waits for
 * /settlement.
 */
export async function foundSettlement(page: Page): Promise<void> {
  // foundSettlement() alone — page load plus a real PixiJS/texture mount —
  // has been observed crossing the global 45s default on a loaded CI
  // runner. See settlement-interactions.spec.ts's matching comments for the
  // other tests that share this same root cause.
  await page.goto('/');
  await page.waitForTimeout(500);

  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // The starter plot is deterministic and camera-centred (HexMapRenderer's
  // previewCenter) — the highlighted hex sits at/near the viewport centre.
  await page.mouse.click(cx, cy);

  const prompt = page.getByText('Landfall made.');
  // Founding is async (even in demo mode, it's a Vue reactive update away) —
  // wait for the store to actually have a selected settlement before poking
  // it directly, rather than racing the click above.
  await page.waitForFunction(
    () => !!(window as unknown as { __demoWorld?: () => { selectedSettlementId: string | null } }).__demoWorld?.()
      ?.selectedSettlementId,
    undefined,
    { timeout: 15_000 },
  );

  // Places the 2 guided onboarding buildings directly against the model —
  // real click-to-build UI is settlement-interactions.spec's job to cover;
  // this helper only needs the onboarding *gate* (hud.buildingsPlaced,
  // NicknamePrompt) to fire reliably, and the settlement's own zoom (picked
  // by zoomForFogMargin to keep a wide fog margin on screen) makes clicking
  // a specific nearby hex by pixel offset unreliable. __demoWorld is the
  // same test/debug hook main.ts documents for exactly this kind of
  // "drive WorldModel directly" case.
  await page.evaluate(() => {
    const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string; syncHud: () => void } }).__demoWorld();
    const settlement = world.model.getSettlement(world.selectedSettlementId);
    const dirs: Array<[number, number]> = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];
    let placed = 0;
    for (let radius = 1; radius <= 2 && placed < 2; radius++) {
      for (const [dq, dr] of dirs) {
        if (placed >= 2) break;
        const at = { q: settlement.q + dq * radius, r: settlement.r + dr * radius };
        if (world.model.placeBuilding(world.selectedSettlementId, at, 'hut')) placed++;
      }
    }
    world.syncHud();
  });

  await prompt.waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('button.confirm').click();
  await page.waitForURL('**/settlement');
  await page.waitForTimeout(1000); // let the renderer mount and settle
}
