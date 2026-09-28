# Happy path tests

The end-to-end tests that walk a new player's main journey through the real
UI, start to finish. If one of these is red, a new player can't get into the
game — treat it as a release blocker, not a flake.

## What's covered

| Test | Stack | Journey |
|---|---|---|
| `src/frontend/e2e/onboarding-happy-path.spec.ts` — *the full onboarding happy path* | Frontend, demo mode (auth endpoints mocked with `page.route`) | Landfall (place the longhouse) → Farm + Lumberjack via the real ring menu → completion hand-off → "Name your jarl" nudge → real register form → back in the game logged in → log out → returning-login gate → log back in |
| `src/frontend/e2e/onboarding-happy-path.spec.ts` — *onboarding happy path via "Later"* | Frontend, demo mode | Same founding + guided builds → "Later" on the nudge → the HUD still leads with "Name your jarl" (desktop: the top-right trigger and the first row of its panel; phone: the drawer's account section) → real register form → back in the game logged in |
| `src/backend/tests/Bjarnoy.AppHost.Tests/OnboardingHappyPathTests.cs` | Real Aspire stack (Postgres + API + Vite), Playwright | The same onboarding against a real backend — including what demo mode can't prove: the same realm comes back after logging back in |

Both frontend paths share their setup (`foundAndFinishGuidedBuilds` in the
spec): founding and the two guided buildings are clicked through the real
ring menu, never placed straight into the model.

## Screen sizes

Every frontend happy path runs at three sizes (`SCREEN_SIZES` in the spec):

| Size | Viewport | CI group |
|---|---|---|
| Desktop | 1280×800 | `@g2` |
| Medium phone | 390×844 (touch) | `@g1` |
| Small phone | 320×568 (touch) | `@g1` |

On a phone the in-game HUD collapses into a pull-down drawer
(`TopBar.vue` / `MobileHudDrawer.vue`): the nudge, the "Name your jarl" entry
and the account menu (Profile / Log out) all live in there. The spec's
`accountHud` helper hides that one difference; everything else is the same
click path. When adding a happy path, add it inside the `SCREEN_SIZES` loop
so it runs at every size.

CI groups are explained in [`docs/ci/e2e-sharding.md`](ci/e2e-sharding.md).

## Running them locally

```bash
cd src/frontend
npx vite build                          # the suite runs against `vite preview`
npx playwright test e2e/onboarding-happy-path.spec.ts
npx playwright test e2e/onboarding-happy-path.spec.ts -g "small phone"   # one size
```

The real-backend test runs with the rest of `Bjarnoy.AppHost.Tests`
(`.github/workflows/aspire-e2e.yml`); it needs Docker.

## Why they're slow

Each run takes about 1–3 minutes. The settlement map redraws its full-screen
water and fog layers every frame, and CI's runners have no GPU, so Chromium
renders in software: one 1280×800 frame costs ~300 ms (~3 fps). Every
Playwright click waits for a few frames to confirm its target is stable and
hit-testable, so a plain button click costs ~4 s on desktop. Phone viewports
have far fewer pixels (~80–100 ms per frame), which is why the phone runs are
roughly twice as fast. See `src/frontend/e2e/budgets.ts` for the measured
frame costs behind the timeouts.
