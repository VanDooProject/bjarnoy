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

await browser.close();
