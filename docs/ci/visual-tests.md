# Visual regression tests

`src/frontend/e2e/visual/*.visual.spec.ts` compare screens of the frontend pixel for pixel against committed
baselines, and write a palette report per screen. They exist to catch unintended changes while the hard-coded colours
are folded into the tokens in `src/frontend/src/style.css`, and stay afterwards.

## What runs where

- Two Playwright projects: `visual-desktop` (Desktop Chrome, 1280×800) and `visual-phone` (Pixel 7 layout at
  `deviceScaleFactor: 1`).
- Both exist only inside the pinned image `mcr.microsoft.com/playwright:v<version>-noble`
  (`e2e/visual/image.json`; `src/test/visualImagePin.test.ts` keeps it equal to the installed `@playwright/test`).
  Fonts and rasterising differ on any other machine, so a plain `npx playwright test` lists only the e2e suite, and
  `--project=visual-*` outside the image throws.
- CI: `.github/workflows/visual.yml`, its own workflow so the e2e shards keep their duration. One job per project
  inside the image, roughly 3 min of tests each plus image pull and build. The report and `test-results/` are
  uploaded as `visual-desktop` / `visual-phone` on every run.

## Comparison

- Exact: `threshold: 0`, `maxDiffPixels: 0`, `animations: 'disabled'`, caret hidden.
- The Pixi map canvas (`.map-container > canvas`) is hidden by `e2e/visual/screenshot.css`; the map has its own
  pixel specs. Chart.js canvases stay visible.
- The clock is pinned (`page.clock.setFixedTime`, not `install`, which would stop `requestAnimationFrame`). Settlement
  screens pin it after founding: a frozen `Date` during founding breaks the HUD's Settlement navigation.
- Water and fog are off (`mapLayers`), HUD motion off. `e2eWaterOptOut.test.ts` allows this for `e2e/visual/` because
  the canvas is never in the shot, and checks every visual spec goes through `expectScreen`.

## Running and updating baselines

From `src/frontend`, with Docker running:

```bash
npm run test:visual                 # build + compare, both projects
npm run test:visual -- -g leaderboard
npm run test:visual:update          # rewrite the baselines that changed
```

`scripts/visual.sh` runs `vite build` and Playwright inside the image with the repo mounted. There is no CI job that
writes baselines.

## Reviewing a baseline change

1. A PR that changes how something looks runs `npm run test:visual:update` and commits the changed PNGs under
   `e2e/visual/__screenshots__/{visual-desktop,visual-phone}/` in the same PR.
2. The reviewer looks at each changed PNG in GitHub's image diff (swipe/onion skin) and checks the change is the
   intended one and nothing else moved.
3. A refactor that should not change pixels (e.g. replacing a hex value by its token) changes no PNG; a red visual job
   then shows the diff in the uploaded report (`expected`/`actual`/`diff` images per failing screen).

## Palette audit

`expectScreen` also collects every computed colour on the screen (text, backgrounds, borders, outlines, SVG fill and
stroke, shadow and gradient colours) and matches it by RGB, alpha ignored, against the `:root` tokens in `style.css`
(`e2e/visual/palette.ts`). The result is `test-results/<test>/palette-<screen>.json`: each colour with its token or
`null`, use count and up to five sample selectors. It is report-only and never fails a test; it becomes a failing
check once the colour consolidation is done.

## Adding a screen

Use the page objects in `e2e/pages/` for the flow, wait for a final state (no running finite animations, pointer
parked, art loaded), then `expectScreen(page, '<name>')`. Mock data uses fixed dates around the pinned clock
(2026-06-01T12:00Z). Prove it is stable with `npm run test:visual -- -g <name> --repeat-each 5` before committing
its baselines.
