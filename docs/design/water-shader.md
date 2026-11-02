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
| Settlement sea | The shader draws **over** the hand-painted water tile art (`watertile_*`, `coastalwatertile_*`), it does not replace it. Reaffirmed during implementation against reference art with a bright cyan sea: if the settlement's water should be cyan, that is new `watertile_*` art, not a shader tint. |
| Surface pattern | **Two idioms, one per view**: caustic ribbons close up (settlement), the prototype's scattered wave arcs from orbit (world map). Decided during implementation, against reference art — §4.2b. The close-up idiom is three layers — a coarse net, a finer brighter one, and drifting shadow blobs under both — §4.2c. |

Explicitly **out of scope**: any backend work (the mask is baked client-side,
see §2.3), the river art itself (rivers are land hexes with their own painted
art — see §6; only the ripples that make that water flow are drawn here, §4.4d),
lava streams, frozen rivers and bog lakes (they stay still), and a
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
| **R** | The **signed** near distance from the coastline, `0.5 + d / (2 * NEAR_SPAN_TILES)`. 0.5 is exactly the coastline, below it is land, above it is water. |
| **G** | Unsigned distance from the nearest land, **in ground space**, normalised over `FOAM_REACH_TILES` — the far field, read by §4.2's wave coast-fade and §4.2b's caustic keep-off. |
| **B** | Per-hex pseudo-random seed, as fog v2's B channel does (`demoFogMask.ts`'s `noiseSeed`). **Nothing samples it any more** — see §4.3 on why a per-hex value is the wrong shape for anything the foam does — and it is kept for the debug view and for whatever wants a per-hex constant next. |
| **A** | Unused, baked as 255. What the shader must keep off in the painted art is not a mask channel any more: it is the art dry mask (§4.4b), a separate texture. |

The mask's RGBA bytes are spoken for, so the tainted-water field around a revealed
wasted island (§4.4c) is a **second, single-purpose bake** — `WaterMask.taint`,
uploaded as its own texture — rather than a fifth channel squeezed in here.

**No channel is a step**, and that is the point. An earlier version stored two
unsigned distances (outward and inward) plus a water-coverage *bit* in A, and
had the shader pick between them on `A >= 0.5`. A 0/255 step sampled with linear filtering is a *texel-quantised*
silhouette: which side of the step a pixel falls on is decided by the texel
raster, not by the hexagon the art draws. Measured on screen, that made the
foam's inner edge alternately overlap the sand by up to 8px and leave a 1–3px
sliver of bare water between itself and the shore, stair-stepping along every
diagonal — a "lick onto the beach" that was really just mask blur. A signed
field has no such decision in it: it is continuous across the boundary, so
filtering places its zero crossing within a fraction of a texel of the real tile
edge, and interpolation *helps* instead of blurring a silhouette.

`NEAR_SPAN_TILES` is 0.6 either way, which spends the byte where the foam is —
about 0.8 world units per level, against the ~2 a single channel spanning the
whole `FOAM_REACH` would give.

**G is baked in ground space too.** The raster transform runs with its y axis
weighted by `1 / squash²`, so a step in y costs what it covers on the ground
rather than what it covers on the glass. Left flat — which it was, while every
other field in this file had already been lifted — its level sets sat 1.9× further
out on a north-facing shore than an east-facing one, and the caustics' keep-off
band inherited exactly that: the same width in screen pixels all the way round an
island, therefore the wrong width on the ground. Felzenszwalb's 1D transform
takes the weight as a curvature on its parabolas, so this is one extra parameter,
not a second algorithm.

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

1. For each texel, world position → hex via **`isoPixelToAxial`**
   (`lib/hex/geometry.ts:65`) → `WorldModel.isLand`. Write A and the B seed.

   This must be `isoPixelToAxial`, and **not** anything derived from sprite
   bounds. `isoPixelToAxial` is defined in terms of the `isoTopPoints`
   hexagon — the tile's flat top face, which "abuts its neighbours with no
   gaps or overlaps" (its own comment) — so the mask's land/water boundary
   lands exactly on the top-face polygon edge. §3.4 is the reason that
   matters: it is also exactly where the *art's* land/water boundary lands,
   so the two agree with no fudge factor. Bake from sprite extents instead
   and every boundary shifts by up to 68px, detaching the foam from the
   coastline it is supposed to trace.
2. Run a **two-pass exact euclidean distance transform** (Felzenszwalb) over
   the coverage bitmap. Linear in texels, and exact rather than the 3-4 chamfer
   the spike used — a chamfer's error is *directional*, and the spike showed it
   as faint radial streaks fanning out from every coast.

   That gives the far field (G). Near a coast it is **replaced** by an exact
   metric, because a euclidean field is the wrong shape there: it rounds every
   convex corner over a radius equal to the band drawn from it, and a hex edge
   is half a tile long while the foam band is a third of one — so on a hex
   coastline the corners dominate and any band drawn from it reads as a soft
   blob rather than as something following the shoreline.

   The replacement is the **max over a tile's six outward half-planes**, whose
   level sets are the hexagon scaled outward with its corners kept sharp:
   straight runs parallel to each tile edge, mitred joins. It agrees with the
   euclidean distance exactly along every edge and is zero on the edge itself,
   so §3.4's alignment is unaffected — if anything sharper, being exact per
   texel rather than quantised to the raster. Only texels within
   `NEAR_SPAN_TILES` of a coast pay for it, so on a zoomed-out world map the
   loop is skipped for almost every texel.

   Both are computed in **ground space** — world space with y divided by the
   isometric foreshortening (`TILE_H / (TILE_W * sqrt(3)/2)`, about 0.53). A
   band of constant *screen* distance around a tile is not the projection of one
   of constant ground distance, and reads as a decal in front of the map rather
   than as foam lying on the water.

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

### 3.3 Settlement mode — above `terrainBase`, and the legacy-art caveat

The insertion point is **between `terrainBase` and `borderLayer`** — above all
the ground art, below the tall art in `terrainTop`:

```
world
 ├─ terrainBase     ground art (incl. water tiles)
 ├─ waterLayer.mesh ← NEW
 ├─ borderLayer
 ├─ hoverLayer
 ├─ terrainTop      tall art — draws over the water effects
 └─ ...
```

No container split, no reordering. That this works at all is a property of the
art pack, so it is worth writing down what was measured rather than assumed.

**The tile art is a flat-topped prism.** Native art is 200×300; the flat top
face spans y 140–232 (`TILE_ART_TOPFACE_Y_FRAC`, `TILE_ART_TOPFACE_H_FRAC`).
Measuring every base-layer texture in the pack. **Measure by first row with
at least ~5 opaque pixels, not by the raw alpha bounding box** — some files
carry a near-transparent stray row at the very top, which a raw bbox reads as
a full-height overhang. (`top/foresttile_*` measures 139px raw and 48px real;
that mistake is what §11 records getting wrong.) A row pitch is 92px, so the
last column is the number that matters:

| base-layer family | px **above** the top face | px **below** | rows up |
| --- | --- | --- | --- |
| `watertile`, `coastalwatertile` | 0 | 68 | 0 |
| `grasstile`, `foresttile`, `rivertile`, every split building base | 1 | 68 | 0.01 |
| `sandtile` | 1 | 68 | 0.01 |
| `fishinghutbuilding` | 0 | 68 | 0 |
| `towerbuilding` | 20 | 68 | 0.22 |
| `dockyard` | 25 | 68 | 0.27 |
| `mountaintile` | 66 | 68 | 0.72 |
| `magictower` | 102 | 68 | **1.11** |

Two things follow.

**Every tile has a 68px skirt below its top face — water included.** So an
earlier draft of this plan that split `terrainBase` into `terrainSea` and
`terrainLand` with the mesh between them was **wrong**, and the reason is worth
keeping: drawing all sea before all land breaks sea↔land occlusion at the
coastline. A land tile's skirt reaches 46px into the top face of the water hex
diagonally in front of it, which today is covered because that water tile draws
later (`isoDepthKey`). Group the sea first and the coastal cliff paints over the
water in front of it instead — a wedge of wrong occlusion along every shore,
which is precisely where the foam is. **Do not split `terrainBase`.**

**Only art that rises *above* the top face can be over-painted**, and after the
legacy art is split that set is empty. `sand` and `mountain` have no base/top
split today, and neither do `fishinghutbuilding`, `magictower`, `towerbuilding`
or `dockyard` — but every family that *is* split has a base of ≤1px above the
top face, so once the legacy split lands `terrainBase` is uniformly flat-topped
and this section reduces to "put the mesh above `terrainBase`", full stop.

Until then, four families stick up: `mountaintile` (66px), `magictower`
(102px), `dockyard` (25px), `towerbuilding` (20px). In practice
`mountaintile` is close to a non-case: the generator puts mountains in the
island *interior* (`mountainThreshold` 0.4) while sand covers the whole outer
band (`beachThreshold` 0.82), so a mountain would have to bridge a Δt > 0.6 in
one hex to touch sea. The spike (§11) found 0 coastal mountains out of 289
across a 181×181 scan. It stays in the table anyway — one entry costs nothing,
and "vanishingly rare" is not "impossible" on a small island. (`sandtile`'s 1px and
`fishinghutbuilding`'s 0px are already flat — a fishing hut needs no special
handling despite standing on coastal water.) Art above the top face overhangs
the hex to the **north**, which draws earlier, so the artifact is: a coastal
mountain with water to its north gets foam painted over its peak.

The split families are exactly the ones with a `hextiles/base/` +
`hextiles/top/` pair; the unsplit ones sit at `hextiles/` root, which is what
`textures.ts`'s `ROOT_TERRAIN`/`ROOT_BUILDING_PLAIN`/`ROOT_BUILDING_LEVELED`
globs pick up. So "root-level" *is* "legacy", and the legacy set is exactly
`watertile`, `coastalwatertile`, `sandtile`, `mountaintile`,
`fishinghutbuilding`, `magictower`, `towerbuilding`, `dockyard`. All of them
are slated for conversion; new art already ships split.

**But the table must stay measured, not keyed on legacy-ness.** Half that set
is already flat — and `sandtile` in particular is both legacy and 1px, and is
the most common terrain on a coastline. Treating "legacy" as "occluder" would
suppress foam along every sandy shore, which is most of them.

**Interim fix — do the split in code, at the same cut line the pack uses.**
Not per-hex suppression, which was this plan's first answer and is wrong on
two counts: it would delete foam from a whole coastal hex (the one place foam
exists to be), and `magictower`'s 102px overhang exceeds the 92px row pitch,
so it reaches two rows north and suppressing one hex would not even be
sufficient.

Instead, for a family with no `top/` half whose art rises above the top face,
cut the texture at native y = 140 (`TILE_ART_TOPFACE_Y_FRAC`, exactly where
the pack cuts) into two sub-texture views and route them like a real split:
the lower piece (top face + skirt) stays in `terrainBase`, so every existing
`isoDepthKey` occlusion is untouched; the upper piece — the part that
overhangs north — goes to `terrainTop`, above the water mesh.

This is not a hack around the art, it is the art split done in code ahead of
time, so it can be deleted unchanged once the pack ships. The predicate is
structural, not a pixel measurement: `topTextureFor` returning nothing already
*means* "unsplit". The measured height table survives only as a perf filter
(`LEGACY_TALL_KEYS`) so the flat unsplit families — water, coastal water,
sand, fishing hut — don't pay for a second, empty sprite.

§11 verifies all of this on screen, including that the split is visually a
no-op and that already-split art is immune.

### 3.4 The skirt needs no handling — the depth sort already did it

Every tile, water included, has a 68px skirt hanging below its top face
(§3.3), and that skirt reaches into the hexes in front of it. Since the water
mesh now draws above all of `terrainBase`, the natural worry is what the
shader should do about a land tile's skirt lying over a water hex.

**Nothing, and it cannot see it anyway.** The mesh composites onto an image in
which `isoDepthKey` has already resolved the skirt: the tiles in front draw
later and cover it. And they cover it *completely*, because the top faces
tessellate exactly — a tile's skirt spans 68px below its own top face, while
the tile directly in front starts its top face 92px lower and is opaque from
there down. So a skirt is only ever a visible pixel where there is no tile in
front of it at all.

The consequence is the property the whole mask design rests on:

> Because top faces tessellate and skirts are always covered, the **visible**
> land/water boundary in the art falls exactly on the top-face polygon edge —
> which is exactly the boundary the mask encodes (§2.3). Mask and art agree by
> construction.

That is why there is no half-tile offset anywhere in this design, and why the
foam traces the painted coastline rather than floating a skirt's height away
from it.

Two bounded places where they *don't* agree, both already accounted for:

1. **Art rising above the top face** overhangs the hex to the *north*, which
   draws earlier — so the mesh can paint over it. That is §3.3's legacy set
   and its interim table.
2. **The frontmost rendered row**, where a skirt has nothing in front to cover
   it: a ≤68px strip along the southern edge of the rebuild region. It sits
   inside the fog cull margin under opaque mist, so it is not visible in
   practice — named here so it isn't mistaken for a bug in the mask.

### 3.5 Foam bleed onto the land — drawn in one view, clipped in the other

The foam band is allowed to extend slightly *onto* land (the mask's G
channel), which is what makes it read as touching the beach rather than
stopping short of it in a visible gap.

An earlier version of this section claimed the bleed was clipped by real
geometry in **both** views, so it cost nothing to be generous with. That is
half right, and the wrong half matters:

- **World map**: `terrainFlat`'s opaque island polygons are above the mesh
  (§3.2), so the bleed is genuinely clipped. Nothing of it is visible.
- **Settlement**: only the *tall* art in `terrainTop` is above the mesh. The
  ground art in `terrainBase` — the sand a beach is made of — is **below** it
  (§3.3's own stack says so). The bleed is therefore *drawn* over the sand, not
  clipped.

The effect is right and only the reasoning was wrong: painting over the sand is
exactly how foam ends up licking the beach. But it means the land-side reach is
a **visible art parameter in the settlement view**, not a free safety margin,
and it has to be tuned rather than made generous. §4.3 states it as a fraction
of the water-side reach for that reason.

### 3.6 Where the layer must be off

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

### 4.2b Caustic ribbons — the close-up surface (`uCaustics`)

A settlement is a few metres above the water, not in orbit, and scattered arcs
read as an ocean seen from very far away. Up close the reference look is a
connected, branching network of pale ribbons — loops, some nested inside others.

That shape is exactly the set of **contour lines of a slowly churning noise
field**, so that is literally what this draws: level sets of an fbm, banded with
`fract()` so one field yields a whole family of nested contours for the price of
one, with a slow time term walking the level set through the field so the loops
breathe rather than merely translate. No attempt at real refraction, which would
need a surface normal this shader has no business inventing.

Deliberately a **different idiom** from §4.2's arcs rather than a tuning of
them, and which one a view gets is decided by the view: `settlement` →
ribbons, `world` → arcs. `causticsEverywhere` is a debug flag for judging the
two at the same scale.

Three constants are the whole look and they trade off against each other: the
field's feature size, how many contours it is sliced into, and how thick each
one is. Few thick bands read as a pale haze on the water rather than as ribbons
at all; many thin ones as fizz.

Thickness is measured **after dividing by the field's own gradient**. Without
that the width is in *field* units, so wherever the field is flat — at every
local extremum, which is everywhere the noise has one — a whole basin falls
inside a single band and paints as a filled smudge or a stray dot. Those smudges
were the majority of what was on screen; the readable loops were the minority.

The ribbons **keep off the shore**: within `causticCullHexes` of land there are
none, read off G rather than the signed near field (the cut sits past where R
saturates). Running them right up to the coastline stacks two bright white
patterns in the one place the eye is already reading an edge, and the foam band
stops looking like the boundary of the water and starts looking like the
brightest part of a texture. A band of plain water against the coast reads as
the surface only catching the light once there is some depth under it.

The keep-off is short on purpose: `causticCullHexes` is 0.25 and
`CAUSTIC_CULL_SPREAD_TILES` 0.1, so a ribbon ends just under the foam band
(`foamWidthHexes` 0.3) instead of a visible gap before it. What keeps ribbons
off rocks, boats and buildings is not this distance but the art dry mask (§4.4b).

**Cut, not faded.** The first version ramped them in over half a hex, and the
ramp itself became the artifact: a whole belt of ribbons at half strength, and a
half-strength ribbon does not read as a ribbon further away, it reads as a
smudge — so the fade drew a second, softer coastline just outside the first.
`CAUSTIC_CULL_SOFTEN_TILES` is a couple of pixels of antialiasing on the cut, not
a fade.

**And the keep-off distance is per ribbon, not per pixel.** A cut at a constant
distance from land is a clean offset curve of the coastline and reads as drawn
just as much as the ramp did; displacing that one line by position-noise
straightens out the *shape* but not the fact that it is one line, and measured on
screen the ribbon ends still clustered at 60 ± 15px because the noise's feature
size was six times the ribbon spacing.

The fix is that a fragment shader *can* identify which ribbon it is on, even
though it has no connectivity: `floor(bands + 0.5)` is the index of the nearest
contour, and it is the same integer everywhere along that contour. Hashing it
gives each ribbon one keep-off distance, held along its whole length, drawn from
`causticCullHexes` → `+ CAUSTIC_CULL_SPREAD_TILES`. Loops that lie entirely inside
their own keep-off never appear at all — which is the "remove the ones that touch
the shore" case, as far as it is expressible without a second pass — and the rest
end at distances that have nothing to do with each other, so there is no line
left to see. Cost is one `hash`, against the four `fbm` evaluations the field
already does.

### 4.2c The other two caustic layers — `uCausticFine`, `uCausticBlobs`

One net of ribbons over flat water is a pattern; the reference art is a *depth*.
Its water is built from light cells at more than one size with deeper pools
between them, and a single contour field can only ever supply one size and only
ever add light. So the close-up surface is three layers, composited dark to
light, each behind its own flag.

**The fine net (`fineCaustics`).** The same `causticNet` at 2.4× the scale, in
white instead of the coarse net's cooler blue, at a lower alpha, on a 1.7× clock.
Every one of those is doing something:

- *An awkward scale ratio.* At 2× or 3× the two fields' contours coincide often
  enough to read as one field drawn twice — a moiré rather than two layers.
- *A different domain and a different clock.* `causticNet` takes a `seed` that
  offsets the field **and** the per-ribbon keep-off hash, and a `rate` that
  scales the drift. Without both, the fine net is a scaled copy of the coarse one
  that moves with it, and the eye reads them as one object.
- *Brighter but thinner.* A brighter colour carried at a lower alpha reads as a
  highlight catching the surface. The same white at the coarse net's alpha just
  doubles the total white on the water and washes the sea out.

**The shadow blobs (`causticShadows`).** The one water layer that darkens. A cell
grid — the `waveField` idiom, not the contour one — because this needs *per-blob*
identity: a blob is one cell, so it draws its own keep-off distance from the
shore the way a ribbon draws one from `floor(bands + 0.5)`, and blobs inside
their own keep-off are simply absent rather than every blob being clipped along a
common contour. Nothing inside the loop is heavier than a `hash` and a `length`,
so nine cells cost about what one contour net does.

Three things had to be got right, and two of them were wrong first:

- **Chosen by luminance, not by looking dark.** The first colour was `0x0a3b4d` —
  which reads as deep water written down, but carries most of its weight in green
  and measures 49.9 against the painted settlement water's 51.1. It composited at
  full strength and changed nothing: the 5th percentile of water luminance was
  *identical* with the layer on and off. The shipped `0x0d1728` is the water's own
  hue at about half its brightness. Not a neutral grey either — a desaturated
  shadow over a navy sea reads as haze, not as depth.
- **Big enough to overlap.** At radius 0.16–0.36 of a cell and 55% density the
  blobs covered about 4% of the water and read as bubbles. At 0.28–0.56 and 90%,
  `max` merges neighbours into irregular pools, which is what the reference has
  between its light cells. Measured after: the water's 2nd percentile drops 41.8 →
  35.6 and the 10th 44.7 → 40.8 with the layer on, having not moved at all before.
- **One domain warp for the whole field.** Two `noise` lookups before the loop,
  displacing the sample point by half a cell, turn nine perfect circles into nine
  irregular pools. Per-blob deformation would cost nine times as much for the same
  effect.

The cell grid is gone now — merged discs are what a thresholded field already is,
so the pools are the low ground of one drifting `fbm`: ~8 hashes against the
grid's ~60 plus a sine and a cosine per cell. The per-pool keep-off survives for
free, because `n` is what defines the pool, so using it as the jitter gives each
one its own distance from land — the ribbons' contour-index trick, off a value
already in hand.

### 4.2d What the shader's cost actually is

Measured on the production build under the same software renderer CI uses
(1280×800, settlement view zoomed so water fills the frame), toggling terms off
one at a time:

| | frame |
|---|---|
| water layer off | 141 ms |
| whole layer on | 247 ms |
| every effect off, mesh still drawn | 240 ms |
| **constant colour, no mask fetch, no maths** | **226 ms** |

So of the layer's ~99 ms, about **84 ms is rasterising and alpha-blending one
full-viewport quad**, before the shader computes anything at all. The mask fetch
is ~14 ms and every effect in §4.2–4.4 together is the remaining ~14 ms. Quarter
the viewport's area and the whole figure quarters with it (99 → 25 ms), which is
what fill rate does and nothing else would.

Two consequences, both counter-intuitive enough to invite wasted work:

- **Optimising the fragment maths cannot pay for this feature.** The savings
  above are real and worth having, but they are a seventh of the layer's cost on
  this renderer.
- **Rendering the water at half resolution would make it slower, not faster.**
  The upsample blit is itself a full-viewport blended textured quad — exactly the
  thing that costs 84 ms.

On a GPU a blended full-screen quad is a fraction of a millisecond, so this is a
software-rasteriser figure and not a shipping one. The only lever with the right
magnitude is *fewer fragments*.

**And the obvious way to get them does not work here — measured, not assumed.**
Covering the water with geometry instead of the viewport (a coarse grid over the
mask region, emitting only the cells that hold water) is exactly the right shape
of fix: those land fragments discard today, so dropping their cells changes
nothing on screen. Built and measured, at one tile per cell, it dropped **2-3% of
cells** — 640 of 660, 351 of 357 — and moved the frame by nothing.

The reason is the safety margin, and it is structural rather than a tuning
problem. A cell can only be dropped when it and all eight neighbours are pure
land, because the foam licks onto the beach and the mask's own filtering reaches
a texel past the coast. That keeps a ring one tile wide around every coastline,
so the saving is the land's *area minus its perimeter* — and this game's islands
are about six to eight tiles across, which is nearly all perimeter. It would pay
on a continent and does not pay on an archipelago. Finer cells do not rescue it:
the ring is one cell wide either way, so shrinking cells shrinks the ring and the
dropped interior together.

What is left, then, is not an optimisation but a choice about the feature: accept
that the settlement view costs a full-screen blended pass on a software
rasteriser (free on any GPU), or do not draw water there.

#### The breakdown is a button now

Every figure above came from toggling a flag by hand and watching the frame
interval. `perfSweep.ts` automates that loop and WaterPerfPanel offers it as
**Measure breakdown**: baseline, then one sample per flag with that flag off,
then a second baseline. Nothing new is measured — it is the same wall-clock A/B —
but it is repeatable, and it reports two things a person doing it by eye skips.

Each row carries the **noise floor** it was measured against (the wider of the
two samples' median absolute deviations, and the drift between the two
baselines). A delta smaller than that is printed as *< noise* rather than as a
small number, and a *negative* delta — which the very first run against the real
renderer produced, a "+15.8 ms" surface pattern — is printed as *not resolved*,
because switching work off cannot make a renderer slower and such a row has
measured the machine.

That matters because of what the sweep actually finds. In this sandbox
(1440×900, software rasteriser, ~550 ms/frame), across three runs:

| row | delta |
|---|---|
| water layer, all of it | −125 / −152 / −144 ms |
| fog, both tiers | −122 / −119 ms |
| every individual water effect | not resolved |

The first two are stable and the second is the useful surprise: **the fog costs
about what the water does**, which no amount of staring at the water shader would
have told you. The per-effect rows being unresolvable is not a defect of the
sweep — §4.2d already says every effect together is ~14 ms against a fixed cost
of ~84 ms, and 14 ms spread over five rows is well inside a ±16 ms wobble. The
panel says so instead of printing five plausible-looking numbers.

One limitation stated in the panel itself, because it bites hardest on the
machine most likely to run it: **on a GPU with vsync the frame finishes early and
waits**, so every row comes out flat regardless of what the shader costs. The
panel detects a baseline at or under 17.5 ms and says the map is not what is
pacing the frame, rather than letting the result read as "everything is free".

### 4.2e Keeping the two nets out of step — `uCausticFinePhase`

The nets are built to be *independent* — different domain, different band count,
an awkward scale ratio, their own drift rate — and that turned out not to be the
same thing as being **out of step**. Each one breathes as its level set walks
through its field, and with both clocks started together the busy and empty
moments coincide: the water goes from bare to crowded and back with both nets
doing it at once. No amount of making the fields more different from each other
fixes that. Only offsetting one in time does.

So `causticNet` takes a `phase` added to `t` before anything reads it, and the
fine net gets 17 s of it — a little over half the ~30 s breathing period, so the
two are close to opposed rather than merely unequal. It is on a slider, because
the right offset is a matter of taste and depends on the other six handles.

Measured over 24 samples a second apart, on the bright-pixel fraction of a patch
of open water with the pools switched off:

| | mean lit | min | max | swing |
|---|---|---|---|---|
| in step (phase 0) | 16.85% | 14.29 | 18.95 | 4.66 pp |
| offset (phase 17 s) | 18.23% | 16.75 | 19.95 | **3.20 pp** |

Peak-to-trough falls by about a third, and — the part that matters for the
complaint this fixes — almost all of that comes from the *empty* moments: the
floor rises 2.5 points while the ceiling barely moves. Worth stating plainly
that this evens the extremes out rather than removing the breathing: the
standard deviation only goes 0.92 → 0.89, which is inside the noise.

One real bug turned up on the way. The counter-drifting second term inside
`causticNet` was not multiplied by `rate`, so it moved at exactly the same speed
and heading in both nets — a good half of each field's motion was common to the
two, which is an efficient way to make two independent fields look like one.

### 4.3 Shoreline foam — `uShorelineFoam`

Foam is not an outline. A single band at a fixed offset from the coast reads
as a sticker; the two things that make it read as water are a **ragged edge**
and a **surge**.

Everything is a function of one **shore proximity**: 1 on the coastline, 0 at
`FOAM_WIDTH` out into the water and at `FOAM_WIDTH * FOAM_LAND_REACH` into the
land. Two properties of that formulation are load-bearing, and both were
learned by measuring the first attempt on screen rather than looking at it:

- **A plateau, not a peak.** Full strength from the coastline out to
  `FOAM_INNER` of the band, then a falloff. A proximity that peaks at the
  coastline and falls off both ways is a knife edge only a sub-texel sliver of
  pixels sits on, and the edge noise then wobbles even that off the shore —
  measured, that left 1–3px of foam on a 24px band.
- **Asymmetric, biased to the water.** The land reach is a fraction of the
  water reach, with no plateau. The first attempt thresholded the signed
  distance directly, which is a half-plane: everything on the land side sat at
  full strength while the water side got a sliver. Measured at the art's own
  waterline that put **0px of foam on the water and 8px on the beach** — the
  exact inverse of the intended look.

On top of that:

- **Ragged edge, on the outer boundary only.** Two octaves of a world-anchored,
  slowly drifting noise displace where the band ends: a coarse one at about one
  and a half hexes, which tears the boundary at the scale of a cove, and a fine
  one at the band's own width, which tears it at the scale of a lap. The inner
  edge is *not* displaced. Perturbing one shared distance moves both ends
  together, so the band slides across the coastline rather than changing shape —
  and displacing it enough to see lifts the inner edge off the tile edge, which
  is the one thing the whole signed-field design exists to nail down.

  The amplitude is in **tile widths**, not a fraction of the band. It was a
  fraction, and with both constants below 1 the real displacement came out around
  a fiftieth of a tile: one or two screen pixels. That is the answer to "why does
  the band read as a drawn stroke" — it had no structure at any scale between
  per-hex and sub-pixel. The foam is drawn at this full width everywhere; over painted
  objects it is cut by the art dry mask (§4.4b), not narrowed.
- **Surge**: the band's width breathes, `width = FOAM_WIDTH * (1 + FOAM_SURGE *
  sin(t * SURGE_RATE + coarseNoise(p) + hexScaleNoise(p)))`. Two scales of
  de-synchronisation — about seven hexes for the swell, about one for the
  individual lap — so it laps along a coastline rather than pulsing as one ring.

  The mask's **B seed used to be one of those terms, and that was a bug.** A
  per-hex value sampled with linear filtering is a step, and a step in the surge
  phase is a step in the band's width: measured, the foam ran at one width along
  a hex edge and 1.9× that (3.3× at p90) along the next, switching over the ~12px
  that one mask texel interpolates across. The band's only variation was per-hex
  and discontinuous, which is precisely how a drawn outline behaves and how water
  does not. Nothing per-hex belongs in a continuous quantity.
- **Two tiers**: a nearly-opaque inner line on the plateau, and a wider
  thresholded-noise outer lace at lower alpha. The inner line is what makes the
  coast read as wet; the lace is what makes it read as foam. The lace starts part
  way up the proximity rather than at its very tail — near-white at low alpha
  over navy is not faint foam, it is grey (measured: saturation 0.57 → 0.28,
  nothing actually darker than the water), so the tail is cut and the rest
  carried at a higher alpha.

#### The world map's foam is a different drawing

Same shader, two sets of constants, chosen by mode at construction. Up close the
band is soft — a bright inner line, a broken outer lace over it, a short lick
onto the sand — because that is what water does at a beach and the settlement
view is close enough to see it. From orbit that treatment has nothing to resolve
into: a two-tier band a few pixels wide is a blurred white glow around every
island, which reads as a drop shadow under a sticker rather than as surf. So
world mode drops the lace (`FOAM_ALPHA_WORLD`'s second tier is 0), holds the
inner line across nearly the whole width (`FOAM_INNER_WORLD` 0.75), and keeps
essentially nothing on the land side.

It is also **narrower and not pure white**: `FOAM_WIDTH_WORLD_SCALE` takes a
third of the settlement's width off the same slider, and the inner tier runs at
0.72 rather than 0.95. The band is in world units, so the width that is a
believable surf line up close is a 10–15px white outline from orbit — and
`docs/design/img/worldmap.png`, the art direction of record, has no white outline
around its islands at all, only a faint halo, which §4.1's shallow-water ramp
already provides.

`FOAM_LAND_REACH_WORLD` is small rather than zero deliberately: the land-side
term is a `smoothstep` over it, and GLSL leaves `smoothstep` undefined when its
two edges coincide.

### 4.4b Art dry mask — `uWaterDry`

The water mesh draws caustics and foam over the painted water tiles. Several of
those tiles are not plain water: `coastalwatertile` variants paint a beached boat
or a rock, and the fishing hut, dockyard, palisade ends, shrine, packice and
their reflections stand *in* the water. A surface pattern running across one of
those reads as painted onto the object rather than flowing around it. So the
shader keeps caustics and foam off every pixel of the art that is not plain
water.

**The mask comes from the art itself, at build time**, per pixel, not from a
per-hex flag: a hexagonal hole in a coastline is far more visible than the prop
it protects, and a per-hex rule cannot follow a boat's outline anyway.

*Build* (`build/waterDryMasks.ts`, a Vite plugin serving `virtual:water-dry-masks`;
the pure per-frame maths is `dryMaskCore.ts`):

1. Take every non-showcase atlas page and every `_base` frame (the half drawn
   *under* the water mesh; `top` frames are drawn above it and never need
   masking), placed on the full 200x300 source canvas through its
   `spriteSourceSize`. WebP pages are lossless, so the atlas pixels equal the
   source PNGs.
2. The reference frames are the plain water tiles
   (`coastalwatertile|watertile|taintedwater|blacksandcoast|icecoast` + orientation
   + `_base`). For each other `_base` frame with an orientation token, compare it
   with every reference of the **same orientation**: a pixel is "the same" when
   both are opaque and no RGB channel differs by more than **6**
   (`SAME_PIXEL_EPS`). The ratio is the share of the reference's opaque pixels
   the frame repeats; the best reference wins.
3. A frame whose best ratio is **0.4** or more (`WATER_MATCH_MIN_RATIO`) is
   water-based art and gets a mask. Measured over the vendored art, water-based
   frames score 0.57 and up (coastal variants 0.86 to 1.0, huts about 0.8,
   palisade ends 0.77 to 0.89, dockyards up to 0.74, the shrine about 0.57,
   packice about 0.72), every land tile 0.14 or less. Reference frames get no mask.
4. Dry = art opaque **and** (reference transparent **or** RGB differs by more
   than **20**, `DRY_PIXEL_EPS`). Colour does not matter: a blue sail is dry
   because it differs from the reference pixel at that spot, not because of its
   hue. 20 rather than the 6 of step 2: the soft ambient shadow the art casts on
   the water around an object is a few dithered levels darker, and at 6 it came
   out as a speckled dry halo, which cut dark blotchy holes into the foam. At 20
   only the object and its contact shadow are dry.
5. The 0/1 map is closed (grown by 2 source pixels, shrunk by 1) — which fills
   the pinholes the dithering leaves inside an object and leaves the mask one
   pixel outside its outline, so the shader stops just outside it — and box-downsampled 2x2 to **half resolution**, which
   makes the edge soft. All cells are shelf-packed into one grey+alpha PNG (alpha
   is the mask) that the module exports as a data URL, with each frame's cell
   rect and the source rect it covers. Computed once per build or dev-server
   start.

*Runtime* (`waterDryMask.ts`, `WaterDryLayer`): the module is imported lazily.
For every sea hex's base art in settlement mode the renderer draws, into one
render texture covering the water mask's world rect (one pixel per world
unit, long side capped at 2048, linear filtering), the frame's mask cell at the
art sprite's position plus the cell's source rect scaled by `tileWidth / 200`.
Frame names come from `Texture.label`, which Pixi's `Spritesheet` sets to the
frame key. The texture is redrawn when the water mask is applied or the terrain
base entries change, not every frame, and bound as `uWaterDry`, sampled with the
same `vUV` as the water mask. World mode, and the time before the masks have
loaded, bind a 1x1 texture of zeros: nothing is dry.

*Fallback for unknown art*: art on a sea hex that is neither a reference nor has
a mask cell (anything not water-based) is drawn into the render texture with its
own alpha, tinted black, so all of its opaque pixels count as fully dry. Reference
frames draw nothing.

The shader reads `float dry = texture(uWaterDry, vUV).a;` and multiplies the
caustics (all three layers: blobs, coarse net, fine net) and the foam by
`(1.0 - dry)`; the foam keeps its full width and edge noise. The sea body (§4.1)
is not masked (it is a flat colour with nothing at odds with the art), and the
world-mode wave arcs are not either, since world mode has no painted sea tiles.

### 4.4c Tainted water (wasted islands)

Wasted islands are hidden until the endboss triggers, then revealed through
`WorldModel.setWastedRevealed`; a revealed wasted hex's coastal-water tiles
already render as dark tainted art (`blacksandcoast`/`taintedwater`, `#13342b`).
The shader knew nothing about them, so the open sea *around* one of those
islands stayed the ordinary blue (`#3860b1`), with bright white foam, waves and
caustics — a lit, living sea wrapped around a dead shore.

The mask's channels (R/G/B above) are spoken for, so this is a
**second single-purpose bake**, `taint`: one byte per texel, `1.0` in water
within `TAINT_INNER_TILES` (1 tile) of wasted land, fading smoothly to `0` by
`TAINT_REACH_TILES` (2.5 tiles) — comfortably past `FOAM_REACH_TILES`, so the
taint colour has room to fully take over before the foam band is drawn.
Wasted land itself bakes to `1.0` too, so linear filtering at the shore
doesn't dip toward untainted for a frame. Raster distance only (the same EDT
helpers the main mask's far field uses, no mitre refine): the ramp is over a
tile wide, well past the texel-raster error the refine pass exists to correct
on the third-of-a-tile foam band.

`TerrainLookup` gains an optional `isWastedLand?(q, r)`, the same optional
shape: a caller that omits it, or one that never
answers true over the baked region, gets an all-zero `taint` array — which is
also why every mask baked for a world with no wasted islands (or one not yet
revealed) stays byte-identical to what shipped before this existed. Reveal
gating is the caller's job, not the bake's: the worker's `isWastedLand` is
`wastedRevealed && terrainAt(q, r, world) === 'sea' && wastedTerrainAt(q, r,
world) !== 'sea'`, mirroring `WorldModel.isWastedLandAt` (now public, so the
renderer's own inline fallback can ask it directly without materialising a
`Tile` per water texel).

`WaterLayer` uploads `taint` as a second texture, `uWaterTaint` — single
channel (`r8unorm`, no premultiply-alpha concern at all, since there's no
alpha channel to premultiply against) rather than a fourth RGBA copy — sampled
with the same UVs and linear/clamp filtering as `uWaterMask`, so its own zero
crossing lands at the same sub-texel precision. The shader reads it once,
`float taint = texture(uWaterTaint, uv).r;`, and every term that already reads
distance also reads this:

- **Sea body**: `col` mixes toward `uTaintShallowColor`/`uTaintDeepColor`
  (`#13342b`/`#0b211b` — the baked coastal-water art's own colours, so the
  shader's sea continues that art rather than starting a third palette) at the
  same depth the untainted mix uses, by `taint`.
- **Foam**: colour mixes toward `uTaintFoamColor` (`#7d8a82`, ash grey-green)
  by `taint`; alpha is scaled by `mix(1.0, 0.55, taint)` — dimmed further than
  the crests below, because foam starts brighter than open water and needs
  more of a pull to stop reading as clean surf against a dead coast.
- **Waves**: colour mixes toward the same `uTaintFoamColor` (one taint colour
  for "white water", not two to keep in step) by `taint`; alpha scaled by
  `mix(1.0, 0.4, taint)`.
- **Caustics**: multiplied by `(1.0 - taint)`, folded into the same `quiet`
  factor the art dry mask uses (`quiet = (1.0 - dry) * (1.0 - 0.75 *
  taint)`) — sunlight-through-clear-water ribbons don't belong on water that
  isn't clear.

### 4.4d River flow — `uRiverFlow`

The painted river, stream and bog-creek water is still. In the settlement view the shader draws thin light ripple bands on it
that cross the channel and slide downstream. Not covered: lava streams (`wasted` rivers), frozen rivers, bog lakes (all stay still) and the world map.
The way the water runs comes from the data and the art, the ripples from the shader.

**Which pixels are river water: by colour, at build time.** `build/waterDryMasks.ts` serves a second virtual module,
`virtual:river-water-masks`, with the same data shape as the dry masks (§4.4b): one half-resolution mask cell per frame,
packed into one grey+alpha PNG. `riverMaskCore.ts` decides per pixel: opaque and `b > r + 40 && b >= g`. Measured on the art,
river and creek water is navy (about 16,48..64,96..128) and stream water cyan (about 64..80,144..160,160..192); grass, sand,
rock and cliff skirts are red- or green-led and fail it. The 0/1 map is closed (grow 1, shrink 1) to fill the pinholes of the
dithered render, then box-downsampled 2x2. Only the `_base` frames of these families get a mask:
`^(rivertile|bogcreek|boglake_mouth|sawmill|sawmillriver|sawmillbend|sawmillbend60|cropmill|hammerschmiede|riverbridge|bearrapids)(_|$)`
(`frozenriver*`, `lavastream*` and plain `boglake*` are not in it), and only when at least 50 full-resolution texels are water.

**Which way is downstream: from the data.** A river tile flows towards its `outDirection`; a `mouth` without one towards
`WorldModel.seaFacingDirectionOf`; a bog tile of kind `creek`, `creekspring` or `mouth` towards its `outDirection`. A hex
without an out direction does not flow. Inside the hex the flow is a **potential flow** solved over
the frame's painted water (`riverFlow.ts`), so meanders, the 60-degree loop, islands and Y confluences are followed as painted:

0. **Everything is solved on the ground.** The art is isometric: the top face is drawn `s = groundSquash` (about 0.531, 92 over 173.2) as tall as the ground it lies on. The potential, the direction, the distances and the crossing direction of an edge are therefore computed in ground space `(x, y / s)`. In screen texels the Laplacian is `phi_xx + s^2 phi_yy = 0` (vertical links conduct `s^2` as much); the flow direction is the ground velocity mapped back to the screen, `(-phi_x, -s^2 phi_y)`; fast marching and the bank-distance chamfer count a vertical step as `1/s`. "Texels" in the constants below are ground texels. The water crosses an edge along the line from the hex centre to the edge midpoint (the ground normal, projected), not along the screen perpendicular of the edge: on the four slanted edges the two are about 30 degrees apart, which showed as a diagonal band of the wrong direction on the seam.

1. Passable texels are those inside the hex top face, padded by one texel. Edges are polygon edge
   `(3 - index of the direction in TILE_ORIENTATIONS + 6) % 6` of the top face (`topFaceEdgeIndex`, shared with `riverPath.ts`);
   the in edges come from `inDirections` of the river or bog tile, the out edge as above.
2. Dirichlet seeds: the water texels within 2 texels of the water closest to an edge segment. The potential is 1 at the seeds of
   every in edge and 0 at the seeds of the out edge. Normally that water touches the edge; the river delta's canvas is trimmed a
   few texels short of it.
3. The potential is harmonic in between and has no flux through the banks: a link between two water texels conducts 1, a link that
   touches a dry texel `1 / NON_WATER_COST = 1/40`. That keeps the banks nearly closed walls, yet a bridge deck or a mill wheel
   that spans the whole channel (`riverbridge*`, `sawmill*`) still conducts, so the upstream half is not cut off, and the field
   does not leak across the grass neck of the bend60 loop. A hex without an in edge (a spring, a bog creek spring) has a uniform
   source on its water instead (`laplacian = -1`) and 0 at the out edge. Solved by red-black SOR (omega 1.9, stop when no texel
   moves by more than 1e-5), a few ms per frame; cells are cached.
4. The direction is `-grad` of the potential over water neighbours (central differences, one-sided at the bank), normalised. Inside
   a seed band the potential is constant, and the rim past the face is a dead end beyond it; both take the edge's crossing
   direction (its normal: out of the face at the out edge, into it at an in edge). The neighbouring hex sets the same normal on
   the same edge, so the two match exactly at the seam. Filling them from their neighbours instead (an earlier version) let the
   ends of the band against a bank take the bank's direction, which showed as off-colour spots along the seams.

Why a potential and not a geodesic distance (the first version): a distance field points sideways into the channel at the banks
and along the in edge, so the direction jumped at every hex seam, and it has a cut locus: upstream of an island the two
shortest-path families meet on a ridge whose end is a singularity (the full hue wheel in the debug view, streaks radiating from a
point). The potential has no cut locus, stagnation points sit on an island's shore, and because the boundary value is constant
along each edge crossing, the flow crosses every in and out edge perpendicular to it: the two hexes that share an edge agree
there, with no seam-specific **The ripple phase: the potential itself.** The potential `phi` (1 at the in edges, 0 at the out edge, constant in the seed
bands and in the rim past an edge) is the stream coordinate. Its contour lines cross the channel, bend round islands and
meanders and spread where the channel widens, and the water runs across them from high to low. The ripple phase per texel is
`theta = 2 pi * N * phi` with an **integer N per cell**: `theta` is then a multiple of 2 pi on every in and out edge, so the two
hexes at a seam agree there and the arms of a confluence agree with each other, with no seam-specific code (the rim past an edge is
handled below). `N = max(1, round(L / RIPPLE_WAVELENGTH_TEXELS))`
with `RIPPLE_WAVELENGTH_TEXELS = 12` (one tile width is about 100 texels of the half-resolution cell) and `L` the channel length:
the mean geodesic distance (no bank penalty) from the out edge seeds to the in edge seed texels. A cell without an in edge (a spring:
`phi` solves the uniform-source case) normalises `phi` by its maximum over the water first and uses the maximum geodesic distance
over the water as `L`. **Flat bands.** The potential is constant in the seed bands and the rim, so `theta` there would be a flat strip, and a crest passing through it would light a wide band along every seam. In the bands and the rim `theta` therefore runs on linearly past the edge line, `+-2 pi N / L` per texel of depth (up into the face at the out edge, down at an in edge): it is still 0 mod 2 pi on the edge line, and the two hexes of a seam continue each other's phase through it. The potential proper starts at the inner side of the bands, so its phase is shifted by what the bands used up (`(1 - phi) * rate * outDepth - phi * rate * inDepth`), which keeps the phase continuous where band and interior meet.

The flow direction (`computeRiverFlow`, the negative gradient of `phi`) is no longer drawn; it stays as the
reference the tests check the potential against.

The ripple texture (`RiverFlowLayer`, `computeRiverRipple`) is RGBA8 per frame cell: R,G = `cos theta`, `sin theta` `* 0.5 + 0.5`
(a filtering-safe encoding, unlike a wrapped phase, which would smear across the 2 pi jump), B the distance to the bank over `RIVER_CENTRE_TEXELS = 16` (0 at the bank, 1 in the middle; the shader fades the ripples out at the shore over the first quarter of it, the same 4 texels as before, and bows the crests with the rest, see below; a dry texel within 3 texels of an in or out edge segment is not a bank, because
the art's water stops a texel or two short of the top face edge and that rim would otherwise fade every seam to nothing), A 255 on the
water texels of the hex top face and of a 2-texel rim past its in and out edges (`FACE_PAD_TEXELS`), and all four 0 everywhere else,
dry texels inside the face included. Clipped exactly to the face, a cell left a strip along every seam without flow: the art's water
stops a texel or two short of the face edge, so what shows there is the neighbouring hex's skirt water. The rim carries the ripples
over that strip, and because the cell is transparent where it is dry, its own dry strip does not cover the rim of the cell next to
it. Past an edge the water does not cross there is no rim, so a river's skirt water is never drawn onto a neighbouring land hex.
Where two rims overlap, both continue the same phase, so it does not matter which is drawn last. Cells are cached per
`frame|out edge|in edges|fade edge` and drawn into one render texture over the water mask's rect, placed and sized exactly like the
dry mask cells (`MaskRenderTarget` is the shared drawing half), and bound as `uRiverFlow` with the same `vUV`. World mode, and the
time before the masks have loaded, bind a 1x1 texture of zeros.

**Lakes stay still.** A bog `boglake_mouth` hex joins a creek to a lake. Its flow fades away from the creek edge (the one of
in/out that is not a lake edge): the intensity is multiplied by `1 - smoothstep(0, half a hex width, geodesic distance from the
creek edge)` (the one place a geodesic distance remains: it is an intensity fade, not a direction).

**Arcs, not straight lines.** `theta` is 0 along the whole edge line, so with one phase for the whole width a crest would cross every seam as a straight line along the hex edge (and the contours meet an island's shore at a right angle, spokes). The shader lags the crests towards the banks: `theta' = theta + uRiverSpeed * uTime - uRiverArc * (1 - B)^2 * 2 pi`, `uRiverArc = 0.35` of a period. The middle of the channel (B = 1) is ahead, the banks lag, so a crest bows downstream in the middle. Both hexes of a seam have nearly the same B there, so the lag is near-continuous and the crest stays one arc across the seam. The direction cell (`computeRiverFlow`) keeps its 4-texel B.

**In the shader.** Painted river water is land as far as the water mask knows, so the river branch sits before the land
`discard`: where `!water` and the flow texture's alpha is set, the pixel is the river overlay (where its intensity B is above
0.01). The shader renormalises the filtered `(cos, sin)` pair and rotates it by time, `theta' = theta + uRiverSpeed * uTime`
(`cos theta' = cos theta cos d - sin theta sin d`). Because `phi` falls downstream, the crests (`theta' = 0`, i.e. `phi` decreasing
over time) move towards the out edge. The ripples fade in with `smoothstep(0, 4/16, B)`. A crest is `smoothstep(0.85, 0.985, cos theta')`, about a fifth of a wavelength wide, broken up
along the band by low-frequency world-space noise (`uRiverScale`, 6 cells per tile) so it reads as ripples and not stripes. Alpha is
`crest * broken * B * uRiverAlpha`, colour `uRiverColor` (light cyan-white). The speed is 0.8 periods per second; a period is about
an eighth of a tile (12 texels), the real length differs a little per cell because `N` is rounded.

**Styles.** The ripple arcs above are the default (`waterDebugFlags.riverStyle = 0`, uniform `uRiverStyle`). Two alternatives for comparison are in the debug panel's "River style" select, drawn by the same `riverOverlay` from the same texture (the phase on its circle for moving along the stream, B as the cross-stream coordinate, ground noise to hide the per-wavelength repeat): 1 *toon strands* (long light and dark strands along the flow, curly white foam where B is small, sparkles) and 2 *cartoon bands* (a lighter shallow band along each bank with a wobbly inner edge, large see-through lobed patches, short glints stretched along the flow, whose direction comes from two extra taps of the flow texture, `uRiverUVPerWorld`). They are not shipped looks.

`showRiverFlow` (debug) replaces the ripples with the static phase: hue is `theta`, brightness the intensity. It is how to check
that the bands cross the channel and are continuous across hex seams.

ould.

### 4.4 Uniforms

```
sampler2D uWaterMask
sampler2D uWaterTaint              taint field (§4.4c), single channel
sampler2D uWaterNoFoam             river-mouth no-foam field, single channel; foam *= 1 - it
sampler2D uWaterDry                art dry mask (§4.4b), render texture over the mask's rect; alpha is the mask; caustics and foam *= 1 - it
sampler2D uRiverFlow               river flow field (§4.4d), render texture over the mask's rect; rg cos/sin of the ripple phase, b intensity, a where the hex has flow (its top face plus a 2-texel rim past the in and out edges)
float uRiverStyle                 0 ripple arcs, 1 toon strands, 2 cartoon bands (debug panel); vec2 uRiverUVPerWorld flow texture UV per world unit
float uRiverFlowOn, uShowRiverFlow 0/1: the ripples; debug: colour the river by ripple phase
float uRiverSpeed, uRiverArc       ripple phase rotation, radians per second; periods the crests lag at the banks
float uRiverAlpha, uRiverScale;  vec3 uRiverColor   crest opacity; crest-break noise cells per world unit; crest colour
vec3  uTaintShallowColor, uTaintDeepColor, uTaintFoamColor
float uTime, uWaveTime            base clock; wave clock, scaled by waveSpeed
float uSeaBody, uMidWaterWaves, uShorelineFoam, uCaustics   0/1
float uShowMask                   debug: render the mask channels raw
vec3  uShallowColor, uDeepColor   sea body ramp (world mode only)
float uSeaMottle, uMottleScale
vec3  uWaveColor;  float uWaveAlpha;  vec2 uWaveCoastFade;  float uWaveScale
float uCausticScale, uCausticBands, uCausticWidth, uCausticAlpha; vec3 uCausticColor
float uCausticCull                keep-off distance from shore, in tile widths
float uCausticCullSoften          antialiasing on that cut, not a fade
float uCausticCullSpread          spread of the per-ribbon keep-off distance
float uCausticFine                0/1: the fine highlight net (§4.2c)
float uCausticFineScale, uCausticFineBands, uCausticFineWidth, uCausticFineAlpha
vec3  uCausticFineColor
float uCausticBlobs               0/1: the drifting shadow blobs (§4.2c)
float uCausticBlobScale           reciprocal of the blob cell size
float uCausticBlobDensity         fraction of cells carrying a blob
float uCausticBlobAlpha;  vec3 uCausticBlobColor
float uFarReach                   what G is normalised over, so G decodes to tiles
vec3  uFoamColor
float uFoamWidth                  water-side reach, in tile widths
float uFoamInner                  plateau, as a fraction of the width
float uFoamLandReach              land-side reach, as a fraction of the width
vec2  uFoamAlpha                  inner line, outer lace
float uFoamNoise                  edge displacement, in tile widths
float uFoamNoiseScale, uFoamSurge, uSurgeRate;  vec2 uFoamWind
vec2  uCoastRange                 the mask's two ramps, in tile widths, so the
                                  shader can work in one signed distance
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
  /** The whole layer. */
  water: boolean;               // default true
  /** The water's surface pattern — caustics close, wave arcs far (§4.2/§4.2b). */
  midWaterWaves: boolean;       // default true
  /** Debug: draw the caustics on the world map too, to judge both idioms at one scale. */
  causticsEverywhere: boolean;  // default false
  /** The coarse caustic net — the base surface pattern of §4.2b. */
  coarseCaustics: boolean;
  /** The second, finer caustic net over the first (§4.2c). */
  fineCaustics: boolean;
  /** The drifting dark blobs under the caustics (§4.2c). */
  causticShadows: boolean;
  /** Shader shoreline foam (§4.3). */
  shorelineFoam: boolean;       // default true
  /** Shader sea body under the world map (§4.1); off → the CSS gradient shows through. */
  seaBody: boolean;             // default true
  /** The world map's Graphics wave squiggles (waveLayer) — its surface pattern of record. */
  legacyWaveSquiggles: boolean; // default true
  /** Debug: render the water mask's channels instead of water. */
  showWaterMask: boolean;       // default false
  /** The moving ripples on river, stream and bog-creek water (§4.4d). */
  riverFlow: boolean;           // default true
  /** Debug: colour river pixels by flow direction (hue) and intensity (brightness). */
  showRiverFlow: boolean;       // default false
  /** §3.3's code-side split of the unsplit tall art. Off reproduces the artifact it fixes. */
  legacyTileSplit: boolean;     // default true
}
export interface WaterDebugTuning {
  foamWidthHexes: number;  // 0.3 — the band is in world units, so this is sized
                           //       against the settlement view, not the world map:
                           //       the 0.5 this plan first specified washes whole
                           //       coastal hexes white up close.
  foamSurge: number;       // 0.18 — well under half; the surge is meant to be
                           //        felt rather than seen.
  waveSpeed: number;       // 1
  causticCullHexes: number; // 0.25 — the *closest* a ribbon may come to shore;
                            //        each one takes its own distance from here
                            //        up to + CAUSTIC_CULL_SPREAD_TILES
                            //        (§4.2b); clamped to FOAM_REACH_TILES, past
                            //        which the far channel is saturated and the
                            //        handle is inert.
  // Three per net, all multipliers on the shipped constants so 1.00x is what
  // ships and either direction is a comparison against it. They started shared
  // across the two nets, on the reasoning that the fine one is *defined* by
  // being thinner and brighter and that one handle preserves that at every
  // setting — true, and it also made the relationship the one thing that could
  // not be adjusted, which is most of what there is to tune once both exist.
  causticThickness: number;      // 1
  causticBrightness: number;     // 1
  causticDensity: number;        // 1 — band count, i.e. ribbons per unit of
                                 //     water. Orthogonal to thickness by
                                 //     construction: the band count sets the
                                 //     spacing between contours and the shader
                                 //     measures ribbon width as a distance in
                                 //     field space, not as a fraction of it.
  causticFineThickness: number;  // 1
  causticFineBrightness: number; // 1
  causticFineDensity: number;    // 1
  causticFinePhase: number;      // 17s — see §4.2e.
  riverBrightness: number;       // 1 — multiplier on the river ripples' opacity (§4.4d)
  riverSpeed: number;            // 1 — multiplier on the river ripples' speed (rotation of the ripple phase)
  riverArc: number;              // 1 — multiplier on how far the crests lag at the banks (0 = straight crests)
  // None of the seven touches the shadow pools. Brightness would darken the
  // water if it did, and the pools' density is a level in a field, not a count.
}
```

`legacyWaveSquiggles` defaults **on**, and it is the world map's surface pattern:
the squiggles are crisp Graphics strokes on their own layer, which
`worldLayerOrder` places *above* the water mesh, so they draw over the shader's
sea body and foam rather than under them. The two wave systems never
double-draw — with this on, `WaterLayer.tick` stops the shader drawing its own
arcs in world mode. Turning it off is the A/B against
`docs/design/img/worldmap.png` that decides whether the shader's arcs could ever
replace them. Settlement mode is untouched either way: the squiggle layer is
world-only, and up close the surface pattern is §4.2b's ribbons.

A new `components/hud/WaterDebugPanel.vue` sits alongside `FogDebugPanel`,
mounted by **both** `SettlementView.vue` and `WorldMapView.vue` under
`?debug=1` — reusing `composables/useFogDebug.ts`'s session-persisted flag
rather than adding a second debug switch (it already survives internal
navigation, which is the whole reason it exists — see its header).

---

## 6. Things the mask gets right for free

- **Rivers** are land hexes with their own art (`riverBase`/`riverTop`); they
  are `isLand` true, so no foam appears along a riverbank and no waves appear
  on a river. Correct by construction, and deliberately so — the river water
  itself is painted. The only thing the shader adds to it is the moving ripples
  of §4.4d, drawn in the land branch of the fragment shader.
- **Coastal water tiles** keep their painted shoreline in the settlement view;
  the shader's foam animates *over* it, anchored to the same coastline,
  because both derive from the same `isCoastalWater`/`isLand` terrain.
- **Fishing huts and dockyards** stand on coastal water
  (`WorldModel.ts:536`) — the one place a building sits where foam is drawn.
  `fishinghutbuilding` is flat-topped (0px above the top face, §3.3), so it
  needs nothing; `dockyard` rises 25px and is covered by §3.3's code-side
  split until it gets a real one.

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
- the mesh is hidden entirely under `deepFogOnly` and in preview mode (§3.6);
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
  `world.children` is above `terrainBase` and below `terrainTop` in settlement
  mode, and below `terrainFlat` in world mode. This is the regression test for
  the whole of §3, and it is testing our stack, not a third-party library.
- **A mask/art alignment test** — §3.4's property stated as an assertion:
  `isoPixelToAxial` of a point just inside a hex's `isoTopPoints` polygon
  returns that hex, and of a point in its skirt returns the hex in front. This
  is the invariant that keeps foam on the painted coastline; it is cheap and it
  fails loudly if the tile geometry constants ever move.
- **A legacy-split test** — `splitLegacyTexture` cuts at `TILE_ART_TOPFACE_Y_FRAC`
  and the two pieces' native offsets/heights sum back to the whole tile, so the
  halves abut exactly rather than overlapping or leaving a gap; and every key in
  `LEGACY_TALL_KEYS` routes a top piece into `terrainTop` while a split family
  (`grass`, `forest`) still takes the ordinary path. This is the test that goes
  green-and-then-deletable when the art split lands.

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
5. **Settlement view** — insert the mesh between `terrainBase` and
   `borderLayer`, plus §3.3's code-side legacy split. Verify against a coastal
   mountain and a coastal dockyard; re-check that sea↔land occlusion at the
   shoreline is byte-for-byte what it was (nothing is reordered, so it should
   be). Delete the table when the legacy art split lands.
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
- **Legacy art split.** The whole `hextiles/` root set is pending a base/top
  split (§3.3); of it only `mountain`, `magictower`, `towerbuilding` and
  `dockyard` actually stick up. When it lands, `LEGACY_TALL_KEYS` empties and
  `splitLegacyTexture` and its routing branch delete with no behaviour change —
  they were emulating that split all along. When it lands, §3.3's interim
  overhang table should go to zero and be removed — worth linking this issue
  from that work so it isn't left behind as dead code that looks load-bearing.
- **Mask resolution at low zoom.** `MASK_TEXELS_PER_TILE = 8` is a guess sized
  against a half-hex foam band. If foam looks blocky when zoomed in on a
  settlement, the honest fix is more texels per tile there, not more blur.

## 11. Spike findings

A throwaway spike (`lib/map/water/waterSpike.ts` plus its renderer hook, both
marked SPIKE and meant to be deleted before phase 1) put a garish hard-edged
version of this design into the real renderer to test the three load-bearing
claims above. All three were checked on screen, in both views.

**§3.4's alignment claim holds.** With the mask baked through
`isoPixelToAxial`, the foam band traces the painted coastline exactly — every
notch and concavity of the sand ring — in the settlement view and on every
island on the world map. No half-tile offset, and none of the fudge factors
that would have been needed if the claim were wrong. The settlement view also
confirmed the mechanism: along the coast there is no visible land skirt at all,
because the water tiles in front cover it, exactly as §3.4 argues.

**§3.3's overhang artifact is real, and the fix for it changed.** A
`magictower` (102px) placed on a coastal hex with sea to its north has its
spire and battlements washed over by the water layer, while its base — the
part on the top face — is untouched: precisely the predicted failure mode.
Seeing it also killed this plan's first answer to it (per-hex suppression),
for the reasons in §3.3, and the code-side split replaces it:

- **The split fixes the tower** — spire clean, base unchanged.
- **And it is visually a no-op otherwise.** With the water layer off, turning
  the split on changes 875 pixels of a 1440×900 frame (0.068%), all inside the
  tower's own tile, 93% of them by ≤7/255. At 6× magnification the two are
  indistinguishable: no seam at the cut, no gap, no doubled row. The residual
  is resampling — two sub-sprites scaled from 200px-wide art to 168px land on
  a slightly different sampling grid than one.

**Why it works is layer order, not a measurement.** In settlement mode
`terrainTop` is added to `world` *after* the water mesh (§3.3's stack), so
anything routed there draws above it, by construction. The split does not make
the art shorter; it moves the overhanging part into the layer that is already
above the water. Nothing about that depends on how tall the art is.

**A control that did not control anything.** An earlier pass tried to
demonstrate the same point from the other side, by finding already-split art on
a coastline and showing the water layer never touches it. It used
`top/foresttile_*` on the strength of a 139px raw-bbox reading, which is a
stray near-transparent row: the real figure is 48px. At 48px — 0.52 of a 92px
row pitch — a forest's trees barely reach the diagonal up-neighbour's edge at
all, so the screenshot showed nothing either way and was not evidence of
anything. `magictower`'s 1.11 rows is the only overhang in the pack that
reaches well past its own hex, which is why it is the case worth testing and
the before/after above is the real evidence.

**Two things the spike changed our mind about:**

- **Mask resolution.** The binding constraint is `MASK_MAX_TEXELS`, not
  `MASK_TEXELS_PER_TILE` — at a zoomed-out settlement view the clamp bites and
  the distance contours visibly stair-step. The innermost contour (where foam
  lives) is still crisp, so foam is fine; but §4.2's wave coast-fade reads the
  field at d ≈ 0.3–0.55, out where the stepping shows. Either raise the clamp
  or smooth the fade — worth deciding before phase 3 rather than after.
- **Foam under fog is louder than expected.** §3.2 puts the water mesh under
  both fog quads, so foam is correctly veiled — but foam is far higher-contrast
  than terrain, so a fogged island's coastline reads as a bright rim through
  mist that its terrain barely shows through. Not an information leak (the
  terrain is visible through the same mist) but it does redirect the eye to
  unexplored coastlines. Worth tuning foam alpha against the fog rather than
  assuming the layer order settles it.

The approximate chamfer distance transform the spike used also showed its
seams as faint radial streaks along the coast. That is a property of the
3-4 chamfer, not of the design — §2.3's exact two-pass euclidean transform is
what phase 1 should implement, and the spike is the reason to not treat that
as an optimisation to skip.

