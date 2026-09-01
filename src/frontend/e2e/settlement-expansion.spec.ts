import { test, expect } from './fixtures';
import { foundSettlement } from './helpers';

/**
 * Settlement expansion (issue #55) — settler crews, renown, and founding a
 * second settlement.
 *
 * IMPORTANT SCOPE NOTE, read before extending this file: this repo's e2e
 * harness (`playwright.config.ts`) only ever boots the built SPA via `vite
 * preview` — there is no backend `webServer` entry, so every existing spec
 * in this directory (see `helpers.ts`'s `foundSettlement`, which drives
 * `window.__demoWorld` directly rather than a real API call) exercises
 * `DEMO_MODE`'s client-only `WorldModel` simulation, never the real ASP.NET
 * backend. `ExpansionPanel.vue` (this issue's HUD panel) deliberately only
 * renders in live mode with a logged-in account — training settler crews,
 * accruing renown, and dispatching/resolving a founding convoy are all real
 * backend concerns (a training queue that drips over game time, a renown
 * accrual that needs a world clock, a founding mission that needs A*
 * pathing and another settlement row) that the demo simulation has no
 * equivalent of, the same way it has no build queue, no upkeep, and no
 * army/movement system for the rest of the (also frontend-less, see
 * `ExpansionPanel.vue`'s own remarks) troop system either.
 *
 * A genuine golden-path run — train 3 settler crews, dispatch a founding
 * mission, fast-forward past arrival, see the second settlement and switch
 * to it — needs an e2e harness that boots the real backend (a `webServer`
 * entry for `Bjarnoy.Api`, a throwaway database, a registered/logged-in
 * test account) the way `Bjarnoy.Api.IntegrationTests` already does at the
 * HTTP level (see `SettlerEndpointsTests.cs`, which *does* cover this golden
 * path end to end, including the `_factory.Time.Advance` fast-forward this
 * spec has no equivalent for). Standing that harness up is a real, separate
 * piece of work this PR does not attempt — tracked here instead of silently
 * skipped. Until then, this spec covers what the current demo-only harness
 * actually can: that the app still boots clean in demo mode with the new
 * panel wired in, and that the panel correctly stays hidden rather than
 * rendering broken/empty in a mode it has no data for.
 */
test.describe('settlement expansion (issue #55)', () => {
  test('the expansion panel does not render in demo mode', async ({ page }) => {
    await foundSettlement(page);

    // DEMO_MODE has no auth/renown/army backend for ExpansionPanel to talk
    // to, so it must not render at all here — rendering empty or broken
    // would be worse than not rendering, and the `forbidConsoleErrors`
    // fixture (see fixtures.ts) already fails the test on any console error
    // a half-working panel would throw while polling a nonexistent API.
    await expect(page.locator('.expansion-card')).toHaveCount(0);
  });
});
