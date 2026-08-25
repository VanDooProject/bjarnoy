# Fjørdhold — frontend

Vue 3 + TypeScript + Vite frontend for the browsergame described in
`../../README.md` and `../../prototypes/MECHANICS.md`. This app is the
first playable merge of the three design brainstorms summarised in
`../../docs/design/zip-brainstorms.md`:

- **Zip 7 (world map):** hex world map, territory shown as coloured
  outlines, fleet tracks with ETAs, settlement markers.
- **Zip 4 (landing page):** the world map is already on screen and panning
  when the page loads; the first interaction is a real game move (clicking
  an island founds your starter settlement there and then); no registration
  wall — a nickname is asked for only after that move, and can be skipped.
- **Zip 9 (fog of war / settlement view):** the zoomed-in isometric village
  board, unexplored hexes are simply not drawn, scouted-but-currently-not-
  visible hexes are greyed out, buildings render as sprites on their hex,
  the realm border reads as a gold/rival outline+wash, and hovering a hex
  highlights it.

Both views share one axial hex lattice (`src/lib/hex/coords.ts`) and one
isometric projection (`src/lib/hex/geometry.ts`), rendered at different zoom
— exactly what the zip 7 world-map mockup means by "same hex lattice as the
settlement view, flattened."

## Tile art

Terrain and building tiles are the isometric hex plates from
[VanDooProject/bg_assets_hextile](https://github.com/VanDooProject/bg_assets_hextile),
the same asset pack described in `prototypes/village_view/README.md`,
pulled in as a git submodule at `vendor/bg_assets_hextile` (we only ever
reference its SE camera rotation — a handful of its ~300 files).
`src/lib/map/textures.ts` imports each PNG directly (Vite asset imports,
not a `public/` copy), so the production bundle only picks up the files we
actually reference rather than the whole ~15MB six-rotation pack.

Where the pack splits a tile into `base` (ground only) and `top`
(props/building only) — grass, forest, farm, and huts — `textures.ts` loads
both instead of the single composited image, and `HexMapRenderer` renders
them as two stacked sprites with the realm-border and hover-highlight
layers sandwiched in between. That's the pack's own intended use (its
README: "so realm borders, or mouse hover effects can be placed between
top-ing and base tile") — a border or hover highlight sits on the ground
and tucks under a tile's trees/building instead of being drawn as a flat
overlay that slices across their canopy. Terrain the pack doesn't split
(sand, mountain, sea) and the one building it doesn't split (tower)
fall back to their single composited image with no top layer.

Since the art lives in a submodule, clone with `git clone --recurse-submodules`
or run `git submodule update --init` after a plain clone — otherwise
`npm run dev`/`build` will fail to resolve the tile texture imports. CI
does this via `actions/checkout`'s `submodules: true`.

## Running it

```bash
npm ci # on first
# install changed packages (frozen lockfile)
npm ci --package-lock-only

# actual run
npm run dev      # http://localhost:5173

# build
npm run build    # type-checks (vue-tsc) then builds to dist/

# tests
npm run test:unit   # vitest — pure hex-geometry math, no browser
npm run test:e2e    # playwright — real browser flows, against the built app
```

`npm run test:e2e` builds nothing itself; it drives `npm run preview` (the
production build), so run `npm run build` first if `dist/` is stale.
Playwright needs its browser installed once: `npx playwright install
--with-deps chromium`.

`.github/workflows/frontend-ci.yml` has two jobs on every push/PR touching
`src/frontend/**` (there's no other CI in this repo yet): `build` runs unit
tests then typechecks/builds; `e2e` builds and runs the Playwright suite,
uploading the HTML report and traces if anything fails.

## Demo mode vs. the real backend

By default (`VITE_DEMO_MODE` unset, or `npm run dev`/`preview` with no flag)
the app runs in **demo mode**: `WorldModel` procedurally generates terrain on
demand from a hard-coded seed and everything (settlements, resources, fog of
war) lives in memory for the session. Refreshing the page starts a new game.
This is what the Playwright suite exercises, since it has no backend behind
it.

Set `VITE_DEMO_MODE=false` at build time to link the app to the real backend
(`src/backend`, see `docs/tech/backend.md`) instead: on load the landing page
joins a running world or creates one (`src/api/client.ts`), reseeds the local
`WorldModel` from that world's seed so the client renders the exact terrain
the server generated, and founding a settlement is a real
`POST /api/v1/worlds/{id}/settlements` call rather than a local mutation. Set
`VITE_API_BASE_URL` too if the API isn't reachable at `/api/v1` on the same
origin (it is by default in the single container `deploy/Dockerfile` builds).
`src/config.ts` holds both flags.

The settlement view's build queue is wired up too: clicking an empty owned
hex queues a real build order (`POST /api/v1/settlements/{id}/builds`) rather
than placing a building instantly, and the view polls
`GET /api/v1/settlements/{id}` every few seconds to pick up completions, rate
changes and longhouse-level border growth the player didn't cause locally
(`WorldModel.applyServerSnapshot`). Demo mode's `placeBuilding` (an instant,
free "hut") is unchanged and still what `npm run dev`/e2e see.

Not wired up yet: territory/settlements belonging to other players, fleets,
and the world map's abstraction of a live multi-settlement island — those
still come entirely from the local, single-player `WorldModel` simulation
even in live mode.

## Map performance

The previous prototype (`legacy/frontend/map`) was an Angular app that gave
every hex its own component backed by an SVG element, so panning across a
few hundred tiles meant a few hundred live DOM nodes plus Angular change
detection walking all of them on every `svg-pan-zoom` event. This rewrite
avoids that shape entirely:

- **One WebGL canvas, not one DOM node per hex.** `HexMapRenderer`
  (`src/lib/map/HexMapRenderer.ts`) draws every visible hex as a
  `PIXI.Sprite` sharing one of ~9 tile textures, plus a couple of `Graphics`
  layers for borders and fog. Pixi batches sprites that share a texture into
  very few WebGL draw calls, regardless of how many hexes are on screen.
- **Sprites are pooled, not recreated.** Panning doesn't destroy and
  reallocate tiles: a hex leaving the viewport returns its `Sprite` to a
  free list instead of being destroyed, and a hex entering the viewport
  reuses one from that list before allocating a new one.
- **The camera transform and the tile set update on different schedules.**
  Every frame just writes one container's `position`/`scale` from the
  camera (cheap), so panning/zooming feels immediate. Recomputing *which*
  hexes exist — walking the visible range and updating the sprite pool — is
  throttled via `requestAnimationFrame` and only actually runs once the
  camera has moved more than ~half a hex or zoom has changed noticeably
  (`cameraMovedEnough`).
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
src/lib/hex/          axial hex coordinate math + isometric pixel geometry
src/lib/map/           WorldModel (game state), archipelago terrain
                        generator, camera, textures (tile art manifest),
                        HexMapRenderer (the PixiJS renderer)
vendor/bg_assets_hextile/  tile art (git submodule, see above)
src/composables/       useHexMapRenderer — mounts/resizes/tears down a
                        renderer on a <canvas> from a Vue component
src/stores/             Pinia stores: player (identity/onboarding), world
                        (WorldModel handle + small reactive HUD summary)
src/components/map/     WorldMapCanvas.vue, SettlementCanvas.vue
src/components/hud/     TopBar, ResourceBar, RealmPanel
src/components/onboarding/  NicknamePrompt (shown only after landfall)
src/views/              LandingView (world map), SettlementView (village)
src/lib/hex/*.test.ts   Vitest unit tests (hex geometry math)
e2e/                    Playwright end-to-end tests (real browser flows)
```
