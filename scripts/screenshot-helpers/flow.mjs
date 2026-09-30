// Walks the demo-mode onboarding flow once and screenshots every stop along
// it, so verifying a UI change doesn't mean re-deriving the click path each
// time (landing -> landfall -> settlement -> panned settlement all live on
// one path, so one script drives all of them instead of one script per
// screen).
//
// zip 6a rewrote the landing page itself into the village view (no
// separate world-map click-through before founding), and design handoff
// "2a" replaced the forced nickname modal with a dismissible profile-mark
// nudge — this script no longer clicks `button.cta` ("Enter the world",
// gone) or "Skip for now" (nothing to skip anymore) accordingly.
//
// Usage: node scripts/screenshot-helpers/flow.mjs [outDir] [baseUrl] [stops...]
//   outDir  default: current directory
//   baseUrl default: http://localhost:5183 (requires a running dev server:
//           cd src/frontend && npx vite --port 5183)
//   stops   optional list to limit which screenshots are taken, e.g.
//           `node flow.mjs out '' settlement settlement_panned`
//           default: all stops, in order.
//
// Requires src/frontend/vendor/bg_assets_hextile populated (gitignored
// submodule checkout) for settlement-view tile art to render.
import { chromium } from '../../src/frontend/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { forceRebuild } from './util.mjs';

const outDir = process.argv[2] || '.';
const baseUrl = process.argv[3] || 'http://localhost:5183';
const requestedStops = process.argv.slice(4);
mkdirSync(outDir, { recursive: true });

const wantStop = (name) => requestedStops.length === 0 || requestedStops.includes(name);
// settlement_giant_orientations writes one file per orientation
// (settlement_giant_orientations_<CAM>.png), not one literally named
// settlement_giant_orientations — so a caller filtering stops by that base
// name (or by one specific orientation's full name) needs a prefix match,
// not `wantStop`'s exact one.
const wantStopPrefix = (prefix) =>
  requestedStops.length === 0 || requestedStops.some((s) => s === prefix || s.startsWith(`${prefix}_`));
async function shootAlways(page, name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log('Wrote', path.join(outDir, `${name}.png`));
}
async function shoot(page, name) {
  if (!wantStop(name)) return;
  await shootAlways(page, name);
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(baseUrl + '/', { waitUntil: 'networkidle' });
await shoot(page, 'landing');

// The deterministic starter plot (LandingView's own screenBiasX=0.16 bias,
// same math as e2e/helpers.ts's claimLandfall) — there is no world map to
// click through first; the landing page already is the village view.
{
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + box.width * (0.5 + 0.16), box.y + box.height / 2);
}
await page.waitForFunction(() => !!window.__demoWorld?.()?.selectedSettlementId);
await page.waitForTimeout(500);
await shoot(page, 'landfall');

// Design handoff "2a": onboarding no longer forces a modal here, so nothing
// blocks going straight to the settlement view.
await page.getByRole('button', { name: 'Settlement', exact: true }).click(); // HudNav tab
// The settlement map takes ~5 s to draw on headless chromium's software renderer (2 s left the
// "Loading map" overlay in the shot).
await page.waitForTimeout(8000);
await shoot(page, 'settlement');

// Pan the camera outward to check fog continuity/gradient past the default view.
await page.mouse.move(720, 450);
await page.mouse.down();
await page.mouse.move(200, 200, { steps: 20 });
await page.mouse.up();
await page.waitForTimeout(500);
await shoot(page, 'settlement_panned');

// Hover a hex to check the tooltip.
await page.mouse.move(720, 450);
await page.waitForTimeout(300);
await shoot(page, 'settlement_hover');

// Border-anchoring: place a tower at the settlement's own border edge (via
// the demo-mode debug hook, window.__demoWorld — main.ts) to extend
// ownership past the pure hex radius (WorldModel.placeBuilding's
// TOWER_CLAIM_RADIUS), giving the border/fog rendering a non-hex silhouette
// to check against instead of every settlement's default perfect hexagon.
// The mutation happens off the render loop, so it needs forceRebuild() (see
// util.mjs) to actually show up — a plain WorldModel mutation alone doesn't
// trigger a rebuild.
if (wantStop('settlement_tower_border')) {
  const towerInfo = await page.evaluate(() => {
    const store = window.__demoWorld();
    const settlement = store.model.getSettlement(store.selectedSettlementId);
    const radius = store.model.borderRadius(settlement);
    // q,r here are already true axial coords (see WorldModel.hexDistance) —
    // not odd-q offset coords, so no offset->cube conversion is needed.
    function cubeDist(q1, r1, q2, r2) {
      const s1 = -q1 - r1;
      const s2 = -q2 - r2;
      return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(s1 - s2));
    }
    let edge = null;
    for (let dq = -radius; dq <= radius && !edge; dq++) {
      for (let dr = -radius; dr <= radius && !edge; dr++) {
        const q = settlement.q + dq;
        const r = settlement.r + dr;
        if (cubeDist(settlement.q, settlement.r, q, r) !== radius) continue;
        if (!store.model.isLand(q, r)) continue;
        edge = { q, r };
      }
    }
    if (!edge) return { ok: false };
    const placed = store.model.placeBuilding(store.selectedSettlementId, edge, 'tower');
    return { ok: placed, edge, radius };
  });
  if (!towerInfo.ok) throw new Error('failed to place test tower: ' + JSON.stringify(towerInfo));
  console.log('Placed test tower at', towerInfo.edge, 'border radius', towerInfo.radius);
  await forceRebuild(page);
  await shoot(page, 'settlement_tower_border');
}

// Giant tiles (see src/frontend/src/lib/map/giantTiles.ts): demo mode
// generates the home island's giants on founding (WorldModel.
// placeGiantsForIsland, the TS port of the backend's GiantGenerator, wired
// in stores/world.ts's foundStartingSettlement) — this stop just pans to the
// nearest one and shoots it with its surrounding tiles in frame, so
// occlusion against neighbouring forest/building art is checkable.
let giantAnchor = null;
if (wantStop('settlement_giant') || wantStopPrefix('settlement_giant_orientations')) {
  giantAnchor = await page.evaluate(() => {
    const store = window.__demoWorld();
    const settlement = store.model.getSettlement(store.selectedSettlementId);
    let best = null;
    // Islands are ~150 hexes across, so the nearest giant can be well past 20 hexes away: look
    // outward from the settlement (giantAnchorAt is a cheap map lookup, unlike materialising tiles).
    for (let dq = -120; dq <= 120; dq++) {
      for (let dr = Math.max(-120, -dq - 120); dr <= Math.min(120, -dq + 120); dr++) {
        const anchor = store.model.giantAnchorAt({ q: settlement.q + dq, r: settlement.r + dr });
        if (anchor && !(best && best.d <= Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr)))) {
          best = { d: Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr)), anchor };
        }
      }
    }
    // Giants are spread over the whole (~150-hex) island and the demo fog only reveals ~10 hexes
    // around home, so a far one would be shot as pure fog: when none is close, place one by hand.
    if (best && best.d <= 14) return best.anchor;
    for (let radius = 4; radius <= 10; radius++) {
      for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
          if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr)) !== radius) continue;
          const at = { q: settlement.q + dq, r: settlement.r + dr };
          if (store.model.canPlaceGiant(at) && store.model.placeGiant(at, 'giantmountain')) return at;
        }
      }
    }
    if (best) return best.anchor;
    return null;
  });
  if (!giantAnchor) throw new Error('no giant generated on the home island for this seed');
  console.log('Giant mountain anchored at', giantAnchor);

  await page.evaluate((coord) => window.__settlementRenderer?.()?.panTo(coord), giantAnchor);
  await page.waitForTimeout(150);
  await forceRebuild(page);
  await shoot(page, 'settlement_giant');
}

// One screenshot per camera rotation the giant can be placed in — a real
// tile's own orientation is baked in by the world generator, but a giant is
// deliberately re-orientable (WorldModel.placeGiant's own `orientation`
// param), so this exercises every `giantmountain_<CAM>_...` frame set the
// atlas can carry, not just whichever one the deterministic demo seed
// happened to generate at that anchor.
if (wantStopPrefix('settlement_giant_orientations') && giantAnchor) {
  const orientations = ['E', 'NE', 'NW', 'W', 'SW', 'SE'];
  for (const orientation of orientations) {
    await page.evaluate(
      ({ anchor, orientation }) => {
        const store = window.__demoWorld();
        // Re-placing from scratch would be rejected by canPlaceGiant (the
        // hexes are already tagged with this same giant) — this is purely a
        // cosmetic re-orientation of an already-valid placement, so the 7
        // covered tiles' own `giant.orientation` are updated directly
        // instead of going through placeGiant again.
        const deltas = [
          { q: 1, r: 0 },
          { q: 1, r: -1 },
          { q: 0, r: -1 },
          { q: -1, r: 0 },
          { q: -1, r: 1 },
          { q: 0, r: 1 },
        ];
        const coords = [anchor, ...deltas.map((d) => ({ q: anchor.q + d.q, r: anchor.r + d.r }))];
        for (const c of coords) {
          const tile = store.model.getTile(c.q, c.r);
          if (tile.giant) tile.giant.orientation = orientation;
        }
      },
      { anchor: giantAnchor, orientation },
    );
    await forceRebuild(page);
    await shootAlways(page, `settlement_giant_orientations_${orientation}`);
  }
}

// Rivers and streams (see docs/design/river-generation.md): demo mode traces the home island's
// rivers on founding (WorldModel.placeGiantsForIsland). Rivers sit anywhere on the ~150-hex island,
// far outside the ~10-hex demo vision, so this lifts the fog (the same flags FogDebugPanel flips),
// finds the nearest tile of each kind (a stream, the widening straight, a stream confluence, a stream-into-river confluence, a
// delta mouth, a plain river) and shoots each. Kinds the island does not have are skipped.
if (wantStopPrefix('settlement_river')) {
  await page.evaluate(() => {
    const f = window.__fogDebug;
    f.maskUnknown = false;
    f.maskOutOfSight = false;
    f.terrainCull = false;
  });
  const found = await page.evaluate(() => {
    const store = window.__demoWorld();
    const settlement = store.model.getSettlement(store.selectedSettlementId);
    const kinds = {
      stream: (t) => t.width === 'stream' && (t.shape === 'straight' || t.shape === 'bend'),
      widen: (t) => t.width === 'widen' && t.shape === 'straight',
      confluence: (t) => t.shape === 'confluence' && t.width === 'widen',
      riverstream: (t) => t.shape === 'confluence' && t.width === 'riverstream',
      riverconfluence: (t) => t.shape === 'confluence' && t.width === 'river',
      delta: (t) => t.shape === 'mouth' && t.width === 'river',
      river: (t) => t.width === 'river' && t.shape === 'straight',
    };
    const best = {};
    const R = 130;
    for (let dq = -R; dq <= R; dq++) {
      for (let dr = Math.max(-R, -dq - R); dr <= Math.min(R, -dq + R); dr++) {
        const tile = store.model.getRiverTile(settlement.q + dq, settlement.r + dr);
        if (!tile) continue;
        const d = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr));
        for (const [kind, test] of Object.entries(kinds)) {
          if (test(tile) && (!best[kind] || best[kind].d > d)) best[kind] = { d, at: { q: tile.q, r: tile.r } };
        }
      }
    }
    return best;
  });
  console.log('River tiles found', JSON.stringify(found));
  for (const [kind, { at }] of Object.entries(found)) {
    if (!wantStop(`settlement_river_${kind}`) && requestedStops.length > 0 && !requestedStops.includes('settlement_river')) continue;
    await page.evaluate((coord) => window.__settlementRenderer?.()?.panTo(coord), at);
    await page.waitForTimeout(300);
    // Zoom in on the tile: a stream is half a river wide and only reads up close.
    await page.mouse.move(720, 450);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(400);
    await forceRebuild(page);
    await page.waitForTimeout(800);
    await shootAlways(page, `settlement_river_${kind}`);
  }
}

// The fog debug panel (?debug=1, see FogDebugPanel.vue) toggles individual
// fog mechanisms — flip one on/off from the panel itself rather than the
// console hook, to check the panel's own forceRebuild wiring, not just the
// underlying fogDebugFlags plumbing.
if (wantStop('settlement_fog_debug')) {
  // Vue Router's web history listens for popstate, so this updates the
  // route reactively without a full page reload (which would lose the
  // in-memory demo WorldModel/settlement selection).
  await page.evaluate(() => {
    history.replaceState(history.state, '', location.pathname + '?debug=1');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForTimeout(300);
  await shoot(page, 'settlement_fog_debug');
}

await browser.close();
