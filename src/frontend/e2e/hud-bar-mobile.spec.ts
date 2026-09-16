// Mobile-only HUD bar: collapsed pills cycle stock/rate/max, the collapsed
// bar pulls down into a drawer (Android-notification-shade style), and a
// stored top/bottom docking preference is honoured. Desktop gets none of
// this — see the final test.
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { loginTestUser } from './helpers';
import { SettlementPage } from './pages';

test.describe('mobile HUD bar', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('collapsed pills cycle stock -> rate -> max independently, fill bar always visible', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    const pills = page.locator('.resource-bar .resource--compact');
    await expect(pills.first()).toBeVisible();

    const wood = pills.nth(0);
    const stone = pills.nth(1);

    await expect(wood.locator('.value-compact')).not.toContainText('/h');
    await expect(wood.locator('.fill-track')).toBeVisible();

    await wood.click();
    await expect(wood.locator('.value-compact')).toContainText('/h');
    // The other pill is untouched by wood's own cycle.
    await expect(stone.locator('.value-compact')).not.toContainText('/h');
    await expect(wood.locator('.fill-track')).toBeVisible();

    await wood.click();
    await expect(wood.locator('.value-compact')).toContainText('max');
    await expect(wood.locator('.fill-track')).toBeVisible();

    await wood.click();
    await expect(wood.locator('.value-compact')).not.toContainText('/h');
    await expect(wood.locator('.value-compact')).not.toContainText('max');
  });

  test('dragging the collapsed bar down opens the pull-down drawer, dragging up closes it', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    const bar = page.locator('.hud-bar');
    const box = (await bar.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 220, { steps: 10 });
    await page.mouse.up();

    // Assert on the drawer's own actual height, not its content's mere
    // presence in the DOM — a child inside `overflow: hidden` still reports
    // a non-zero bounding box to Playwright's visibility check even while
    // the parent has clipped it down to 0, which would make this pass
    // whether or not the drag actually opened anything.
    await expect(async () => {
      const openBox = (await page.locator('.hud-drawer').boundingBox())!;
      expect(openBox.height).toBeGreaterThan(100);
    }).toPass();
    await expect(page.locator('.hud-drawer .drawer-links')).toBeVisible();

    // Closing drags from within the now-open drawer itself, not from the
    // collapsed bar's own position — the bar (and its grip) stays pinned to
    // the screen's physical top edge even while open, so there is no room
    // above it to keep dragging "up" from there (exactly like a real
    // fingertip can't move past the top bezel). The open drawer has real
    // travel space below the bar instead.
    const openBox = (await page.locator('.hud-drawer').boundingBox())!;
    const closeX = openBox.x + openBox.width / 2;
    const closeStartY = openBox.y + openBox.height - 20;
    await page.mouse.move(closeX, closeStartY);
    await page.mouse.down();
    await page.mouse.move(closeX, box.y + box.height + 4, { steps: 10 }); // up to just under the bar
    await page.mouse.up();

    // Closed height is a hairline border, not necessarily an exact "0px" —
    // what matters is the drawer container itself has collapsed back down
    // (its content is clipped by `overflow: hidden`, see TopBar.vue).
    await expect(async () => {
      const closedBox = (await page.locator('.hud-drawer').boundingBox())!;
      expect(closedBox.height).toBeLessThanOrEqual(2);
    }).toPass();
  });

  test('releasing short of the open threshold snaps the drawer back closed', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    const bar = page.locator('.hud-bar');
    const box = (await bar.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 20, { steps: 5 }); // well short of the ~30% threshold
    await page.mouse.up();

    await expect(async () => {
      const closedBox = (await page.locator('.hud-drawer').boundingBox())!;
      expect(closedBox.height).toBeLessThanOrEqual(2);
    }).toPass();
  });

  test('a stored bottom docking preference lands the bar at the bottom edge, clear of RealmPanel', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.addInitScript(() => window.localStorage.setItem('bjarnoy.hudBarPosition', 'bottom'));
    await loginTestUser(page);
    await SettlementPage.found(page);

    const bar = page.locator('.hud-bar');
    await expect(bar).toHaveClass(/hud-bar--bottom/);

    const barBox = (await bar.boundingBox())!;
    expect(barBox.y).toBeGreaterThan(700); // near the bottom of an 844px-tall viewport

    const realmBox = (await page.locator('.realm-panel').boundingBox())!;
    expect(realmBox.y + realmBox.height).toBeLessThanOrEqual(barBox.y);
  });
});

test('desktop renders no compact pills and no drag grip', async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  await loginTestUser(page);
  await SettlementPage.found(page);

  await expect(page.locator('.resource--compact')).toHaveCount(0);
  await expect(page.locator('.hud-grip')).toHaveCount(0);
  await expect(page.locator('.hud-bar')).not.toHaveClass(/hud-bar--bottom/);
});
