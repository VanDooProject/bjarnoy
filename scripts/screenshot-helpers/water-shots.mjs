// Screenshots for the water shader (docs/design/water-shader.md) — the
// counterpart to fog-shots.mjs, and the thing to re-run whenever the shader
// changes rather than re-deriving a click path and a set of debug flags.
//
// What it needs that flow.mjs doesn't: the water layer is under both fog quads
// (§3.2), so at the default flags most of the sea is behind mist and a change
// to the foam or the wave field is invisible. Every stop here therefore turns
// maskUnknown/maskOutOfSight off and terrainCull with them — terrain culled
// past the fog cutoff would otherwise leave islands the mask still knows about
// as bare foam rings floating on open water, which reads as a bug and isn't
// one.
import { chromium } from '../../src/frontend/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] || '.';
const baseUrl = process.argv[3] || 'http://localhost:5183';
const requestedStops = process.argv.slice(4);
mkdirSync(outDir, { recursive: true });

const wantStop = (name) => requestedStops.length === 0 || requestedStops.includes(name);
async function shoot(page, name) {
  if (!wantStop(name)) return;
  // Park the pointer in a corner first: a hex tooltip under the cursor covers
  // exactly the coastline these shots are about.
  await page.mouse.move(1430, 890);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log('Wrote', path.join(outDir, `${name}.png`));
}

const setFlags = (page, water = {}, fog = {}) =>
  page.evaluate(
    ([w, f]) => {
      Object.assign(window.__waterDebug, w);
      Object.assign(window.__fogDebug, f);
    },
    [water, fog],
  );

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => {
  const text = m.text();
  // A GLSL compile failure surfaces only as a console error — it does not throw
  // — so a run that "worked" can silently have drawn nothing at all.
  if (/syntax error|compil|not present in the shader/i.test(text)) errors.push(text);
});

// Landing page is itself a settlement-mode preview; clicking the island founds.
await page.goto(`${baseUrl}/?debug=1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.mouse.click(900, 300);
await page.waitForTimeout(900);
const skip = page.getByRole('button', { name: /skip for now/i });
if (await skip.count()) await skip.first().click();
await page.waitForTimeout(2200);

await setFlags(page, {}, { maskUnknown: false, maskOutOfSight: false, terrainCull: false });
// terrainCull is read at rebuild time, so it needs a real camera displacement
// past cameraMovedEnough's threshold to take effect (see util.mjs).
await page.mouse.move(720, 450);
await page.mouse.down();
await page.mouse.move(870, 600, { steps: 8 });
await page.waitForTimeout(150);
await page.mouse.move(720, 450, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(900);

await shoot(page, 'settlement');
await setFlags(page, { water: false });
await shoot(page, 'settlement_off');
await setFlags(page, { water: true, showWaterMask: true });
await shoot(page, 'settlement_mask');
await setFlags(page, { showWaterMask: false });

// Zoomed in on a coastline — the scale the foam and the caustics are tuned at.
for (let i = 0; i < 3; i++) {
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(160);
}
await page.waitForTimeout(1200);
await shoot(page, 'settlement_close');
await setFlags(page, { water: false });
await shoot(page, 'settlement_close_off');
await setFlags(page, { water: true });

await page.getByRole('button', { name: /world map/i }).first().click();
await page.waitForTimeout(2500);
await setFlags(page, {}, { maskUnknown: false, maskOutOfSight: false });
await shoot(page, 'world');
await setFlags(page, { midWaterWaves: false, legacyWaveSquiggles: true });
await shoot(page, 'world_legacy_squiggles');
await setFlags(page, { midWaterWaves: true, legacyWaveSquiggles: false, seaBody: false });
await shoot(page, 'world_no_sea_body');
await setFlags(page, { seaBody: true, showWaterMask: true });
await shoot(page, 'world_mask');

if (errors.length) {
  console.error('Shader/page errors:\n' + errors.slice(0, 10).join('\n'));
  process.exitCode = 1;
}
await browser.close();
