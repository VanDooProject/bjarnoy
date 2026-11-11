// Desktop settlement view: the icon column at the bottom left collapses and reopens the docked HUD panels, a panel's header
// drags it to another corner, and both choices are remembered across a reload. In the demo settlement the Quests and Armies
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

/** Drags the quest panel by its header to the middle of the given quarter of the viewport. */
async function dragQuestsTo(page: Page, x: number, y: number) {
  const header = await box(page.getByTestId('quest-tray').locator('.quest-header'));
  await page.mouse.move(header.x + 40, header.y + header.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
}

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
    // Bottom left, 16px from the edges.
    const column = await box(page.getByTestId('hud-panel-column'));
    expect(column.x).toBeCloseTo(16, 0);
    expect(column.y + column.height).toBeCloseTo(VIEWPORT.height - 16, 0);
  });

  test('dragging the quest panel header to the top right docks it in that corner', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);

    const before = await box(settlement.questTray);
    expect(before.x).toBeCloseTo(68, 0); // bottom left, right of the icon column

    await dragQuestsTo(page, VIEWPORT.width - 200, 150);

    await expect(panel(page, 'quests')).toHaveAttribute('data-corner', 'top-right');
    await expect
      .poll(async () => {
        const b = await box(settlement.questTray);
        return [Math.round(b.x + b.width), Math.round(b.y)];
      })
      .toEqual([VIEWPORT.width - 16, 76]);
  });

  test('a plain click on the header is not a drag', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const before = await box(settlement.questTray);
    const header = await box(settlement.questTray.locator('.quest-header'));
    await page.mouse.click(header.x + 40, header.y + header.height / 2);
    expect(await box(settlement.questTray)).toEqual(before);
    await expect(panel(page, 'quests')).toHaveAttribute('data-corner', 'bottom-left');
  });

  test('the corner and the collapsed state are remembered after a reload', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    await dragQuestsTo(page, VIEWPORT.width - 200, 150);
    await expect(panel(page, 'quests')).toHaveAttribute('data-corner', 'top-right');
    await toggle(page, 'armies').click();
    await expect(page.getByTestId('army-panel')).toHaveCount(0);

    // A reload leaves the demo world, so found a fresh settlement; the panel prefs live in localStorage.
    await page.reload();
    await foundSettlement(page);

    await expect(settlement.questTray).toBeVisible();
    await expect(panel(page, 'quests')).toHaveAttribute('data-corner', 'top-right');
    await expect(page.getByTestId('army-panel')).toHaveCount(0);
    await expect(toggle(page, 'armies')).toHaveAttribute('aria-pressed', 'false');
  });
});
