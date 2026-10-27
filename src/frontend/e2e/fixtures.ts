import { test as base, expect } from '@playwright/test';
// Imported from the module, not from `./pages`: the barrel re-exports page
// objects that import `./helpers`, and keeping this edge narrow is what
// stops `fixtures.ts` sitting in a cycle with them.
import { AdminAuthFixture } from './pages/AdminAuthFixture';

/**
 * Every e2e test should fail on an uncaught page error or a `console.error`
 * call, not just the handful of tests that happened to add their own
 * `page.on('pageerror', ...)` listener — a red console line is exactly how
 * bugs like a swallowed 409 from `bootstrapLiveWorld` surface in practice
 * (the UI itself just quietly does nothing). This autouse fixture wires that
 * check into every test in the suite instead of leaving it opt-in per file.
 */
// Sandbox/CI proxy noise: a resource request occasionally gets reset by the
// outbound proxy sitting in front of this environment, independent of any
// app code — reproduces even on unmodified, previously-green specs. It's
// not a real bug, so it shouldn't fail every test that happens to hit it;
// everything else still fails the run.
const isEnvironmentNoise = (text: string) => text.includes('net::ERR_CONNECTION_RESET');

/** Which of the map's optional layers a spec renders. See the `mapLayers` fixture. */
export interface MapLayers {
  water: boolean;
}

export const test = base.extend<{
  forbidConsoleErrors: void;
  pinnedLocale: void;
  adminAuth: AdminAuthFixture;
  antialias: 'on' | 'off';
  mapLayers: MapLayers;
  graphicsSettings: void;
}>({
  /**
   * The map's "Smooth edges" setting (lib/perf/antialiasPreference.ts), set
   * the way a player sets it: through its own localStorage key, before the
   * app loads. Off for the suite: MSAA multiplies the fill cost of every
   * frame on CI's software renderer, and only geometry edges change with it.
   * A spec that judges how the map looks opts back in with
   * `test.use({ antialias: 'on' })`.
   */
  antialias: ['off', { option: true }],

  /**
   * Explicit, per-spec opt-out of the water shader (issue #416), for specs
   * whose assertions are DOM and game state only: ring navigation, HUD,
   * cards, the queue drawer. Water is the most expensive pass of a
   * settlement frame on a software renderer (~150 ms of ~300-450 ms), and
   * hex picking is geometry, not pixels, so it cannot change their result.
   *
   * Opting out flips the same runtime switch a developer uses in the water
   * debug panel (`window.__waterDebug.water`), the moment the app installs
   * it; the app never learns it is under test. Never the default, and never
   * for a spec that looks at the map's pixels as an image, at water, shore
   * or fog behaviour, or at motion timing (ring-motion) -
   * src/test/e2eWaterOptOut.test.ts enforces those rules. Use
   * `test.use({ mapLayers: { water: false } })`.
   */
  mapLayers: [{ water: true }, { option: true }],

  graphicsSettings: [
    async ({ page, antialias, mapLayers }, use) => {
      await page.addInitScript((value) => {
        window.localStorage.setItem('bjarnoy.antialias', value);
      }, antialias);
      if (!mapLayers.water) {
        await page.addInitScript(() => {
          // main.ts assigns the flags object once at startup (demo builds);
          // catch that assignment and switch water off before the first frame.
          let flags: { water: boolean } | undefined;
          Object.defineProperty(window, '__waterDebug', {
            configurable: true,
            get: () => flags,
            set: (value: { water: boolean }) => {
              value.water = false;
              flags = value;
            },
          });
        });
      }
      await use();
    },
    { auto: true },
  ],

  /**
   * A mocked authenticated session (issue #189). Not autouse — asking for it
   * only builds the object; nothing is intercepted until a test calls
   * `adminAuth.login()`, so logged-out specs are unaffected.
   */
  adminAuth: async ({ page }, use) => {
    await use(new AdminAuthFixture(page));
  },

  /**
   * Pins the app's own locale (src/i18n) to English, independent of
   * playwright.config.ts's `locale: 'en-US'` (which only sets
   * navigator.language/Intl — the app's detectInitialLocale also checks
   * localStorage first). Without this, a suite run right after an
   * `i18n.spec.ts` locale-switch test could inherit a leftover `de` choice
   * from browser storage reuse.
   */
  pinnedLocale: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        window.localStorage.setItem('bjarnoy.locale', 'en');
      });
      await use();
    },
    { auto: true },
  ],

  forbidConsoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !isEnvironmentNoise(msg.text())) errors.push(msg.text());
      });

      await use();

      expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
