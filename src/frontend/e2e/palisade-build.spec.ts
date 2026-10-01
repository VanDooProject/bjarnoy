import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { HEAVY_MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage, type HexCoord } from './pages';
import { palisadeTileFor } from '../src/lib/map/palisadeTiles';

/**
 * The palisade (docs/design/economy.md section 5), end to end in demo mode: the ring menu offers the wall and the gate under "Defence",
 * a gate is locked with its reason until it sits between two opposite wall hexes, a wall line is placed hex by hex, and every placed hex
 * draws the piece its neighbours decide - an end, a straight, the gate, a bend.
 *
 * The layout, along a direction d with the settlement's own free hexes: a0 (end), a1 (gate), a2 (straight), a3 (the bend), e (end) with e
 * turned 120 degrees off the run at a3 - the wide bend; a bend at 60 degrees only exists in a triangle (walls never branch).
 */
const SCREENSHOT_DIR = process.env.PALISADE_SCREENSHOT_DIR;

interface Layout {
  a: HexCoord[];
  e: HexCoord;
}

test('a wall with a gate and a bend is placed from the ring menu and draws connected pieces', { tag: '@g3' }, async ({ page }) => {
  test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.found(page);
  // Unlocks at Longhouse 7: level the longhouse up, rather than weaken the gate for the test.
  await settlement.setSettlementLevel(8);
  await settlement.setResources({ wood: 5000, stone: 5000, food: 5000, iron: 0 });

  // Find the layout through the model: four free plain hexes in a row and the hex that turns 120 degrees off the last one.
  const layout = await page.evaluate((): Layout => {
    const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string } }).__demoWorld();
    const model = world.model;
    const settlement = model.getSettlement(world.selectedSettlementId);
    const radius = model.borderRadius(settlement);
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const free = (c: HexCoord) => {
      const tile = model.getTile(c.q, c.r);
      return (
        tile.ownerId === world.selectedSettlementId &&
        !tile.buildingType &&
        ['grass', 'forest', 'sand'].includes(tile.terrain) &&
        !model.getRiverTile(c.q, c.r) &&
        !tile.camp &&
        !tile.giant
      );
    };
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let d = 0; d < 6; d++) {
          const start = { q: settlement.q + dq, r: settlement.r + dr };
          const a = [0, 1, 2, 3].map((k) => ({ q: start.q + dirs[d]![0]! * k, r: start.r + dirs[d]![1]! * k }));
          const turn = dirs[(d + 1) % 6]!;
          const e = { q: a[3]!.q + turn[0]!, r: a[3]!.r + turn[1]! };
          if ([...a, e].every(free)) return { a, e };
        }
      }
    }
    throw new Error('no free run of land with a bend found inside the realm - pick a different demo seed');
  });

  const screenOf = (hex: HexCoord) =>
    page.evaluate(
      (at) =>
        (window as unknown as { __settlementRenderer: () => { hexCenterScreen: (c: HexCoord) => { x: number; y: number } } })
          .__settlementRenderer()
          .hexCenterScreen(at),
      hex,
    );
  const openDefence = async (hex: HexCoord) => {
    await settlement.clickHex(await screenOf(hex));
    await settlement.ring.openBuildCategories();
    await settlement.ring.openCategory('Defence');
  };
  const place = async (hex: HexCoord, label: string) => {
    await openDefence(hex);
    const bubble = settlement.ring.child(label).first();
    await expect(bubble).toBeVisible();
    await expect(bubble).not.toHaveClass(/locked/);
    await bubble.click();
    await expect.poll(() => settlement.buildingTypeAt(hex), { timeout: 5_000 }).toBeDefined();
  };
  const pieceAt = (hex: HexCoord) =>
    page.evaluate(
      (at) =>
        (window as unknown as { __demoWorld: () => { model: any } }).__demoWorld().model.wallNeighbourFlags(at) as boolean[],
      hex,
    );

  const [a0, a1, a2, a3] = layout.a as [HexCoord, HexCoord, HexCoord, HexCoord];

  // The first post goes through the ring menu. Both wall bubbles are offered under "Defence"; with no wall beside it the gate has no straight to
  // stand on, so it is locked, with the reason on its card, while the palisade is not.
  await openDefence(a0);
  const gateBubble = settlement.ring.child('Palisade Gate');
  await expect(gateBubble).toBeVisible();
  await expect(gateBubble).toHaveClass(/locked/);
  await settlement.ring.hover(gateBubble);
  await expect(settlement.ring.card).toContainText(/a gate only stands between two opposite wall hexes/i);
  const post = settlement.ring.child('Palisade').first();
  await expect(post).not.toHaveClass(/locked/);
  await post.click();
  await expect.poll(() => settlement.buildingTypeAt(a0), { timeout: 5_000 }).toBe('palisade');

  // The rest of the run goes straight into the model, except the gate (a ring round-trip costs seconds on a software renderer; what the rest of
  // the run needs is the placement rules and the drawn pieces, not another ring): the second post, then the gate between the two through the
  // ring, then the run on round the bend.
  const placeInModel = (hex: HexCoord) =>
    page.evaluate((at) => {
      const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string } }).__demoWorld();
      const placed = world.model.placeBuilding(world.selectedSettlementId, at, 'palisade');
      (window as unknown as { __settlementRenderer: () => { forceRebuild: () => void } }).__settlementRenderer().forceRebuild();
      return placed as boolean;
    }, hex);
  expect(await placeInModel(a2)).toBe(true);
  await place(a1, 'Palisade Gate');
  expect(await placeInModel(a3)).toBe(true);
  expect(await placeInModel(layout.e)).toBe(true);

  expect(await settlement.buildingTypeAt(a1)).toBe('palisadegate');
  for (const hex of [a0, a2, a3, layout.e]) expect(await settlement.buildingTypeAt(hex)).toBe('palisade');

  // Each hex draws the piece its wall neighbours decide (the same resolver the renderer takes the art from).
  const pieces: Record<string, string | undefined> = {};
  for (const [name, hex, gateHex] of [
    ['a0', a0, false],
    ['a1', a1, true],
    ['a2', a2, false],
    ['a3', a3, false],
    ['e', layout.e, false],
  ] as const) {
    const result = palisadeTileFor({ wallNeighbours: await pieceAt(hex), gate: gateHex });
    pieces[name] = 'piece' in result ? result.piece : result.refusal;
  }
  expect(pieces).toEqual({ a0: 'end', a1: 'gate180', a2: 'straight180', a3: 'bend120', e: 'end' });

  // A hex beside the middle of the run would be a third arm: refused by the placement rules (the ring shows the same refusal as the
  // reason on a locked bubble, as the gate's lock above), and nothing is placed.
  const refused = await page.evaluate(
    ({ at, around }) => {
      const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string } }).__demoWorld();
      const taken = new Set(around.map((c: HexCoord) => `${c.q},${c.r}`));
      const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
      const side = dirs
        .map(([dq, dr]) => ({ q: at.q + dq!, r: at.r + dr! }))
        .find((c) => !taken.has(`${c.q},${c.r}`) && world.model.palisadePlacement(c, false).reason === 'branch');
      if (!side) return null;
      return {
        side,
        placed: world.model.placeBuilding(world.selectedSettlementId, side, 'palisade') as boolean,
        type: world.model.getTile(side.q, side.r).buildingType as string | undefined,
      };
    },
    { at: a2, around: [a1, a2, a3, layout.e] },
  );
  expect(refused, 'a hex that would branch the wall').not.toBeNull();
  expect(refused!.placed).toBe(false);
  expect(refused!.type).toBeUndefined();

  // The wall as the player sees it, at the default zoom and zoomed in on the wall; the pieces must run on into each other.
  if (SCREENSHOT_DIR) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const mid = await screenOf(a2);
    const box = await settlement.canvasBox();
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))));
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/palisade-wall-default-zoom.png`,
      clip: { x: Math.max(0, box.x + mid.x - 260), y: Math.max(0, box.y + mid.y - 200), width: 520, height: 400 },
    });
    await page.mouse.move(box.x + mid.x, box.y + mid.y);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -300);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))));
    const zoomedMid = await screenOf(a2);
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/palisade-wall-zoomed.png`,
      clip: { x: Math.max(0, box.x + zoomedMid.x - 400), y: Math.max(0, box.y + zoomedMid.y - 300), width: 800, height: 600 },
    });
  }
});
