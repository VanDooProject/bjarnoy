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
  // 1: GitHub's standard hosted runner is only 2 vCPUs, and these specs
  // render real WebGL/PixiJS canvases without a GPU (CPU-bound software
  // rendering) — even 2 in-process workers oversubscribe that CPU and start
  // timing out under contention (confirmed on this repo's own runner: a
  // 2-worker run took 19.4 minutes and still failed 9 tests to timeouts,
  // worse than a clean serial run). The tests themselves have no shared
  // state and are fine to parallelize — see frontend-ci.yml's `e2e` job,
  // which shards across separate runners instead of adding in-process
  // workers here.
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
