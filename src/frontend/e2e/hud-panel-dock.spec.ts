// Desktop settlement view: the icon column at the bottom left hides and reopens the docked HUD panels, a panel's header
// drags it into a column group (or a new column) on either side, the header chevron collapses it to its header, the icon
// column steps aside for left columns that reach down to it, and the choices are remembered across a reload. In the demo settlement the Quests and Armies
// panels have something to show (no build queue, no garrison), so those two are the panels under test.
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { foundSettlement } from './helpers';
import { SettlementPage } from './pages';

// DOM and game state only: the specs read panel boxes, never map pixels.
test.use({ mapLayers: { water: false, fog: false } });

const VIEWPORT = { width: 1440, height: 900 };

const toggle = (page: Page, id: string) => page.getByTestId(`hud-panel-toggle-${id}`);
const panel = (page: Page, id: string) => page.locator(`[data-hud-panel="${id}"]`);

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('not visible');
  return b;
}

/** Drags the panel's header so the panel's centre ends up at (cx, cy). */
async function dragPanelTo(page: Page, id: string, header: Locator, cx: number, cy: number) {
  const slot = await box(panel(page, id));
  const h = await box(header);
  const grabX = h.x + 40;
  const grabY = h.y + h.height / 2;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + (cx - (slot.x + slot.width / 2)), grabY + (cy - (slot.y + slot.height / 2)), { steps: 8 });
  await page.mouse.up();
}

const questHeader = (page: Page) => page.getByTestId('quest-tray').locator('.quest-header');
const armyHeader = (page: Page) => page.getByTestId('army-panel').locator('[data-dock-handle]').first();

test.describe('HUD panel dock', { tag: '@g2' }, () => {
  test.use({ viewport: VIEWPORT });

  test('the column icons collapse a panel to its icon and open it again', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);

    await expect(settlement.questTray).toBeVisible();
    await expect(toggle(page, 'quests')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('army-panel')).toBeVisible();

    await toggle(page, 'quests').click();
    await expect(settlement.questTray).toHaveCount(0);
    await expect(toggle(page, 'quests')).toBeVisible();
    await expect(toggle(page, 'quests')).toHaveAttribute('aria-pressed', 'false');
    // The other panel is untouched.
    await expect(page.getByTestId('army-panel')).toBeVisible();

    await toggle(page, 'quests').click();
    await expect(settlement.questTray).toBeVisible();
    await expect(toggle(page, 'quests')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the column shows only icons of panels with something to show, building info first', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);

    // No build queue and no garrison in the fresh demo settlement.
    await expect(toggle(page, 'construction')).toHaveCount(0);
    await expect(toggle(page, 'garrison')).toHaveCount(0);
    const buttons = page.getByTestId('hud-panel-column').locator('button');
    await expect(buttons).toHaveCount(3);
    await expect(buttons.nth(0)).toHaveAttribute('data-testid', 'building-info-toggle');
    await expect(buttons.nth(1)).toHaveAttribute('data-testid', 'hud-panel-toggle-armies');
    await expect(buttons.nth(2)).toHaveAttribute('data-testid', 'hud-panel-toggle-quests');
    // 16px from the bottom; and right of the left column, because Quests (bottom left by default) reaches down to it.
    await expect
      .poll(async () => (await box(page.getByTestId('hud-panel-column'))).x)
      .toBeGreaterThan(16 + 40);
    const column = await box(page.getByTestId('hud-panel-column'));
    expect(column.y + column.height).toBeCloseTo(VIEWPORT.height - 16, 0);
  });

  test('the icon column returns to the left edge when no left panel reaches it', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);
    await expect.poll(async () => (await box(page.getByTestId('hud-panel-column'))).x).toBeGreaterThan(16 + 40);

    // The demo's only left panel is Quests: hide it through its icon.
    await toggle(page, 'quests').click();
    await expect.poll(async () => Math.round((await box(page.getByTestId('hud-panel-column'))).x)).toBe(16);
    await toggle(page, 'quests').click();
    await expect.poll(async () => (await box(page.getByTestId('hud-panel-column'))).x).toBeGreaterThan(16 + 40);
  });

  test('dragging the quest panel header to the top right docks it there', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);

    const before = await box(settlement.questTray);
    expect(before.x).toBeCloseTo(16, 0); // bottom of the left column 0

    await dragPanelTo(page, 'quests', questHeader(page), VIEWPORT.width - 200, 150);

    await expect(panel(page, 'quests')).toHaveAttribute('data-side', 'right');
    await expect(panel(page, 'quests')).toHaveAttribute('data-align', 'top');
    await expect
      .poll(async () => {
        const b = await box(settlement.questTray);
        return [Math.round(b.x + b.width), Math.round(b.y)];
      })
      .toEqual([VIEWPORT.width - 16, 76]);
  });

  test('dragging a panel past the left column creates a new column', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);
    await expect(page.getByTestId('hud-dock-left-1')).toHaveCount(0);

    // Armies starts on the right; its centre goes between the left column and the screen middle.
    await dragPanelTo(page, 'armies', armyHeader(page), 560, 200);

    await expect(page.getByTestId('hud-dock-left-1')).toBeVisible();
    await expect(page.getByTestId('hud-dock-left-1').locator('[data-hud-panel="armies"]')).toHaveCount(1);
    await expect(panel(page, 'armies')).toHaveAttribute('data-column', '1');
    // Right of the quest column.
    const quests = await box(panel(page, 'quests'));
    const armies = await box(panel(page, 'armies'));
    expect(armies.x).toBeGreaterThan(quests.x + quests.width);
  });

  test('a panel dropped in the bottom half is bottom-aligned in its column', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);

    await dragPanelTo(page, 'quests', questHeader(page), 150, 200);
    await expect(panel(page, 'quests')).toHaveAttribute('data-align', 'top');
    await expect.poll(async () => Math.round((await box(panel(page, 'quests'))).y)).toBe(76);

    await dragPanelTo(page, 'quests', questHeader(page), 150, 700);
    await expect(panel(page, 'quests')).toHaveAttribute('data-align', 'bottom');
    await expect
      .poll(async () => {
        const b = await box(panel(page, 'quests'));
        return Math.round(b.y + b.height);
      })
      .toBe(VIEWPORT.height - 16);
  });

  test('the collapse chevron clips a panel to its header and the state survives a reload', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const full = await box(panel(page, 'quests'));

    await page.getByTestId('hud-panel-collapse-quests').click();
    await expect(panel(page, 'quests')).toHaveClass(/is-collapsed/);
    await expect(page.getByTestId('hud-panel-collapse-quests')).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(async () => (await box(panel(page, 'quests'))).height).toBeLessThan(full.height / 2);
    const header = await box(questHeader(page));
    const collapsed = await box(panel(page, 'quests'));
    expect(collapsed.height).toBeGreaterThanOrEqual(header.y + header.height - collapsed.y);
    expect(collapsed.height).toBeLessThan(header.height + 40);
    // Still bottom-aligned.
    expect(Math.round(collapsed.y + collapsed.height)).toBe(VIEWPORT.height - 16);

    await page.reload();
    await foundSettlement(page);
    await expect(settlement.questTray).toBeVisible();
    await expect(panel(page, 'quests')).toHaveClass(/is-collapsed/);

    await page.getByTestId('hud-panel-collapse-quests').click();
    await expect(panel(page, 'quests')).not.toHaveClass(/is-collapsed/);
    await expect.poll(async () => (await box(panel(page, 'quests'))).height).toBeGreaterThan(full.height - 2);
  });

  test('a plain click on the header is not a drag', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const before = await box(settlement.questTray);
    const header = await box(settlement.questTray.locator('.quest-header'));
    await page.mouse.click(header.x + 40, header.y + header.height / 2);
    expect(await box(settlement.questTray)).toEqual(before);
    await expect(panel(page, 'quests')).toHaveAttribute('data-side', 'left');
    await expect(panel(page, 'quests')).toHaveAttribute('data-align', 'bottom');
  });

  test('the dock spot and the closed state are remembered after a reload', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    await dragPanelTo(page, 'quests', questHeader(page), VIEWPORT.width - 200, 150);
    await expect(panel(page, 'quests')).toHaveAttribute('data-side', 'right');
    await expect(panel(page, 'quests')).toHaveAttribute('data-align', 'top');
    await toggle(page, 'armies').click();
    await expect(page.getByTestId('army-panel')).toHaveCount(0);

    // A reload leaves the demo world, so found a fresh settlement; the panel prefs live in localStorage.
    await page.reload();
    await foundSettlement(page);

    await expect(settlement.questTray).toBeVisible();
    await expect(panel(page, 'quests')).toHaveAttribute('data-side', 'right');
    await expect(panel(page, 'quests')).toHaveAttribute('data-align', 'top');
    await expect(page.getByTestId('army-panel')).toHaveCount(0);
    await expect(toggle(page, 'armies')).toHaveAttribute('aria-pressed', 'false');
  });
});
