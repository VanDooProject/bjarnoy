import { expect, test } from '@playwright/test';
import { foundSettlement } from './helpers';

test.describe('settlement view interactions', () => {
  test('hovering a hex renders a highlight that follows the cursor', async ({ page }) => {
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // The settlement camera always centres on the longhouse, so hexes at
    // these offsets are reliably on screen regardless of where in the
    // (randomly seeded) world the settlement actually landed — but the
    // zoom picked for a level-1 realm (zoomForFogMargin) is small enough
    // that a much larger offset here used to land right on (or past) the
    // explored ring's edge, which the hex-offset grid's stagger can push
    // either side of depending on the settlement's own axial parity. These
    // offsets are well inside the guaranteed border+explored radius.
    const clip = { x: cx - 130, y: cy - 230, width: 260, height: 220 };

    const tooltip = page.locator('.hex-tooltip');

    // top-left corner of the canvas is well outside the level-1 border-2
    // realm — a reliable "nothing hovered" baseline (unexplored hexes
    // aren't drawn at all, hover included)
    await page.mouse.move(box.x + 5, box.y + 5);
    await expect(tooltip).toBeHidden();
    const idle = await page.screenshot({ clip });

    // A fixed waitForTimeout here raced the renderer's own frame cadence
    // (CI's software-rendered Chromium doesn't paint on a predictable
    // schedule) — the tooltip mounting is the actual signal the hover took
    // effect, so wait on that instead of guessing how long a frame takes.
    await page.mouse.move(cx, cy - 60, { steps: 6 });
    await expect(tooltip).toBeVisible();
    const hoverA = await page.screenshot({ clip });
    expect(Buffer.compare(idle, hoverA)).not.toBe(0);

    // Position (not text) is what reliably distinguishes the two hovers:
    // two different hexes can share the same terrain label ("Grassland" /
    // "Unclaimed"), but the tooltip is anchored to the hovered hex's own
    // screen coordinates, so a real hex change always moves it.
    const hoverALeft = await tooltip.evaluate((el) => (el as HTMLElement).style.left);
    await page.mouse.move(cx - 45, cy - 15, { steps: 6 });
    await expect(tooltip).not.toHaveCSS('left', hoverALeft);
    const hoverB = await page.screenshot({ clip });
    expect(Buffer.compare(hoverA, hoverB)).not.toBe(0);
  });

  test('clicking an empty hex inside the realm places a building', async ({ page }) => {
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // a spread of offsets almost certainly inside the level-1 border-2
    // realm and not already built on (the centre hex is the longhouse)
    const offsets: Array<[number, number]> = [
      [0, -140],
      [-120, -70],
      [120, -70],
      [-120, 70],
      [120, 70],
      [0, 140],
      [-60, -140],
      [60, -140],
    ];

    let placed = false;
    for (const [dx, dy] of offsets) {
      const x = cx + dx;
      const y = cy + dy;
      const clip = { x: x - 40, y: y - 40, width: 80, height: 80 };
      const before = await page.screenshot({ clip });
      await page.mouse.click(x, y);
      await page.waitForTimeout(200);
      const after = await page.screenshot({ clip });
      if (Buffer.compare(before, after) !== 0) {
        placed = true;
        break;
      }
    }
    expect(placed).toBe(true);
  });

  test('panning the settlement view does not error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const before = await canvas.screenshot();

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(cx - i * 25, cy - i * 8);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
    expect(errors).toEqual([]);
  });
});
