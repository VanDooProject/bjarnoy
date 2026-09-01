import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // 45s: generous enough for real camera drift/animation and a handful of
  // screenshots (20-27s observed even on a well-resourced machine), but
  // short enough that a genuine perf regression (main thread stalled by,
  // e.g., a filter left running every frame) fails fast and loud instead of
  // eating up to 90s per attempt before anyone notices.
  timeout: 45_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries, in CI or locally: a retry silently hides a flaky test
  // behind a green run instead of surfacing it.
  retries: 0,
  // 2, not 1: CI runners have 4 vCPUs, and every spec here (fixtures.ts,
  // page.route mocks scoped per-test) is already isolated per browser
  // context with no shared backend/DB, so nothing here needs serial
  // execution. Verified locally at 1/2/4 workers: 2 gets a ~1.6x wall-clock
  // win over serial with zero flakes; 4 oversubscribes the runner's CPU
  // (these specs render real WebGL/PixiJS canvases, which is CPU-bound
  // without a GPU) and starts timing out under contention.
  workers: process.env.CI ? 2 : undefined,
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
    // Explicit `--host` rather than Vite's default: without it, which
    // loopback address it binds can vary by environment, and the CI
    // failure this is fixing was a silent hang with zero webServer output
    // to explain it — bypassing the `npm run` wrapper (`npx vite preview`
    // directly) and piping stdout/stderr means a real failure next time
    // shows up in the CI log instead of just "Timed out".
    command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
