# Forcing a rebuild after a debug-mode mutation

`HexMapRenderer` only rebuilds its terrain/fog/border layers on a real
camera displacement past its own threshold (see `cameraMovedEnough` in
`src/frontend/src/lib/map/HexMapRenderer.ts`) — nothing else triggers it. If
a script mutates state off the render loop (e.g.
`window.__demoWorld().model.placeBuilding(...)` or flipping a
`window.__fogDebug` flag) and then screenshots, the change won't show up
unless something forces a rebuild afterward. A too-small "nudge" drag can
silently cross that threshold on neither leg and produce a screenshot
indistinguishable from before the mutation, while still reporting success —
this happened in practice and produced a screenshot that was reported as
showing a tower's border extension when it didn't.

Use `forceRebuild(page)` from `scripts/screenshot-helpers/util.mjs` (a real,
large enough drag out and back) after any such mutation, as
`scripts/screenshot-helpers/flow.mjs`'s `settlement_tower_border` stop does.
