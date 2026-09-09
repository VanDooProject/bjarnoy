import { expect, test } from './fixtures';
import { HEAVY_MAP_SPEC_TIMEOUT_MS } from './budgets';
import { WorldMapPage } from './pages';

// TEMPORARY diagnostic for the world-map hover-highlight e2e failure.
// Removed before this branch merges.
test('@debug world map hover diagnostics', async ({ page }) => {
  test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
  const world = await WorldMapPage.open(page);

  await page.evaluate(() => {
    const fog = (window as unknown as { __fogDebug: { maskUnknown: boolean; maskOutOfSight: boolean } }).__fogDebug;
    fog.maskUnknown = false;
    fog.maskOutOfSight = false;
  });

  const state = async (x?: number, y?: number) =>
    page.evaluate(
      ([px, py]) => {
        const r = (window as unknown as { __settlementRenderer: () => any }).__settlementRenderer();
        const store = (window as unknown as { __demoWorld: () => any }).__demoWorld();
        const perf = (window as unknown as { __fogPerf: Record<string, number> }).__fogPerf;
        const key = r.hoveredKey as string | null;
        const [q, r2] = (key ?? '999,999').split(',').map(Number);
        const b = r.hoverLayer.getLocalBounds();
        const s = store.model.getSettlement(store.selectedSettlementId);
        const el = px === undefined ? null : document.elementFromPoint(px!, py!);
        return {
          hoveredKey: key,
          isExplored: store.model.isExplored(q, r2),
          fogActive: r.isFogActive(),
          idleDrift: r.idleDrift,
          camera: r.camera,
          hoverBounds: { w: Math.round(b.width), h: Math.round(b.height) },
          fps: Math.round(r.app.ticker.FPS * 10) / 10,
          settlement: { q: s.q, r: s.r },
          elementAtPoint: el ? `${el.tagName}.${(el as HTMLElement).className}` : null,
          waterSuppressed: r.waterLayer?.suppressed ?? null,
          perf: { drawn: perf.terrainDrawnCount, culled: perf.terrainCulledCount, deepFogOnly: perf.deepFogOnly },
        };
      },
      [x, y],
    );

  const timedShot = async (label: string) => {
    const t0 = Date.now();
    const buf = await world.screenshot();
    console.log(`[dbg] ${label} screenshot ms=${Date.now() - t0} bytes=${buf.length}`);
    return buf;
  };

  await world.moveTo(await world.pointAt(10, 10));
  const idle = await timedShot('idle');
  console.log('[dbg] idle state', JSON.stringify(await state(10, 10)));

  const { x: cx, y: cy } = await world.centre();
  await world.moveTo({ x: cx, y: cy }, { steps: 6 });
  console.log('[dbg] hover state', JSON.stringify(await state(cx, cy)));

  for (let i = 0; i < 8; i++) {
    const shot = await timedShot(`poll${i}`);
    console.log(`[dbg] poll${i} diff=${Buffer.compare(idle, shot)}`);
  }
  console.log('[dbg] post-poll state', JSON.stringify(await state(cx, cy)));
  expect(1).toBe(1);
});
