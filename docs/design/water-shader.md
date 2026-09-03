# Water shader — mid-water waves and shoreline foam (pre-implementation)

Design notes for a real water shader on both the world map and the settlement
view. Written before any code lands, in the same spirit as
[`map-fog-v2.md`](./map-fog-v2.md) — decisions and their reasons, so the
implementation has something to be checked against and later readers can see
why the layer stack ended up the shape it did.

Fog v2 is the direct precedent for everything mechanical here: it is the only
custom-shader code in the codebase today (`lib/map/fog/fogShader.ts`,
`lib/map/fog/FogMaskLayer.ts`), and this feature deliberately copies its
shape — a Pixi v8 `Mesh` with a `GlProgram`, a CPU-baked data texture, a
world→UV affine, and a debug panel of real functional toggles.

---

## 0. Scope

Two effects, each independently toggleable:

- **Mid-water waves** — animated crests on open water, away from the coast.
- **Shoreline foam** — an animated foam band where water meets land.

Both must work in **settlement** mode and **world** mode, and both must sit at
the right place in each view's layer stack. Layering is the hard part of this
feature, not the GLSL; §3 is the section to read first.

Decisions taken up front (asked and answered before writing this):

| Question | Decision |
| --- | --- |
| Where do the toggles live? | The `?debug=1` panel, same pattern as `FogDebugPanel`/`fogDebugFlags`. No player-facing settings menu exists today and this feature is not the place to invent one. |
| World map sea | The shader draws **both** the sea body and the mid-water waves. The existing Graphics wave squiggles are **kept**, behind their own flag, so the new look can be A/B'd against the prototype rather than deleted sight-unseen. |
| Settlement sea | The shader draws **over** the hand-painted water tile art (`watertile_*`, `coastalwatertile_*`), it does not replace it. |

Explicitly **out of scope**: any backend work (the mask is baked client-side,
see §2.3), rivers (they are land hexes with their own art — see §6), and a
player-facing graphics-settings UI.

---

## 1. What exists today

### 1.1 World map — there is no water in the canvas at all

This is the single most surprising fact about the current renderer and it
drives most of §3.

- The sea is a **CSS `radial-gradient` on the container `<div>`**, *behind* the
  canvas — `components/map/WorldMapCanvas.vue`'s `.map-container` background
  (`#2a92ae` → `#14657f` → `#0b3c50`).
- Islands are flat coloured hex polygons drawn into one `Graphics`
  (`HexMapRenderer.rebuildTerrainFlat`, `WORLD_TERRAIN_FILL`). Open sea is
  skipped outright: `if (tile.terrain === 'sea') continue;`
  (`HexMapRenderer.ts:1867`) — "open sea is just the background".
- Waves are **Graphics squiggles**: `waveLayer`, placed by `rebuildWaves` and
  re-stroked every frame by `drawWaves` (`HexMapRenderer.ts:1900`, `:1955`).
  They are a port of the zip 7 prototype's `sea()` method
  (`prototypes/worldmap/Viking Realm.dc.html`, the look in
  `docs/design/img/worldmap.png`) — short scattered arcs that swell in place
  rather than drift, scaled up by `WAVE_SCALE = 168/40 = 4.2` from the
  prototype's own hex size. They are culled off hexes near land
  (`isNearLand`, `HexMapRenderer.ts:1893`) and past the fog cutoff
  (`fogDebugFlags.waveCull`).

So on the world map the shader has an empty canvas to fill, and the only
thing it has to coexist with is the squiggle layer.

### 1.2 Settlement view — water is hand-painted tile art

- Sea hexes get real sprites from the tile pack: `watertile_*.png`, and
  `coastalwatertile_*.png` on the ring of sea that borders land
  (`textures.ts:224`, `:253`, `:413`). Coastal water is a *rendering variant*
  of `sea`, chosen by `worldGenerator.isCoastalWater` — sea with at least one
  land neighbour (`worldGenerator.ts:179`) — and oriented towards the land by
  `coastalOrientation`.
- So the settlement view already has an art-based shoreline. The shader adds
  motion on top of it; it must not fight it.
- The landing page's preview mode draws **no water at all**
  (`HexMapRenderer.ts:1794`, `if (... .terrain === 'sea') continue`), matching
  how world mode treats sea. The water layer must therefore be **off** in
  preview mode — see §3.5.

### 1.3 The layer stack today

Inside `world` (one camera-transformed container), in `addChild` order
(`HexMapRenderer.ts:1041`):

```
world
 ├─ terrainBase.container   sprites: ground art  (settlement only)
 ├─ waveLayer               Graphics squiggles   (world only)
 ├─ terrainFlat             Graphics island hexes (world only)
 ├─ borderLayer
 ├─ hoverLayer
 ├─ terrainTop.container    sprites: tall art    (settlement only)
 ├─ rangeLayer
 └─ highlightLayer
```

and on the stage (`HexMapRenderer.ts:1058`):

```
app.stage
 ├─ world
 ├─ blackFogLayer.mesh      screen-space quad
 ├─ markerLayer
 └─ whiteMistLayer.mesh     screen-space quad
```

### 1.4 The shader precedent

`FogMaskLayer` is a `Mesh<MeshGeometry, Shader>` whose geometry is four
**clip-space** corners (`fullscreenGeometry()`, `FogMaskLayer.ts:145`), with
`mesh.eventMode = 'none'`, a shared `GlProgram`, and a `UniformGroup` mutated
in place. Its fragment shader reconstructs world position from
`uCameraPos`/`uZoom`/`uViewport` and samples a CPU- or server-baked mask
through a world→mask-UV affine (`FogMaskPlacement`). `demoFogMask.ts` is the
worked example of baking such a texture entirely client-side from
`WorldModel`. Conventions worth inheriting verbatim: no `#version` pragma,
`in`/`out`/`texture()`, and an output named exactly `finalColor` (see
`fogShader.ts`'s header for why any other name fails to compile).

---

## 2. The water mask

Both effects are functions of one quantity: **how far is this pixel from
land**. Foam is a band at small distances; mid-water waves are suppressed at
small distances (today's `isNearLand` cull, but continuous). So the shader
needs a distance field, and that means a data texture.

### 2.1 What it encodes

An RGBA8 texture over a world-space rect:

| Channel | Meaning |
| --- | --- |
| **R** | Distance from the nearest land, outward into water, normalised over `FOAM_REACH_HEXES`. `0` at the coastline, `255` at or past the reach. |
| **G** | Distance from the nearest water, inward into land, normalised over `FOAM_BLEED_HEXES` (well under one hex). Lets foam lick a little onto the beach — see §3.4 for why that bleed is free. |
| **B** | Per-hex pseudo-random seed, exactly as fog v2's B channel does (`demoFogMask.ts`'s `noiseSeed`) — per-hex variation in wave phase and foam ruggedness so the coast isn't uniform. |
| **A** | Water coverage: `255` water, `0` land. Derivable from R at most texels, but a dedicated channel removes the ambiguity exactly at the boundary, and it is free. |

### 2.2 Layout — its own grid, not the fog mask's

The fog mask lives in the hex "doubled-row" texel lattice
(`fogMaskLayout.toTexel`), which mirrors a backend format. **The water mask
must not reuse it.** A euclidean distance transform needs uniformly spaced
samples, and a hex-anchored lattice would produce hexagonal contours — the
exact failure mode the fog shader spends its whole `edgeBand()` machinery
undoing. A ring of hexagonal foam around every island would be worse than no
foam.

So: a plain axis-aligned world-space rect at a fixed **texels per tile
width**. Start at `MASK_TEXELS_PER_TILE = 8` (with `TILE_W = 168`, one texel ≈
21 world units ≈ 1/8 hex), which resolves a foam band of half a hex into ~4
texels — enough, given the shader perturbs the band with noise anyway.

The mask is **viewport-anchored, not world-anchored**. Demo worlds are
boundless (`WorldModel` has no stored radius; `demoFogMask` picks an arbitrary
`DEMO_MASK_RADIUS = 60` for that reason), and a world-anchored mask would
either be enormous or too coarse. Instead: cover the current viewport rect
inflated by a generous margin, and only re-bake when the camera moves outside
the covered region — the same "cover more than you need, rebuild rarely"
trick the terrain cull already uses. Clamp the texture to
`MASK_MAX_TEXELS = 1024` on the long edge; at zoom levels where that binds,
a foam band is sub-pixel anyway.

### 2.3 Baking it — no backend work

Terrain is deterministic from the world seed on the client
(`worldGenerator.ts`; `WorldModel` is reseeded from `world.seed`), which is
the same argument `shoreline.ts` already makes for computing coastal-ness
client-side with no round trip. So:

1. For each texel, world position → hex (the inverse of `isoGridPosition`;
   the lattice is `colPitch = TILE_W * 0.75` by `TILE_H`, see
   `coordsInRect`, `HexMapRenderer.ts:1631`) → `WorldModel.isLand`. Write A
   and the B seed.
2. Run a **two-pass exact euclidean distance transform** (Felzenszwalb, or a
   3×3 chamfer if that proves good enough by eye) over the coverage bitmap,
   once outward for R and once inward for G. Linear in texels, and the whole
   mask is at most ~1M texels in the worst clamped case, typically far less.
3. Upload via `BufferImageSource`, the same way `demoFogMask` does.

Point 2 is what buys smooth, non-hexagonal contours out of a hex world, and
it is the reason the mask is not just "distance in hex rings".

---

## 3. Layering — the crux

### 3.1 The mesh lives inside `world`, not on the stage

Fog's two quads are clip-space stage children because fog genuinely belongs
on top of *everything*. Water does not: it has to be inserted **between**
existing `world` children — under the islands on the world map, and between
ground art and tall art in the settlement view. A clip-space stage child
cannot be put there without splitting `world` into two camera-synced
containers, which means two places to keep the camera transform in sync and a
new class of "which half is this layer in" bug.

Instead the water mesh is an ordinary **`world` child with world-space
geometry**: four vertices covering the current viewport rect in world
coordinates, recomputed whenever the camera changes. That is 8 floats per
camera change — free — and it buys three things:

- it can be inserted at any depth in the existing stack, with no split;
- the vertex shader hands the fragment shader a world position directly as a
  varying, so none of fog's `uCameraPos`/`uZoom`/`uViewport` inverse-projection
  math is needed;
- it is camera-transformed by Pixi like everything else, so it pans and zooms
  in lockstep with the terrain under it, with no risk of the water sliding
  relative to the coastline it is drawing foam on.

### 3.2 World mode — first child of `world`

```
world
 ├─ waterLayer.mesh   ← NEW: sea body + waves + foam
 ├─ terrainBase       (empty in world mode)
 ├─ waveLayer         Graphics squiggles, now behind a flag
 ├─ terrainFlat       island hexes — opaque, drawn over the water
 └─ ...
```

The sea body replaces what the CSS gradient was doing, and the island
polygons cover the shader wherever there is land. Keep the CSS gradient in
`WorldMapCanvas.vue` unchanged as the fallback for a lost WebGL context or a
switched-off `seaBody` flag; it should be tuned to match the shader's own deep
colour so flipping the flag is a small change, not a jarring one.

### 3.3 Settlement mode — and why `terrainBase` has to be split

The obvious insertion point is "above `terrainBase`, below `terrainTop`". It
is wrong, and the reason is worth writing down because it is easy to
rediscover the hard way:

**`terrainBase` is not all flat ground.** `sand` and `mountain` are not
base/top split in the art pack — they have no `top` entry at all
(`textures.ts`'s `SOURCES.base` vs `SOURCES.top`) — so a mountain's full
silhouette, height and all, lives in `terrainBase`. Isometric tile art
overhangs the neighbouring hex to its north. A water mesh drawn above the
whole of `terrainBase` would paint foam over the bottom of every coastal
mountain.

So `terrainBase` is split into two sprite layers with the water mesh between
them:

```
world
 ├─ terrainSea      NEW: sea + coastal-water sprites (flat, never overhang)
 ├─ waterLayer.mesh ← NEW
 ├─ terrainLand     the rest of today's terrainBase
 ├─ ...
 └─ terrainTop
```

This is correct, not just a workaround: water tiles are flat and never
occlude anything, land tiles do and must draw over the water effects. The
existing `isoDepthKey` z-sorting stays *within* each container; splitting on
sea/land cannot reorder two tiles that could ever occlude each other, because
a flat sea tile is never the occluder.

`syncSpriteLayer` already takes the layer as a parameter
(`HexMapRenderer.ts:1976`), so this is a routing change in `rebuildTerrain`
plus one more `createSpriteLayer()`, not a rewrite.

### 3.4 Foam bleed is clipped for free

The foam band is allowed to extend slightly *onto* land (the mask's G
channel). In both views the land art draws **above** the water mesh, so that
bleed is clipped by real geometry with no extra work — and it is what makes
the foam read as touching the beach rather than stopping short of it in a
visible gap. Being generous with bleed is therefore cheap; being stingy costs
a visible seam.

### 3.5 Where the layer must be off

- **Landing-page preview** (`previewCenter`, no settlement): water isn't drawn
  at all today (§1.2). The mesh is hidden.
- **`deepFogOnly`**: the rebuild already short-circuits when the whole
  viewport is certainly unexplored (`fogPerfStats.deepFogOnly`). Hide the mesh
  there too — it would be invisible under opaque mist and it is the most
  expensive thing on screen.
- The mesh keeps `eventMode = 'none'`, like the fog quads, so it never eats a
  hex click.

---

## 4. The shader

One `GlProgram`, one fragment shader, both effects inside it, each behind a
uniform. Following `fogShader.ts`'s conventions exactly (no `#version`,
`in`/`out`, `finalColor`).

### 4.1 Sea body — `uSeaBody`

World mode only. Base colour ramped by the mask's R channel: shallow teal at
the coast → deep blue offshore, over the existing palette
(`#2a92ae`/`#14657f`/`#0b3c50`), plus a very low-frequency fbm mottle so a
large expanse of open water isn't a flat fill. Off → the mesh outputs nothing
here and the CSS gradient shows through.

In settlement mode this term is always off: the painted tiles are the sea
body.

### 4.2 Mid-water waves — `uMidWaterWaves`

A per-pixel port of today's squiggles, not a new look — the prototype's sea is
the art direction of record and the reference screenshot
(`docs/design/img/worldmap.png`) is what the result gets compared against.

For the 3×3 world-space cells around the pixel, at pitch
`WAVE_STEP_X`×`WAVE_STEP_Y`:

- hash the cell → density test (`WAVE_DENSITY = 0.62`), jitter
  (`WAVE_JITTER_X/Y`), phase, and period (3.4–6.6s), reusing today's constants
  so the density and rhythm carry over unchanged;
- the stroke is the prototype's two quadratic curves, which is a single sine
  arc of width `WAVE_WIDTH` and amplitude `bump`: compute the pixel's
  perpendicular distance to that curve and `smoothstep` it to a
  `WAVE_STROKE`-wide line;
- animate with the same in-place swell — offset `(+7, -3) * WAVE_SCALE * s`
  where `s = (sin(t/period·2π + phase) + 1)/2` — and modulate alpha by `s` as
  well, so crests breathe in and out instead of only sliding;
- suppress near the coast via the mask's R channel — the continuous successor
  to `isNearLand`, which today is a hard per-hex boolean and leaves a visibly
  hexagonal hole in the wave field around every island.

Cost note: 9 cells × one arc each is the most expensive term in the shader.
It is gated on `A > 0` (water) and on R being past the foam band, so it early-
outs over land and along the whole coast.

### 4.3 Shoreline foam — `uShorelineFoam`

Foam is not an outline. A single band at a fixed offset from the coast reads
as a sticker; the two things that make it read as water are a **ragged edge**
and a **surge**.

- `d = R` (distance from land), perturbed by a world-anchored, slowly drifting
  fbm: `d' = d + FOAM_NOISE * (fbm(p * FOAM_NOISE_SCALE + wind * t) - 0.5)`.
  World-anchored for the same reason fog's cloud field is (`uNoiseScale`'s
  comment): so the pattern neither stretches with world size nor slides under
  a camera pan.
- **Surge**: the band's width breathes, `width = FOAM_WIDTH * (1 + FOAM_SURGE *
  sin(t * SURGE_RATE + lowFreqFbm(p) + seed))`. The low-frequency term
  de-synchronises the surge along a coastline so it laps rather than pulsing
  as one ring; the mask's B seed adds per-hex grain on top.
- **Two tiers**: a narrow, nearly opaque inner line hard against the shore,
  and a wider, thresholded-noise outer lace at lower alpha. The inner line is
  what makes the coast read as wet; the lace is what makes it read as foam.
- Bleeds inward using G, clipped by the land art above (§3.4).

### 4.4 Uniforms

```
sampler2D uWaterMask
vec2  uMaskScale, uMaskOffset   world → mask UV affine
float uTime
float uSeaBody, uMidWaterWaves, uShorelineFoam   0/1 toggles
float uShowMask                  debug: render the mask channels raw
vec3  uShallowColor, uDeepColor, uFoamColor
vec2  uFoamWidth                 inner line, outer lace (world units)
float uFoamNoise, uFoamNoiseScale, uFoamSurge, uSurgeRate
vec2  uFoamWind
float uWaveSpeed, uWaveCoastFade
```

Same in-place `UniformGroup` mutation as `FogMaskLayer` — no per-frame
allocation, and `HexMapRenderer` stays free of Vue reactivity.

---

## 5. Toggles

Debug-panel only, mirroring `fogDebugFlags`/`FogDebugPanel` exactly. New
module `lib/map/water/waterDebug.ts` (rather than growing
`HexMapRenderer.ts`, which is already 2881 lines), exporting a plain
non-reactive object the panel wraps in `reactive()` the same way
`FogDebugPanel` does.

```ts
export interface WaterDebugFlags {
  /** Shader mid-water wave crests (§4.2). */
  midWaterWaves: boolean;       // default true
  /** Shader shoreline foam (§4.3). */
  shorelineFoam: boolean;       // default true
  /** Shader sea body under the world map (§4.1); off → the CSS gradient shows through. */
  seaBody: boolean;             // default true
  /** The pre-shader Graphics wave squiggles (waveLayer). Kept for A/B against docs/design/img/worldmap.png. */
  legacyWaveSquiggles: boolean; // default false
  /** Debug: render the water mask's channels instead of water. */
  showWaterMask: boolean;       // default false
}
export interface WaterDebugTuning {
  foamWidthHexes: number;  // 0.5
  foamSurge: number;       // 0.35
  waveSpeed: number;       // 1
}
```

`legacyWaveSquiggles` defaults **off** so the two wave systems don't
double-draw; the point of keeping it is that flipping it on next to the
reference screenshot is how the shader waves get signed off. If they can't be
made to match, that flag becomes the decision point, not a silent regression.

A new `components/hud/WaterDebugPanel.vue` sits alongside `FogDebugPanel`,
mounted by **both** `SettlementView.vue` and `WorldMapView.vue` under
`?debug=1` — reusing `composables/useFogDebug.ts`'s session-persisted flag
rather than adding a second debug switch (it already survives internal
navigation, which is the whole reason it exists — see its header).

---

## 6. Things the mask gets right for free

- **Rivers** are land hexes with their own art (`riverBase`/`riverTop`); they
  are `isLand` true, so no foam appears along a riverbank and no waves appear
  on a river. Correct by construction, and deliberately so — river water is
  the art pack's job, not this shader's.
- **Coastal water tiles** keep their painted shoreline in the settlement view;
  the shader's foam animates *over* it, anchored to the same coastline,
  because both derive from the same `isCoastalWater`/`isLand` terrain.
- **Fishing huts and dockyards** stand on coastal water
  (`WorldModel.ts:536`). Their sprites live in `terrainBase` → they route to
  `terrainLand` (they are buildings, not water) and so draw above the mesh,
  which is what we want: foam should lap around a dock, not over it.

---

## 7. Performance

The fog work already established that this codebase's binding constraint is
**fill rate on the software renderer CI uses**, not GPU time on a real
machine — `FOG_MIST_OPAQUE_AT_RAMP` exists purely so terrain under opaque mist
isn't drawn, and it was worth ~30ms a frame. A full-viewport water pass is
exactly the kind of thing that regresses that, so:

- fbm octave counts stay low (2 for foam, 1 for the sea mottle);
- every expensive term is gated on the mask (`A`, then `R`) and early-outs
  over land and, for waves, along the coast;
- the mesh is hidden entirely under `deepFogOnly` and in preview mode (§3.5);
- the mask is re-baked on region change, not per frame (§2.2);
- new `fogPerfStats` siblings — `waterMaskBakeMs`, `waterMaskTexels` — so the
  bake cost is measurable in `FogPerfPanel` rather than guessed at.

Per `CLAUDE.md`: **no branching on "are we in CI" or "is this a software
renderer."** If the shader is too slow under swiftshader, the fix is a cheaper
shader, not a different one for tests.

---

## 8. Testing

Unit (vitest, jsdom — no GPU, so these test our own logic, not Pixi):

- `waterMask.test.ts` — bake against a synthetic `TerrainLookup` (the same
  narrow interface `shoreline.ts` already uses): land texels have R = 0 and
  A = 0; a texel one hex offshore has R ≈ one hex in world units; distance is
  symmetric across a straight coast; a fully-open-water region saturates; the
  B seed is deterministic for a given hex.
- `waterMaskLayout.test.ts` — world↔UV round-trip; the texel budget clamps at
  extreme zoom-out; the covered region actually contains the viewport plus
  margin, and re-bake triggers exactly when the camera leaves it.
- `WaterLayer.test.ts` — flags map onto uniforms; `mesh.eventMode === 'none'`;
  geometry vertices follow the camera.
- **A layer-order test on `HexMapRenderer`** — assert the water mesh's index in
  `world.children` is above `terrainSea` and below `terrainLand`/`terrainFlat`.
  This is the regression test for the whole of §3 and it is testing our stack,
  not a third-party library.

E2E (`e2e/water-shader.spec.ts`, in the style of `fog-drift.spec.ts`): load
each view with `?debug=1`, toggle `shorelineFoam` and `midWaterWaves` from the
panel, and assert the canvas pixels actually change — the same
selector-driven approach the existing specs use, no timeout inflation.

Screenshots via `scripts/screenshot-helpers/flow.mjs` for the visual sign-off,
compared against `docs/design/img/worldmap.png` for the wave art direction.

---

## 9. Implementation phases

Each phase is a separate commit and leaves the app buildable.

1. **Mask** — `lib/map/water/waterMaskLayout.ts` + `waterMask.ts` + tests. No
   rendering yet.
2. **Layer + sea body** — `lib/map/water/waterShader.ts` +
   `WaterLayer.ts`; wire into world mode as `world`'s first child;
   `waterDebug.ts` + `WaterDebugPanel.vue`; layer-order test.
3. **Mid-water waves** — §4.2; put the existing squiggles behind
   `legacyWaveSquiggles`.
4. **Shoreline foam** — §4.3.
5. **Settlement view** — split `terrainBase` into `terrainSea`/`terrainLand`,
   insert the mesh between them, verify against a coastal mountain
   (the §3.3 case).
6. **Tuning + screenshots + e2e**, and the perf-panel counters.

---

## 10. Open questions

- **Wave fidelity.** Whether a per-pixel arc really reproduces the
  prototype's stroked squiggle closely enough to retire the Graphics layer is
  the one thing this doc can't settle on paper. `legacyWaveSquiggles` exists
  so the answer is a visible A/B rather than an argument.
- **Foam under fog.** The out-of-sight tint sits above the water mesh, so foam
  is visible (tinted) in scouted-but-unseen water. That seems right — it's
  terrain motion, not information — but it's worth a look on a real map before
  calling it settled.
- **Mask resolution at low zoom.** `MASK_TEXELS_PER_TILE = 8` is a guess sized
  against a half-hex foam band. If foam looks blocky when zoomed in on a
  settlement, the honest fix is more texels per tile there, not more blur.
