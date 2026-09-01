// Fog-focused screenshot walk (issue: white mist appearance + wind drift).
//
// scripts/screenshot-helpers/flow.mjs's own path starts at a `button.cta`
// ("Enter the world") that the landing page no longer has — landfall now
// happens by clicking a hex on the landing preview island itself. This
// script drives that current path and stops only at the views the fog
// change is judged on: the settlement view at rest, the same view panned
// out (so the vision edge and the deep mist are both in frame), and the
// world map.
//
// Usage: node scripts/screenshot-helpers/fog-shots.mjs <outDir> [baseUrl]
//   Requires a dev server (cd src/frontend && npx vite --port 5183) and a
//   populated src/frontend/vendor/bg_assets_hextile.
import { chromium } from '../../src/frontend/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] || '.';
const baseUrl = process.argv[3] || 'http://localhost:5183';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));

const shoot = async (name) => {
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log('Wrote', path.join(outDir, `${name}.png`));
};

await page.goto(baseUrl + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Place the longhouse on the landing preview island -> landfall modal.
await page.mouse.click(950, 300);
await page.waitForTimeout(1500);
const skip = page.locator('button:has-text("Skip for now")');
if (await skip.count()) {
  await skip.first().click();
  await page.waitForTimeout(600);
}

await page.getByRole('button', { name: 'Settlement', exact: true }).click();
await page.waitForTimeout(2500);
await shoot('settlement');

// Pan outward so the vision edge sits mid-viewport with deep mist beyond it.
await page.mouse.move(720, 450);
await page.mouse.down();
await page.mouse.move(340, 260, { steps: 20 });
await page.mouse.up();
await page.waitForTimeout(1200);
await shoot('settlement_panned');

// Two frames ~4s apart at rest: the wind drift has to be visible between
// them, which is exactly what the old constants failed to deliver.
await page.waitForTimeout(4000);
await shoot('settlement_panned_t4s');

await page.getByRole('button', { name: 'World map', exact: true }).click();
await page.waitForTimeout(2500);
await shoot('world_map');

await browser.close();
