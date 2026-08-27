// Walks the demo-mode onboarding flow once and screenshots every stop along
// it, so verifying a UI change doesn't mean re-deriving the click path each
// time (landing -> world map -> landfall -> settlement -> panned settlement
// all live on one path, so one script drives all of them instead of one
// script per screen).
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
async function shoot(page, name) {
  if (!wantStop(name)) return;
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log('Wrote', path.join(outDir, `${name}.png`));
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(baseUrl + '/', { waitUntil: 'networkidle' });
await shoot(page, 'landing');

await page.click('button.cta'); // "Enter the world" -> /world
await page.waitForTimeout(1000);
await shoot(page, 'world_map');

await page.mouse.click(380, 100); // click a green island hex -> landfall
await page.waitForTimeout(1500);
await shoot(page, 'landfall');

await page.click('button:has-text("Skip for now")'); // landfall modal, no nickname needed
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Settlement', exact: true }).click(); // HudNav tab
await page.waitForTimeout(2000);
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
