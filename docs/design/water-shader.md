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
| Surface pattern | **Two idioms, one per view**: caustic ribbons close up (settlement), the prototype's scattered wave arcs from orbit (world map). Decided during implementation, against reference art — §4.2b. |

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
| **R** | The **signed** near distance from the coastline, `0.5 + d / (2 * NEAR_SPAN_TILES)`. 0.5 is exactly the coastline, below it is land, above it is water. |
| **G** | Unsigned distance from the nearest land, normalised over `FOAM_REACH_TILES` — the far field, which is all §4.2's wave coast-fade needs. |
| **B** | Per-hex pseudo-random seed, exactly as fog v2's B channel does (`demoFogMask.ts`'s `noiseSeed`) — per-hex variation in wave phase and foam ruggedness so the coast isn't uniform. |
| **A** | Water coverage: `255` water, `0` land. Used **only** by the raw-mask debug view. |

**Nothing branches on A**, and that is the point. An earlier version stored two
unsigned distances (outward and inward) and had the shader pick between them on
`A >= 0.5`. A 0/255 step sampled with linear filtering is a *texel-quantised*
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

- **Ragged edge**: the distance is perturbed by a world-anchored, slowly
  drifting fbm, at an amplitude expressed as a **fraction of the band's own
  width**. Absolute amplitudes do not survive a width change — an amplitude
  that is a gentle wobble on a wide band erases a narrow one entirely.
  World-anchored for the same reason fog's cloud field is: so the pattern
  neither stretches with world size nor slides under a camera pan.
- **Surge**: the band's width breathes, `width = FOAM_WIDTH * (1 + FOAM_SURGE *
  sin(t * SURGE_RATE + lowFreqNoise(p) + seed))`. The low-frequency term
  de-synchronises the surge along a coastline so it laps rather than pulsing
  as one ring; the mask's B seed adds per-hex grain on top.
- **Two tiers**: a nearly-opaque inner line on the plateau, and a wider
  thresholded-noise outer lace at lower alpha. The inner line is what makes the
  coast read as wet; the lace is what makes it read as foam.

### 4.4 Uniforms

```
sampler2D uWaterMask
float uTime, uWaveTime            base clock; wave clock, scaled by waveSpeed
float uSeaBody, uMidWaterWaves, uShorelineFoam, uCaustics   0/1
float uShowMask                   debug: render the mask channels raw
vec3  uShallowColor, uDeepColor   sea body ramp (world mode only)
float uSeaMottle, uMottleScale
vec3  uWaveColor;  float uWaveAlpha;  vec2 uWaveCoastFade;  float uWaveScale
float uCausticScale, uCausticBands, uCausticWidth, uCausticAlpha; vec3 uCausticColor
vec3  uFoamColor
float uFoamWidth                  water-side reach, in tile widths
float uFoamInner                  plateau, as a fraction of the width
float uFoamLandReach              land-side reach, as a fraction of the width
vec2  uFoamAlpha                  inner line, outer lace
float uFoamNoise                  edge displacement, as a fraction of the width
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
  /** Shader shoreline foam (§4.3). */
  shorelineFoam: boolean;       // default true
  /** Shader sea body under the world map (§4.1); off → the CSS gradient shows through. */
  seaBody: boolean;             // default true
  /** The pre-shader Graphics wave squiggles (waveLayer). Kept for A/B against docs/design/img/worldmap.png. */
  legacyWaveSquiggles: boolean; // default false
  /** Debug: render the water mask's channels instead of water. */
  showWaterMask: boolean;       // default false
  /** §3.3's code-side split of the unsplit tall art. Off reproduces the artifact it fixes. */
  legacyTileSplit: boolean;     // default true
}
export interface WaterDebugTuning {
  foamWidthHexes: number;  // 0.3 — the band is in world units, so this is sized
                           //       against the settlement view, not the world map:
                           //       the 0.5 this plan first specified washes whole
                           //       coastal hexes white up close.
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

