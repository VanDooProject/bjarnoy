# Screenshot helpers

Playwright scripts for grabbing local-dev screenshots of the Fjørdhold frontend
without re-deriving the onboarding flow every time.

## Setup

1. Start the dev server: `cd src/frontend && npx vite --port 5183`
2. Make sure `src/frontend/vendor/bg_assets_hextile` is populated (it's a
   gitignored submodule checkout — clone
   `VanDooProject/bg_assets_hextile` and copy `hextiles/` + `README.md` in,
   if missing).
3. `node scripts/screenshot-helpers/flow.mjs [outDir]`

## Flow this script drives

Demo mode has no login: landing (`/`) → "Enter the world" → world map (`/world`)
→ click any green island hex → landfall modal ("Skip for now") → settlement
view (`/settlement`). There is no nickname input on the landing page itself —
naming happens in the post-landfall modal.

`flow.mjs` walks this whole path in one run (it's cheaper than restarting the
browser per screen) and drops a screenshot at each stop: `landing`,
`world_map`, `landfall`, `settlement`, `settlement_panned` (camera dragged
outward — checks fog continuity/gradient past the default view),
`settlement_hover` (checks the hex tooltip), `settlement_tower_border`
(places a border-anchoring tower via the demo-mode debug hook — checks the
border/fog silhouette against a non-hex shape, not just every settlement's
default hexagon), and `settlement_fog_debug` (opens `?debug=1`'s
`FogDebugPanel`). Pass stop names as extra args to take only some of them,
e.g.:

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
