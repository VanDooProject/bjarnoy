# Zoom-driven world↔settlement transition — design notes (pre-implementation)

Captures the plan, the facts it rests on, and the open decisions for making
the mouse-wheel/pinch zoom gesture switch between world map and settlement
view — continuously, with a debug-tunable threshold, plus a locked
fit-to-screen preview on the landing page. No code has landed yet; this is
the source doc for the tracking issue.

## 1. What exists today

- World map and settlement view are two Vue routes (`/world`, `/settlement`,
  `router/index.ts:27-35`), each mounting its own `HexMapCanvas`
  (`WorldMapCanvas.vue`, `SettlementCanvas.vue`), each constructing a fresh
  `HexMapRenderer` with `mode` fixed at construction
  (`useHexMapRenderer.ts`).
- World→settlement is a hex **click** that ignores the clicked coordinate
  and always pushes to *your own* settlement
  (`WorldMapView.vue:63-65`). Settlement→world is a nav **button**
  (`HudNav.vue:57-59`). Nothing today reacts to zoom level.
- Mouse-wheel zoom exists (`HexMapRenderer.ts:1639-1660`, `onWheel`),
  clamped to `[0.05, 4]`. No transition logic, no touch/pinch support at
  all (single `lastPointer`, no `pointerId` tracking). `touch-action: none`
  is already set on both canvases, which suppresses the browser's native
  pinch — **mobile users currently cannot zoom the map at all**.
- Both modes already share **one coordinate space** — same `TILE_W`/`TILE_H`,
  same axial hex grid, same `camera.{x,y,zoom}` frame.
  `settlementCameraOrigin()` (`:1005-1018`) just points the camera at the
  settlement's own world hex `q,r`, applies `screenBiasX`, and picks a zoom
  via `zoomForFogMargin()` (`:1030-1045`) clamped to
  `[FOG_MARGIN_MIN_ZOOM = 0.22, SETTLEMENT_DEFAULT_ZOOM = 0.85]`. Note
  `WORLD_DEFAULT_ZOOM` is **also 0.22** — the two modes' resting zooms
  overlap, which rules out a naive single-threshold, level-triggered design
  (see §3).
- Fog-of-war is **world-scoped, not mode-scoped**: the mask bitmap lives in
  the Pinia store and survives navigation; what gets destroyed per route is
  only the `FogMaskLayer` meshes/texture (`destroy()` at `:3070-3082`). So
  fog doesn't reset today, it **flashes** — a fresh renderer starts on the
  shader's unknown placeholder and only recovers once the watcher re-pushes
  the bitmap and `FogMaskLayer.setMaskTexture`'s cross-fade runs. Keeping
  one renderer alive across the transition removes that flash for free.
- `updateOptions()` (`:3043-3057`) is an existing "no remount" patch path,
  used today only for the landing page's founding transition
  (settlement→settlement). It **always** snaps or animates the camera to
  `settlementCameraOrigin()` whenever the merged options are
  `mode === 'settlement'` — so it cannot be reused as-is for a mode switch
  that must leave the camera untouched (requirement: continuous zoom, no
  snap).
- The landing page (`LandingView.vue`) mounts a settlement-mode canvas with
  no `settlementId`, at a **fixed** `PREVIEW_ZOOM = 0.6` /
  `PREVIEW_ISLAND_RADIUS = 7` (`:548-549`) — not a fit-to-screen
  computation. Drag and wheel are fully live there today; nothing locks
  them. The only existing "disable interaction" flag,
  `interactionLocked` (`:978`), also blocks clicks, so it can't be reused
  for "static but still clickable."

## 2. Requirements

1. Zooming in on the world map transitions into settlement view; zooming
   out of settlement view transitions back — continuously (no camera
   snap/teardown), with fog persisting uninterrupted through the switch.
2. A debug-panel control to tune the zoom threshold(s) at runtime.
3. The landing page's island preview locks camera (no drag, no zoom) and
   always fits the whole island on screen regardless of viewport size,
   while remaining click/tap-able (founding still works).
4. **Out of scope for this pass:** mobile pinch-to-zoom driving the same
   transition. The anchor-preserving zoom math gets extracted out of
   `onWheel` now (so pinch has a single seam to hook into later), but no
   multi-touch/pointer-id tracking is built. Left as a `TODO` comment at
   the extraction site. Worth flagging explicitly: until pinch lands,
   mobile has no way to zoom the map at all (see §1) — this is the
   motivating case for the follow-up, not just a nice-to-have.

## 3. Key design decisions

**Edge-triggered, not level-triggered.** Because the two modes' resting
zooms overlap (both can sit at 0.22), evaluating "is zoom above/below X"
on every frame is unsound — a settlement opened via the nav button at 0.22
would immediately re-trigger an exit. Instead, `transitionForZoom(mode,
prevZoom, nextZoom, tuning)` fires only when a single zoom step **crosses**
a threshold. This gives hysteresis for free (a switch can only be caused
by a crossing) and means externally-driven camera placement (nav button,
back/forward) never spuriously re-triggers a gesture-driven switch. Two
independent thresholds either way — `enterSettlementZoom` (zoom-in) and
`exitToWorldZoom` (zoom-out) — both debug-tunable.

**Gesture-driven vs. externally-driven camera moves stay separate.**
Wheel/pinch-driven crossings flip `mode` only — they never touch
`camera.{x,y,zoom}`, which is what makes the transition continuous.
Externally-driven mode changes (nav button, browser back/forward) animate
the camera to that mode's canonical framing via the existing
`animateCameraTo()`. `router.push` is guarded against re-navigating to the
already-active route to avoid ping-pong near a threshold.

**Which settlement does zooming in enter?** Recommended: treat the switch
as pure level-of-detail — `mode` only decides "flat coloured hexes vs. tile
art," and does not change `settlementId` or move the camera at all. This
keeps continuity trivial (nothing about the camera changes) and works
anywhere on the map, not just over a settlement's claim radius. The
alternative (only transition within a settlement's claim radius, clamp
zoom elsewhere) is more conceptually faithful to "entering a settlement"
but substantially more logic, and still has to answer what happens when
you zoom in over open ocean. **Needs a decision before implementation
starts.**

**Persistence.** Threshold tuning persists to `sessionStorage`, following
the precedent set by `useFogDebug`/`DebugPanel`'s collapsed-state storage
(explicitly "tab-scoped, throwaway, not a setting worth remembering") —
justified here because a bad debug value causes real navigations, so
losing it on an accidental reload mid-session is worse than for a pure
visual toggle. This deviates from `fogDebugTuning`/`waterDebugTuning`,
which persist nothing; the storage read/write lives in the debug panel
component, not in the pure `zoomTransition.ts` module (kept DOM-free so it
stays unit-testable under Vitest's Node environment).

**Renderer persistence.** A one-instance-per-route renderer cannot give a
continuous transition — the whole point is that nothing gets torn down. A
persistent host is required; see §4 for the render-internals work that
unlocks, and the open question in §5 for how the two Vue routes attach to
it.

## 4. Renderer-internals work required for a mode switch to be safe

None of this exists today; a naive `updateOptions({mode})` flip would
render a blank canvas or leave stale content on screen:

- **Atlas loading.** `mount()` only loads the terrain atlas, building
  atlases, and marker icons when `mode === 'settlement'` at construction
  (`:1117-1145`); `rebuildAll()` early-returns while `mode === 'settlement'
  && !this.textures`. Needs to load all three non-blockingly regardless of
  starting mode, and the mode-switch itself must gate on `textures !==
  null` (stay put until the atlas resolves, rather than blank-flash).
- **`WaterLayer` mode.** Only three uniforms are genuinely baked at
  construction (`uFoamInner`, `uFoamLandReach`, `uFoamAlpha`,
  `WaterLayer.ts:333-336`) — the rest already recompute per frame. A
  `setMode()` that drops the field's `readonly` and rewrites those three,
  plus invalidating `waterMaskRegionBuilt`, is the whole fix.
- **Layer order.** `worldLayerOrder(mode)` fixes child order once at mount
  (`:819-824`, applied at `:1163`). On switch, re-insert **all** of it in
  order (`addChild` alone re-parents to the end, it doesn't reorder), not
  just the water mesh.
- **Stale-content cleanup**, both directions:
  - settlement→world: `terrainBase`/`terrainTop` tile-art sprites are
    never released by `rebuildTerrainFlat`, so they'd sit under the flat
    fills.
  - world→settlement: `terrainFlat` (a `Graphics`) is cleared only inside
    `rebuildTerrainFlat`, which never runs in settlement mode, so its
    flat-fill polygons would persist under the tile art.
  - `waveLayer` is cleared only inside `drawWaves`, gated to world mode —
    needs an explicit clear on switching away, or old wave squiggles freeze
    on screen.
  - Army-vision holes punched into the fog shader (`setArmyVisionSources`,
    settlement-only) need clearing when leaving settlement mode, or they
    persist forever.
- **`idleDrift`** (world-only ambient camera drift) needs to turn off on
  switch to settlement, and the switch itself should be its own method
  (e.g. `setMode()`) rather than routed through `updateOptions()`, so it's
  provable by inspection that the camera is untouched.
- **A public zoom accessor.** Nothing currently exposes `camera.zoom`
  outside the class; the debug panel's live-zoom readout and any e2e
  assertion on camera continuity need one.

## 5. Open question: how does one renderer serve two routes?

Vue Router does **not** reuse component instances across `/world` and
`/settlement` today — they're two different components. Options, roughly
in order of preference:

1. **Merge into one view component** mounted at both routes (mode read
   from the route, HUD panels conditional on it). Router reuses the
   instance naturally, cleanest end state, but touches a large amount of
   `SettlementView.vue`.
2. **Hoist the canvas above `<router-view>`** in `App.vue`, gated on
   "is this a map route." Smaller routing diff, but splits the canvas and
   its HUD across different subtrees, and the landing page's own
   settlement-mode preview renderer becomes a second instance unless it's
   folded in too.
3. **Module-scoped shared renderer + re-parent the existing `<canvas>`
   DOM node** between view containers on navigation (Pixi's WebGL context
   survives a DOM re-parent). Lowest structural churn, trickiest lifecycle.

Whichever is chosen, these need explicit handling (currently per-view, one
lifecycle each, and easy to regress):

- Teardown when leaving the map routes entirely — the renderer holds
  window-level pointer listeners and an unconditional ticker loop; letting
  it survive onto an unrelated route burns GPU/CPU and leaks listeners.
- `data-map-ready` (used by e2e helpers to know the canvas is up) and
  `window.__settlementRenderer` (used by e2e click helpers) need a clear
  owner and lifetime.
- Swapping the click/hover callbacks that differ by mode (world's
  `onHexClick` navigates; settlement's opens the ring menu) — a mode
  switch must swap these, or the new mode misinterprets clicks.
- Reconciling `startHudSync`/`stopHudSync`, currently started/stopped
  independently by each view.

## 6. Landing-page lock + fit-to-screen

- New `lockCamera` option, checked in the **pan branch of
  `onPointerMove`** and in the (to-be-extracted) `zoomBy()` helper — not by
  skipping `startDrag`, since `onPointerUp`'s click handling depends on
  `dragging` having been set; skipping drag start would silently break
  founding.
- A pure, exported `previewFitZoom(...)` (unit-testable without Pixi,
  matching how `worldLayerOrder` was extracted "purely so it can be
  asserted on without a canvas") replacing the fixed `PREVIEW_ZOOM`
  constant — must account for `screenBiasX: 0.16` (usable half-width is
  `(0.5 - |bias|) * viewportWidth`, not half the viewport) and should fit
  to the actual non-sea hexes drawn within the preview radius, not the
  full radius ring, or a small island over-zooms-out.
- `resize()` currently only re-projects the existing camera; under
  `lockCamera` it must re-run the fit so rotating/resizing keeps the whole
  island framed.
- Wheel's `preventDefault()` runs before any lock check — deliberately
  keep swallowing wheel input on the locked landing page (no scrollable
  content there today), documented so it isn't silently wrong if the page
  later grows one.

## 7. Testing

- Unit: `transitionForZoom` (both-direction crossings, no-op when
  disabled, no flapping near a threshold), `previewFitZoom` (with/without
  bias, portrait vs. landscape), `WaterLayer.setMode` uniform rewrite.
- E2E: rewrite `e2e/world-map-interactions.spec.ts`'s existing wheel-zoom
  test (currently ~2.68× zoom over 8 wheel steps from `WORLD_DEFAULT_ZOOM`
  — crosses most plausible thresholds) into the positive test for this
  feature rather than leaving it to accidentally collide; add camera
  continuity (zoom/position read via a renderer accessor before/after, not
  a pixel diff), fog-no-flash, back-button (no ping-pong), and a
  renderer-leak guard (single `<canvas>` after world→settlement→world→
  elsewhere→back) per the persistent-host risk in §5; add a landing-page
  spec asserting drag/wheel are inert but click-to-found still works.
- Per `CLAUDE.md`: never gate the transition on "is this a test
  environment" to make the existing wheel spec pass — fix the spec on its
  merits.
- Manual/visual: `scripts/screenshot-helpers/flow.mjs`, plus a debug-panel
  screenshot with `?debug=1`.

## 8. Suggested commit sequence

1. `refactor(map): extract anchor-preserving zoom out of onWheel` — no
   behaviour change; leaves the seam pinch will use later.
2. `feat(map): lockCamera option + fit-to-island preview zoom`
3. `feat(map): zoomTransition module (pure, edge-triggered, untuned)`
4. `feat(hud): zoom-transition debug panel`
5. `feat(map): WaterLayer.setMode`
6. `feat(map): renderer mode switch (atlas/layer-order/stale-content
   cleanup)`
7. `refactor(views): persistent map host` (§5 decision)
8. `feat(map): wire zoom crossings to the mode switch`
9. `test(e2e): zoom transition, fog continuity, leak guard`
10. This doc, kept up to date with whichever §5/§3 open decisions get made.

## 9. Implementation status — shipped

All 9 steps above landed on `claude/zoom-settlement-worldmap-threshold-mhr2ic`.
The two open decisions were resolved as:

- §3 settlement targeting: **LOD-only**, as recommended — zooming in never
  changes `settlementId` or moves the camera; it only flips which content
  renders (tile art vs. flat hexes) at whatever spot the world map was
  already centred on.
- §5 persistent host: **option (a)**, a single merged `MapView.vue` mounted
  at both `/world` and `/settlement` (`WorldMapView.vue`/`SettlementView.vue`
  retired; `WorldMapCanvas.vue` kept standalone for `AdminWorldReseedView`'s
  own unrelated world-preview renderer).

Verified against a real production build (`vite build` + `vite preview`)
with the vendored tile-art submodule populated, not just unit-tested: a full
wheel-zoom gesture genuinely crosses the enter/exit thresholds, switches
mode with the camera continuing past where it started (no snap), and the
debug panel's live tuning reaches the renderer — see
`e2e/zoom-transition.spec.ts`. Mobile pinch-to-zoom (§2) remains the noted
follow-up; the anchor-preserving zoom math already lives at
`HexMapRenderer.ts`'s `zoomBy()` as the seam for it.

One additional fix surfaced along the way: `e2e/helpers.ts`'s `gotoWorldMap`
used to `page.goto('/world')`, a hard reload that silently lost demo mode's
in-memory `hasFoundedSettlement` and redirected to the landing page — every
existing world-map e2e spec had been unknowingly exercising the landing
page's preview canvas instead of the real world map. Fixed to navigate via
a real HudNav click instead.

### 9.1 Post-review follow-up

Playtesting the shipped defaults surfaced three more fixes:

- **Hysteresis band was too wide.** `DEFAULT_ENTER_SETTLEMENT_ZOOM`/
  `DEFAULT_EXIT_TO_WORLD_ZOOM` shipped at 0.8/0.3 — a 0.5 gap, meaning a
  near-full zoom sweep across the settlement range in either direction
  before the mode actually flipped. Narrowed to 0.5/0.4 (a 0.1 gap): still
  clear of `WORLD_DEFAULT_ZOOM`/`FOG_MARGIN_MIN_ZOOM` (0.22) and
  `SETTLEMENT_DEFAULT_ZOOM` (0.85) on their respective sides (§3's edge-
  triggering reasoning still holds), but the transition now fires after a
  short, natural zoom gesture rather than a deliberate one.
- **The mode swap was a hard cut.** `setMode()` rebuilds `this.world`'s
  children synchronously — terrain/water/building layers popping straight
  from one mode's geometry to the other's read as a jarring snap even
  though the camera itself never moved. `zoomBy()` now drops `this.world`'s
  alpha to 0 right before calling `setMode()`, and `onTick` eases it back
  to 1 over `zoomTransitionTuning.fadeMs` (default 260ms, tunable in the
  debug panel, 0 disables it) — a time-constant-based ease so the fade
  takes the same wall-clock duration regardless of frame rate. Fog
  (`blackFogLayer`/`whiteMistLayer`) and the marker/settlement-name-badge
  layer are stage siblings of `this.world`, not children (see mount()'s own
  layering comment), so they're untouched by this — fog keeps rendering
  continuously through the fade, per §1's original requirement.
- **TopBar's title duplicated the in-scene settlement badge.** Settlement
  mode already floats the settlement's own name over the longhouse hex
  (`HexMapRenderer.rebuildSettlementLabels`); `TopBar.vue`'s settlement-name
  + island-name caption showed the same information a second time once
  zoomed all the way in. `TopBar` now takes a `hideTitle` prop, and
  `MapView.vue` passes `mode === 'settlement'` — the title stays visible in
  world mode (no in-scene badge there) and disappears once past the
  transition into settlement mode.
