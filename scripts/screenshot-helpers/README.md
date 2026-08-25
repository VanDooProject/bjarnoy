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

Any stop that mutates state off the render loop (e.g. `settlement_tower_border`,
`settlement_fog_debug`) needs `forceRebuild(page)` from `util.mjs` afterward
to actually see the change — see
[`docs/tech/screenshot-helpers-rebuild.md`](../../docs/tech/screenshot-helpers-rebuild.md)
for why.
