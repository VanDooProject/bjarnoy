# Viking Realm — game concept & UI decisions

Working notes for the browsergame. Everything below is either a decision taken in the briefing
round or a mechanic the mockups assume. Mockups live in `Viking Realm.dc.html`.

## 1. Decisions from the briefing

| Topic | Decision |
|---|---|
| Screens in scope | Landing page · Settlement/map view (main game) · World map |
| Platform | Desktop-first, mobile later |
| Language | English |
| UI chrome | Minimal dark glass overlay + flat slate panels — no wood/rune texture. The isometric tiles carry all the character. |
| Realm borders | Variants to compare: hex-edge outline · banner poles + tinted ground · soft colour wash |
| Resources | Wood, Stone, Food, Iron (four, Travian-style) |
| Hex interaction | Hover = stats tooltip · Click = full-screen building screen |
| Landing hook | Instant play: one nickname field → straight into a starter island, register later |
| World map | Hex-based, same lattice as the settlement view |
| Real-time elements | Build queue countdowns · incoming attack timer · live resource tick · troop movements · ship voyages |

## 2. Core mechanics assumed by the mockups

**Time.** Real time, always running. Nothing is turn-based. Production ticks per second,
construction and travel resolve on wall-clock timers.

**World.** One shard = an archipelago of islands. Each island is a cluster of hexes. Several
players can settle on the same island; they compete for the free hexes between them.

**Settlement.** A settlement is a longhouse (main building) plus the hexes it controls.
Each hex holds at most one building. Buildings have levels; the tile art changes with the level.

**Realm borders (Settlers 2 style).** A settlement radiates control over surrounding hexes.
Border radius grows with longhouse level and with border-anchoring buildings (watchtower).
Only hexes inside your border can be built on. Borders of two players on one island push
against each other — the stronger claim (nearest / higher anchor level) owns a contested hex.

**Expansion.** New settlements are founded by loading settlers onto a longship and sailing to a
free hex on any island. Voyages take real time and are visible to everyone on the world map.

**Resources.** Wood (forest hexes), Stone (mountain hexes), Food (farms, fishing huts),
Iron (mine on mountain hexes). Rates are per hour, displayed live per second in the HUD.
Storage caps apply; overflow is wasted.

**Military.** Troops are trained in the settlement, move over land inside an island and by ship
between islands. Attacks are announced by a countdown for the defender. Raids take resources,
conquest requires a chieftain and lowers the target's loyalty.

**Onboarding.** No registration wall. Nickname → the server places a starter island with a
level-1 longhouse → the player builds for a few minutes → e-mail/password is requested when the
first result is worth saving (or before the first attack can reach them).

## 3. Art assets

`uploads/hextiles/` — isometric hexes, 200×300 px PNG, six camera rotations
(`E, NE, NW, SE, SW, W`). The mockups use `SE` throughout.

- Root files are composited (ground + props).
- `base/` is ground only, `top/` is the prop/building layer — for tiles that need custom stacking e.g if a realm border is behind a forest
- `_levelNNN` suffixes are building stages, `_variantNNN` are visual variants of the same tile.

**Lattice geometry** (measured from the PNGs): the top face is a hexagon 200 wide × 92 tall,
its top edge starts at y=140 in the image. Neighbour offsets are therefore
`dx=±150, dy=∓46` (diagonals), `dy=±92` (up/down) — an odd-q offset grid. The world map uses
the same lattice with flat 2D hexes, so both views read as the same space at different zoom.

## 4. Fog of war, as implemented

The decision table above says "unexplored hexes are hidden; scouted but not currently-visible
hexes are greyed out." The mockup itself (`fogAt()` in `Viking Realm.dc.html`) renders this as
one continuous white-mist gradient whose opacity grows with distance from your line of sight —
there's no hard line between "hidden" and "greyed out" in the prototype's own math. The live
implementation (`src/frontend/src/lib/map/HexMapRenderer.ts`) instead draws it as two distinct,
named tiers, matching the decision table's own wording more literally:

| Tier | Radius (from settlement centre) | Look | Constant |
|---|---|---|---|
| Visible | `borderRadius + 1` | Clear — full tile art, no overlay | — |
| Scouted, not visible | out to `borderRadius + 3` | Terrain still drawn, dark tint over it | `FOG_SCOUTED` (`0x0b1116`, ~55% alpha) |
| Unexplored | everything past that | Terrain is *still drawn* underneath; white mist fades in over it | `FOG_UNEXPLORED` (`0xe9f0f4`, 10–90% alpha) |

**Rendering.** The mockup's own `fogAt()`/`fogs` (Viking Realm.dc.html) never fills a hex-shaped
polygon at all — every fogged hex gets one large soft circular blob (a blurred radial gradient,
oversized relative to the hex, jittered off-centre) that spills into its neighbours; overlapping
blobs is what makes the mist read as continuous cloud instead of tiled hexes. An earlier version of
this implementation drew fog as one flat-colour polygon fill per hex on a blurred `Graphics` layer,
which (no matter how much blur was layered on) still had a visible hex-tiled edge, since the
underlying shape was still the hex boundary. `HexMapRenderer.rebuildBordersAndFog` now matches the
mockup's own approach: one pre-rendered soft-circle texture (a `FillGradient` baked to a
`RenderTexture` once at startup) reused as a pooled `Sprite` per fogged hex (`fogBlobLayer`),
tinted/sized/alpha'd/jittered per hex and blurred as a group (`BlurFilter`) — both the dark scouted
tint and the white unexplored mist use this same blob mechanism, just with different tint/alpha.
Sprites sharing one texture batch into very few WebGL draw calls, so this reads as at least as cheap
as the old per-hex `Graphics.poly().fill()` approach it replaced.

Unlike the scouted tier, the unexplored tier is **not** a hard cutoff. Terrain sprites are drawn
for every hex the camera can see regardless of exploration state (`rebuildTerrain` no longer skips
unexplored hexes), and the mist's alpha ramps from ~10% right past the scouted ring up to ~90% over
the next `FOG_MARGIN_HEXES` (10) hexes (`WorldModel.distanceBeyondExplored` + the same constant the
initial-zoom calc below uses). So the fringe of unexplored ground reads as terrain rolling into
mist, not a wall of white with nothing behind it — closer to the mockup's own continuous `fogAt()`
gradient than a binary hidden/visible split, while still keeping the two named tiers the decision
table calls for.

Past `FOG_TERRAIN_CULL_HEXES` (`FOG_MARGIN_HEXES` + `FOG_CULL_HEADROOM_HEXES`, a safety margin past
the ramp's own saturation point) both the terrain and the fog switch to a cheap flat path:
`rebuildTerrain` stops drawing sprites there (nothing would show through fully opaque mist anyway)
and `rebuildBordersAndFog` paints a plain, unblurred solid-white fill at a literal `alpha: 1` instead
of a blob — this is the only thing that actually *guarantees* full opacity (blobs alone are
individually capped below 1 and rely on overlap to read as solid, which can leave faint gaps right
at the edge of what's rendered) — and it's also what keeps a fully-zoomed-out view cheap, since most
of the visible area at that zoom sits past this distance. Blobs keep being placed (at flat, fully
opaque alpha) `FOG_BLOB_OVERLAP_HEXES` past this hand-off point too, overlapping the flat fill's own
territory, so the blob layer's `BlurFilter` always has real neighbouring content to blend the
outermost blobs into instead of fading at the edge of its own content right next to the flat fill's
hard, unblurred edge — without that overlap the two zones met at a visible (if fainter) hex-stepped
seam of their own. Deriving the cull distance from the ramp's own saturation point (rather than an
independent constant) is what keeps terrain sprites and fully-opaque fog aligned — previously they
used unrelated distances, so terrain vanished before the fog above it was actually fully opaque,
leaving a visible seam on a far pan.

`distanceBeyondExplored` is a hex-distance to the settlement, which is a perfect hexagon ring — with
the old polygon-fill approach this made the mist's inner edge read as a crisp hex-shaped cutout
unless deliberately roughened with per-hex noise. The blob approach doesn't need that: since each
hex's mist is a jittered, oversized, blurred circle rather than a hex-aligned fill, the aggregate
boundary is irregular and cloud-like by construction, matching the mockup's own non-hex-aligned look.

The unexplored tier is recomputed for whatever the camera can currently see (`visibleCoords()`'s
cull, not a fixed world boundary), so it keeps covering new ground as far as the camera pans in
any direction — the map has no edge. The initial camera zoom (`zoomForFogMargin`) is chosen so at
least 10 hexes of unexplored fog are visible past the settlement's scouted ring on every side
*without panning first*, so a new settlement reads as a clearing in a foggy, unbounded world from
the first frame rather than a bounded island that only turns out to be foggy once you go looking
for the edge.
