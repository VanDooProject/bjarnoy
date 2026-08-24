# Fjørdhold — frontend

Vue 3 + TypeScript + Vite frontend for the browsergame described in
`../../README.md` and `../../prototypes/MECHANICS.md`. This app is the
first playable merge of the three design brainstorms summarised in
`../../docs/design/zip-brainstorms.md`:

- **Zip 7 (world map):** hex world map, no tile art yet, territory shown as
  coloured outlines, fleet tracks with ETAs, settlement markers.
- **Zip 4 (landing page):** the world map is already on screen and panning
  when the page loads; the first interaction is a real game move (clicking
  an island founds your starter settlement there and then); no registration
  wall — a nickname is asked for only after that move, and can be skipped.
- **Zip 9 (fog of war / settlement view):** the zoomed-in isometric village
  board, unexplored hexes are simply not drawn, scouted-but-currently-not-
  visible hexes are greyed out, buildings render as sprites on their hex,
  and the realm border reads as a gold/rival outline+wash.

Both views share one axial hex lattice (`src/lib/hex/coords.ts`) at
different zoom and projection — flat 2D for the world map, isometric plates
for the settlement — exactly as `prototypes/village_view/README.md`
describes.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-checks (vue-tsc) then builds to dist/
```

There is no backend yet: `WorldModel` procedurally generates terrain on
demand from a seed and everything (settlements, resources, fog of war) lives
in memory for the session. Refreshing the page starts a new game.

## Map performance

The previous prototype (`legacy/frontend/map`) was an Angular app that gave
every hex its own component backed by an SVG element, so panning across a
few hundred tiles meant a few hundred live DOM nodes plus Angular change
detection walking all of them on every `svg-pan-zoom` event. This rewrite
avoids that shape entirely:

- **One WebGL canvas, not one DOM node per hex.** `HexMapRenderer`
  (`src/lib/map/HexMapRenderer.ts`) draws the whole visible map into a
  handful of `PIXI.Graphics` layers (terrain, borders, fog, markers).
  PixiJS batches all the shapes in a layer into very few WebGL draw calls,
  regardless of how many hexes are on screen.
- **Redraw only when the visible set actually changes.** Panning/zooming
  updates a plain camera object; a rebuild is scheduled via
  `requestAnimationFrame` and only actually rebuilds the layers once the
  camera has moved more than ~half a hex or zoom has changed noticeably
  (`cameraMovedEnough`). The render loop itself (`app.ticker`) only advances
  resource ticks and fleet-ETA labels every frame — geometry stays untouched
  most frames.
- **Viewport culling via closed-form pixel↔hex conversion.** No spatial
  index is needed: the visible axial range is computed directly from the
  camera and canvas size (`visibleCoords`), so only the hexes actually on
  screen (+1 hex margin) are ever generated or drawn.
- **On-demand, cached generation instead of a stored world.** `WorldModel`
  generates a tile's terrain the first time it's requested and caches it in
  a `Map`, so memory is bounded by hexes actually visited rather than by
  total world size — there's no upfront "load the map" step to scale badly.
- **Vue reactivity stays off the hot path.** `HexMapRenderer` and
  `WorldModel` are plain classes, not reactive — `WorldModel` is stored via
  `markRaw()` in the Pinia store (`src/stores/world.ts`) specifically so Vue
  never wraps its tile `Map` in a reactive proxy. Vue components only ever
  read a small, explicitly-copied HUD summary that's refreshed once a
  second, never the raw per-tile data.
- **Pointer/wheel handling is direct, not per-hex.** There's a single
  pointerdown/move/up/wheel listener on the canvas; a click is resolved to a
  hex via the inverse pixel→hex transform, not via one interactive display
  object and event listener per tile.

## Layout

```
src/lib/hex/          axial hex coordinate math + pixel/iso geometry
src/lib/map/           WorldModel (game state), terrain generator, camera,
                        HexMapRenderer (the PixiJS renderer)
src/composables/       useHexMapRenderer — mounts/resizes/tears down a
                        renderer on a <canvas> from a Vue component
src/stores/             Pinia stores: player (identity/onboarding), world
                        (WorldModel handle + small reactive HUD summary)
src/components/map/     WorldMapCanvas.vue, SettlementCanvas.vue
src/components/hud/     TopBar, ResourceBar, RealmPanel
src/components/onboarding/  NicknamePrompt (shown only after landfall)
src/views/              LandingView (world map), SettlementView (village)
```
