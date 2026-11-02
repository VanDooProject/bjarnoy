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
import { forceRebuild, gotoMapReady } from './util.mjs';

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

await gotoMapReady(page, baseUrl + '/');
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
    // A longhouse below level 3 allows no tower at all (maxTowers, mirrored by
    // WorldModel.placeBuilding), and a fresh demo settlement is level 1 — level
    // it up and re-claim first, the same way e2e/tower-border-expansion.spec.ts does.
    settlement.level = 3;
    store.model.claimTerritory(settlement.id);
    const radius = store.model.borderRadius(settlement);
    // q,r here are already true axial coords (see WorldModel.hexDistance) —
    // not odd-q offset coords, so no offset->cube conversion is needed.
    function cubeDist(q1, r1, q2, r2) {
      const s1 = -q1 - r1;
      const s2 = -q2 - r2;
      return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(s1 - s2));
    }
    // The first land hex on the border ring is often not buildable (a giant,
    // a guarded camp, a river, bog or lake — placeBuilding refuses all of
    // them), so try the ring in order and take the first hex a tower is
    // actually allowed on.
    let tried = 0;
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const q = settlement.q + dq;
        const r = settlement.r + dr;
        if (cubeDist(settlement.q, settlement.r, q, r) !== radius) continue;
        if (!store.model.isLand(q, r)) continue;
        tried++;
        const edge = { q, r };
        if (store.model.placeBuilding(store.selectedSettlementId, edge, 'tower')) return { ok: true, edge, radius, tried };
      }
    }
    return { ok: false, radius, tried };
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

// Wildlife camps (see src/frontend/src/lib/map/campPlacement.ts): demo mode generates the
// home island's camps on founding (WorldModel.placeGiantsForIsland, the TS port of the
// backend's CampGenerator). This stop finds the camps of the home island, one per family
// (nearest first, up to six), pans to each, switches the mist off (the demo fog only reaches ~10 hexes, and
// camps are spread over the whole island) and shoots it
// (`settlement_camp_<family>.png`); `settlement_camp` is the nearest camp of all.
if (wantStop('settlement_camp') || wantStopPrefix('settlement_camp')) {
  const camps = await page.evaluate(() => {
    const store = window.__demoWorld();
    const settlement = store.model.getSettlement(store.selectedSettlementId);
    const byFamily = new Map();
    let nearest = null;
    for (let dq = -200; dq <= 200; dq++) {
      for (let dr = Math.max(-200, -dq - 200); dr <= Math.min(200, -dq + 200); dr++) {
        const at = { q: settlement.q + dq, r: settlement.r + dr };
        const camp = store.model.campAt(at);
        if (!camp) continue;
        const d = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr));
        const entry = { at, family: camp.family, level: camp.level, orientation: camp.orientation, d };
        if (!nearest || d < nearest.d) nearest = entry;
        const best = byFamily.get(camp.family);
        if (!best || d < best.d) byFamily.set(camp.family, entry);
      }
    }
    return { nearest, families: [...byFamily.values()].sort((a, b) => a.d - b.d).slice(0, 6), total: byFamily.size };
  });
  console.log('Camps on the home island:', JSON.stringify(camps));
  if (!camps.nearest) throw new Error('no camp generated on the home island for this seed');
  const shootCamp = async (camp, name) => {
    await page.evaluate((at) => {
      // Camps are spread over the whole island and the demo fog only reaches ~10 hexes around
      // home: switch the mist off (the debug flags of FogDebugPanel) so the camp is not shot as fog.
      const fog = window.__fogDebug;
      fog.maskUnknown = false;
      fog.maskOutOfSight = false;
      fog.terrainCull = false;
      window.__settlementRenderer?.()?.panTo(at);
    }, camp.at);
    await page.waitForTimeout(300);
    // Zoom in on the camp (mouse wheel over the canvas centre), a camp is a few hexes across.
    await page.mouse.move(720, 450);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(400);
    await forceRebuild(page);
    await page.waitForTimeout(1500);
    await shootAlways(page, name);
  };
  if (wantStop('settlement_camp')) await shootCamp(camps.nearest, 'settlement_camp');
  if (wantStopPrefix('settlement_camp') && requestedStops.some((s) => s.startsWith('settlement_camp_'))) {
    for (const camp of camps.families) await shootCamp(camp, `settlement_camp_${camp.family}`);
  } else if (requestedStops.length === 0) {
    for (const camp of camps.families) await shootCamp(camp, `settlement_camp_${camp.family}`);
  }
}

// Bogland (see src/frontend/src/lib/map/bogGenerator.ts): demo mode generates an island's bog with its
// rivers (WorldModel.placeGiantsForIsland). The home island may have none (only islands with room for a
// lake get one), so this stop first lets the model place the nearest other islands until one has a bog,
// then shoots, mist off and zoomed in: the bog with its lake (`settlement_bog`), a lake mouth
// (`settlement_bog_mouth`) and a creek (`settlement_bog_creek`); kinds the island lacks are skipped.
if (wantStopPrefix('settlement_bog')) {
  const found = await page.evaluate(() => {
    const store = window.__demoWorld();
    const model = store.model;
    const home = model.getSettlement(store.selectedSettlementId);
    const list = () => model.listBogTiles();
    let generatedFor = 0;
    if (list().length === 0) {
      // The islands nearest home first: land hex near each island's centre, then the whole island's generation.
      const dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(-a.q - a.r + b.q + b.r));
      const islands = [...model.listIslands()].sort((x, y) => dist(x, home) - dist(y, home));
      for (const island of islands) {
        if (list().length > 0 || generatedFor >= 40) break;
        let land = null;
        for (let ring = 0; ring < 60 && !land; ring++) {
          for (let dq = -ring; dq <= ring && !land; dq++) {
            for (let dr = Math.max(-ring, -dq - ring); dr <= Math.min(ring, -dq + ring) && !land; dr++) {
              if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr)) !== ring) continue;
              if (model.isLand(island.q + dq, island.r + dr)) land = { q: island.q + dq, r: island.r + dr };
            }
          }
        }
        if (!land) continue;
        model.placeGiantsForIsland(land, model.seed);
        generatedFor++;
      }
    }
    const tiles = list();
    const pick = (kind) => {
      let best = null;
      for (const t of tiles) {
        if (t.kind !== kind) continue;
        const d = Math.max(Math.abs(t.q - home.q), Math.abs(t.r - home.r), Math.abs(-t.q - t.r + home.q + home.r));
        if (!best || d < best.d) best = { q: t.q, r: t.r, kind, d };
      }
      return best;
    };
    return { total: tiles.length, generatedFor, lake: pick('lake'), mouth: pick('mouth'), creek: pick('creek'), spring: pick('creekspring'), half: pick('half') };
  });
  console.log('Bog found:', JSON.stringify(found));
  if (found.total === 0) throw new Error('no bog generated for the islands around home');
  const shootBog = async (at, name) => {
    await page.evaluate((target) => {
      const fog = window.__fogDebug;
      fog.maskUnknown = false;
      fog.maskOutOfSight = false;
      fog.terrainCull = false;
      window.__settlementRenderer?.()?.panTo(target);
    }, { q: at.q, r: at.r });
    await page.waitForTimeout(300);
    await page.mouse.move(720, 450);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(400);
    await forceRebuild(page);
    await page.waitForTimeout(2500);
    await shootAlways(page, name);
  };
  if (found.lake && wantStop('settlement_bog')) await shootBog(found.lake, 'settlement_bog');
  if (found.mouth && wantStop('settlement_bog_mouth')) await shootBog(found.mouth, 'settlement_bog_mouth');
  if (found.creek && wantStop('settlement_bog_creek')) await shootBog(found.creek, 'settlement_bog_creek');
  if (found.spring && wantStop('settlement_bog_spring')) await shootBog(found.spring, 'settlement_bog_spring');

  // The bog buildings (docs/design/bog.md, "Buildings"): a second demo settlement is founded on plain moss next to a lake
  // shore and a creek, at Longhouse 25, and the buildings are placed through the real placement rules (WorldModel.placeBuilding):
  // bog-ore works and Clay Brickworks on moss, the Fishing Hut on the lake's half shores, the Hammerschmiede on a creek.
  // `settlement_bog_buildings` shoots the whole site (with the fish weir / boats the huts and works ask for on the lake);
  // `settlement_bog_oreworks`, `_clay`, `_lakehut` and `_hammer` shoot each building close up. Skipped when the island has no
  // shore (half) and creek within reach of plain moss.
  if (['settlement_bog_buildings', 'settlement_bog_oreworks', 'settlement_bog_clay', 'settlement_bog_lakehut', 'settlement_bog_hammer'].some(wantStop)) {
    const site = await page.evaluate(() => {
      const store = window.__demoWorld();
      const model = store.model;
      const dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(-a.q - a.r + b.q + b.r));
      const tiles = model.listBogTiles();
      const plain = tiles.filter((t) => t.kind === 'bog');
      const halves = tiles.filter((t) => t.kind === 'half');
      const creeks = tiles.filter((t) => t.kind === 'creek');
      // The plain moss hex with the most half shores and creeks within its claim (radius 3), preferring more of each.
      let best = null;
      for (const p of plain) {
        const h = halves.filter((t) => dist(p, t) <= 3).length;
        const c = creeks.filter((t) => dist(p, t) <= 3).length;
        const m = plain.filter((t) => dist(p, t) <= 3 && !(t.q === p.q && t.r === p.r)).length;
        if (h === 0 || c === 0 || m < 3) continue;
        const score = Math.min(h, 2) * 100 + Math.min(c, 2) * 50 + Math.min(m, 6);
        if (!best || score > best.score) best = { q: p.q, r: p.r, score, h, c, m };
      }
      if (!best) return null;
      const settlement = model.foundSettlement('shots', 'Shots', 'Bogholm', best);
      settlement.level = 25;
      model.claimTerritory(settlement.id);
      const placed = { oreworks: [], clay: [], lakehut: [], hammer: [], refused: [] };
      const put = (list, type, level, bucket, max) => {
        for (const t of list) {
          if (placed[bucket].length >= max) break;
          if (dist(best, t) > 3) continue;
          if (model.placeBuilding(settlement.id, t, type)) {
            model.getTile(t.q, t.r).buildingLevel = level;
            placed[bucket].push({ q: t.q, r: t.r });
          } else placed.refused.push({ type, q: t.q, r: t.r });
        }
      };
      const others = plain.filter((t) => !(t.q === best.q && t.r === best.r));
      put(halves, 'fishinghut', 4, 'lakehut', 3);
      put(creeks, 'hammerschmiede', 2, 'hammer', 2);
      put(others, 'bogoreworks', 6, 'oreworks', 3);
      put(others.filter((t) => !placed.oreworks.some((o) => o.q === t.q && o.r === t.r)), 'claybrickworks', 5, 'clay', 2);
      // A grass building on bog must be refused: the rule of the domain, checked live here.
      const grassRefused = model.placeBuilding(settlement.id, others.find((t) => !model.getTile(t.q, t.r).buildingType) ?? best, 'farm') === false;
      const lakeHexes = tiles.filter((t) => t.kind === 'lake' && dist(best, t) <= 8);
      const props = lakeHexes.map((t) => ({ q: t.q, r: t.r, prop: model.lakePropAt(t.q, t.r) })).filter((t) => t.prop);
      return { site: best, placed, grassRefused, props, lakeHexes: lakeHexes.length };
    });
    console.log('Bog buildings site:', JSON.stringify(site));
    if (!site) throw new Error('no plain bog hex with a lake half shore and a creek within reach on the bog islands');
    const shootAt = async (at, name, wheel = 5) => {
      await page.evaluate((target) => {
        const fog = window.__fogDebug;
        fog.maskUnknown = false;
        fog.maskOutOfSight = false;
        fog.terrainCull = false;
        window.__settlementRenderer?.()?.panTo(target);
      }, at);
      await page.waitForTimeout(300);
      await page.mouse.move(720, 450);
      for (let i = 0; i < wheel; i++) {
        await page.mouse.wheel(0, -300);
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(400);
      await forceRebuild(page);
      await page.waitForTimeout(3000);
      await shootAlways(page, name);
    };
    if (wantStop('settlement_bog_buildings')) await shootAt(site.site, 'settlement_bog_buildings', 3);
    const first = (list) => list[0];
    if (wantStop('settlement_bog_oreworks') && first(site.placed.oreworks)) await shootAt(first(site.placed.oreworks), 'settlement_bog_oreworks', 4);
    if (wantStop('settlement_bog_clay') && first(site.placed.clay)) await shootAt(first(site.placed.clay), 'settlement_bog_clay', 4);
    if (wantStop('settlement_bog_lakehut') && first(site.placed.lakehut)) await shootAt(first(site.placed.lakehut), 'settlement_bog_lakehut', 4);
    if (wantStop('settlement_bog_hammer') && first(site.placed.hammer)) await shootAt(first(site.placed.hammer), 'settlement_bog_hammer', 4);
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
