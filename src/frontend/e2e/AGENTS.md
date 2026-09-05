# e2e (Playwright) conventions

Applies to everything under `src/frontend/e2e/`. Read in addition to the root
`CLAUDE.md` — this file only covers e2e-specific rules.

Run: `npm run test:e2e` from `src/frontend` (config: `../playwright.config.ts`,
production build via `vite preview`, no backend — specs mock the API themselves).

## Before writing setup code, check what exists

- `fixtures.ts` — **always** `import { expect, test } from './fixtures'`, never
  from `@playwright/test` directly. It carries the autouse `forbidConsoleErrors`
  fixture; importing the raw `test` silently drops that regression guard.
- `helpers.ts` — `waitForMapReady(page)`, `gotoWorldMap(page)`,
  `foundSettlement(page)`, `rectsOf(locator)` / `distanceFrom(rect, x, y)`.
- `budgets.ts` — `MAP_SPEC_TIMEOUT_MS`, `HEAVY_MAP_SPEC_TIMEOUT_MS`.

## Rules that keep the suite from drifting

1. **Never sleep for the map.** Await `waitForMapReady(page)` (it waits on
   `.map-container[data-map-ready]` plus a painted frame) after any navigation
   that mounts a `HexMapRenderer`.
2. **No new inline canvas hex-click math.** Don't hand-derive a hex's pixel
   position from `page.locator('canvas').boundingBox()`. Use the app's own test
   hooks — `window.__demoWorld()` for model state and
   `window.__settlementRenderer().hexCenterScreen({ q, r })` for the screen
   point — the way `sawmill-build.spec.ts` and `shrine-build.spec.ts` do. If a
   new spec needs a variant (e.g. "find an empty owned grass hex"), add it to
   `helpers.ts` rather than pasting the loop again.
3. **No duplicated admin login.** Admin specs seed
   `localStorage['bjarnoy.refreshToken'] = 'seed-refresh-admin'` and mock
   `**/api/v1/auth/refresh` + `**/api/v1/auth/me`. That block is already
   copy-pasted across five specs (issue #189) — reuse/extend the shared helper
   instead of adding a sixth copy.
4. **A selector used in 2+ specs gets extracted.** Raw `.ring-bubble`,
   `.hex-tooltip`, `polygon[data-hex="q,r"]`, `table.table tbody tr` strings are
   the main source of the duplication we are trying to stop. Prefer a
   `data-testid` on the component plus one accessor in shared code.
5. **Timeouts are the last resort, not the first.** Only override with a
   `budgets.ts` constant (`test.setTimeout(MAP_SPEC_TIMEOUT_MS)`), never an
   ad-hoc number; `budgets.ts`'s header documents the measured evidence any new
   budget change is expected to match.
6. **Tag new specs for CI sharding.** Give the file's `test`/`test.describe` a
   `{ tag: '@g1' | '@g2' | '@g3' }` (untagged files fall into the `--grep-invert`
   catch-all group). Pick the group by expected duration — see
   `docs/ci/e2e-sharding.md`.

## Page objects (issue #189)

Full POM migration is tracked in
[#189](https://github.com/VanDooProject/bjarnoy/issues/189). Once it lands,
page objects live in `src/frontend/e2e/pages/` as `<View>Page` classes
(`SettlementPage`, `AdminActivityPage`) exposing locators + intent methods, and
new specs use them. **Until `pages/` exists, do not start a private one-off
abstraction inside a spec** — add to `helpers.ts` / `fixtures.ts` so the eventual
migration has one place to move code from.
