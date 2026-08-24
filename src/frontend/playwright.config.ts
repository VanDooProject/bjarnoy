import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Generous: each test waits out real camera drift/animation and takes a
  // handful of screenshots — 20-27s observed even on a well-resourced
  // machine, so the 30s default leaves too little margin on a loaded CI box.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    // Fixed, generous viewport — the map's own default zoom is tuned
    // against a viewport this size, and the tests' click/hover coordinates
    // are relative to it.
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Against the production build, not the dev server — closer to what
    // ships, and avoids HMR/dev-only behaviour leaking into the tests.
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
