# Screenshot helpers

Playwright scripts for grabbing local-dev screenshots of the Fjørdhold frontend
without re-deriving the onboarding flow every time.

## Setup

1. Start the dev server: `cd src/frontend && npx vite --port 5183`
2. Make sure `src/frontend/vendor/bg_assets_hextile` is populated (it's a
   gitignored submodule checkout — clone `VanDooProject/bg_assets_hextile`
   and copy `hextiles/`, `atlas/`, and `README.md` in, if missing —
   `atlas/` is what `textures.ts`'s `loadAtlasCategory` actually loads;
   `hextiles/` is only for `buildingArt.ts`'s legacy per-tile PNGs).
3. `node scripts/screenshot-helpers/flow.mjs [outDir]`

## Flow this script drives

Demo mode has no login and no separate world-map click-through before
founding (zip 6a): landing (`/`) already *is* the village-view preview —
clicking anywhere on it founds a settlement at the nearest good landfall
(the same deterministic starter plot `flow.mjs`/`e2e/helpers.ts` both use),
then the view flips into the settlement view in place, no remount and no
nickname modal blocking it (design handoff "2a").

`flow.mjs` walks this whole path in one run (it's cheaper than restarting the
browser per screen) and drops a screenshot at each stop: `landing`,
`landfall` (right after founding, still in preview framing), `settlement`
(after switching to the Settlement tab), `settlement_panned` (camera dragged
outward — checks fog continuity/gradient past the default view),
`settlement_hover` (checks the hex tooltip), `settlement_tower_border`
(places a border-anchoring tower via the demo-mode debug hook — checks the
border/fog silhouette against a non-hex shape, not just every settlement's
default hexagon), `settlement_giant` (pans to the giant mountain demo mode
auto-places a few hexes from the home hex — see
`src/frontend/src/lib/map/giantTiles.ts` — and shoots it with its
surrounding tiles in frame, so occlusion against neighbouring forest/
building art is checkable), `settlement_giant_orientations` (one screenshot
per camera rotation the giant can render in:
`settlement_giant_orientations_<CAM>.png` for each of `E`/`NE`/`NW`/`W`/
`SW`/`SE`), and `settlement_fog_debug` (opens `?debug=1`'s `FogDebugPanel`).
Pass stop names as extra args to take only some of them, e.g.:

```
node scripts/screenshot-helpers/flow.mjs /tmp/out '' settlement settlement_panned
```

## Forcing a rebuild after a debug-mode mutation

`HexMapRenderer` only rebuilds its terrain/fog/border layers on a real
camera displacement past its own threshold (see `cameraMovedEnough` in
`HexMapRenderer.ts`) — nothing else triggers it. If a script mutates state
off the render loop (e.g. `window.__demoWorld().model.placeBuilding(...)` or
flipping a `window.__fogDebug` flag) and then screenshots, the change won't
show up unless something forces a rebuild afterward. A too-small "nudge"
drag can silently cross that threshold on neither leg and produce a
screenshot indistinguishable from before the mutation, while still
reporting success — this happened in practice and produced a screenshot
that was reported as showing a tower's border extension when it didn't.

Use `forceRebuild(page)` from `util.mjs` (a real, large enough drag out and
back) after any such mutation, as `settlement_tower_border` above does.
