# Lakes, lake ore and the Hammerschmiede

Status: **planned**, not in the game yet. See `economy.md` §8 for why iron
comes from lake ore, and §11 (roadmap) for where this sits.

## The plan

- **A lake tile, guaranteed on every island** (like a mountain), connected
  to the river network: at least one river leaves each lake towards the
  sea, and river springs may start at a lake. Whether a lake is one hex or a
  small cluster (3 or 7 hexes) is decided with the art.
- **Lake-ore works** on the lake: the iron producer, unlocked at LH 6 so it
  is in reach when units start costing iron. Viking-age iron came from ore
  that forms in fresh water and wet ground (lake ore, *Seeerz*, Swedish
  *sjömalm*; bog iron, *Raseneisenerz*), raked up from boats and smelted on
  the shore in a clay furnace (*Rennofen*). Sea water doesn't form it.
- **Hammerschmiede** (water-powered hammer mill) on a **river only**, never
  on the lake: the iron boost building, like the Sawmill for Lumberjacks,
  unlocked at LH 20 behind lake-ore works level 10.
- **Lakeshore Fisher Hut:** the same building as the coastal Fisher Hut,
  with its own art.

The art is made by the maintainer in `VanDooProject/3D_assets` and shipped
through `bg_assets_hextile`; agents build and preview, but don't render for
shipping or push art (see that repo's `AGENTS.md`).

## Agent prompts

Two ready-to-use prompts: **A** for the art (`VanDooProject/3D_assets`) and
**B** for the game (this repo). B needs A's tile names, so run A first, or
let B use placeholder art until A's families are rendered and vendored.

## A. Art — 3D_assets

> Read `AGENTS.md`/`CLAUDE.md` first, then `docs/environment-setup.md`,
> `docs/river-tiles.md` (all of it: the edge profile, the three bend
> shapes, junctions, springs, the delta, traps), `docs/3d-design-guide.md`,
> `docs/color-palette.md`, `docs/level-splitting.md` and
> `docs/orientation-weights.md`.
>
> **Goal: a lake tile family for the game's islands, plus three buildings.**
> Iron in the game comes from lake ore (Seeerz, Swedish *sjömalm*): bog-iron
> ore that forms on the bottoms of freshwater lakes and was raked up from
> small boats, often through winter ice, then smelted on the shore in a
> small clay furnace. One lake is guaranteed on every island, and it is
> connected to the river network.
>
> **1. Lake terrain tiles** (a new base library, like the river base
> library; follow `scripts/split_river_base.py` / `split_water_base.py` as
> the pattern for a non-grass ground):
> - A **plain lake hex**: open fresh water with a reedy, sandy/peaty shore
>   ring, clearly different from the coastal sea (no surf, darker, calmer,
>   greener shallows). Decide, and write down in a new `docs/lake-tiles.md`,
>   whether a lake is a single hex or a small cluster (e.g. 3 or 7 hexes).
>   If it is a cluster, it needs edge pieces that join lake-to-lake
>   seamlessly, the way the wall and river sets hand over at shared edges.
> - **Lake + river joins**: a lake edge where a river leaves or enters. It
>   must hand the river over at the exact river edge profile (0.387 wide,
>   centred on the edge midpoint, water at z = 0.78, the same channel
>   cross-section and sand bed). Cover at least an outflow on one edge and
>   an outflow plus an inflow on two edges; say which edge pairs are needed
>   for every rotation, as `docs/river-tiles.md` does for bends.
> - A **spring lake** variant: a lake with only an outflow, as the source of
>   a river (a lowland alternative to the mountain springs).
>
> **2. Lake-ore works** (building on a lake hex; the iron producer): a
> small timber jetty with a flat-bottomed boat and a long-handled ore rake,
> heaps of rust-brown ore lumps on the shore, a squat clay bloomery furnace
> (Rennofen) with a thin smoke plume, and a charcoal stack. It needs
> cumulative `levelNNN` stages (a construction stage plus about 4 levels),
> growing from one boat and a heap to a jetty, two boats, a roasting pit
> and the furnace. The smoke is an `anim_*` part (see `scripts/build_meadery.py`
> for an animated plume). It stands on the lake, so the submerged parts must
> be rooted into the lake bed the way the coastal buildings are
> (`hextile024_dockyard`, `hextile052_njordshrine`).
>
> **3. Lakeshore fisher hut** (the same game building as the coastal Fisher
> Hut, with its own art): a small fisherman's hut on a lake shore, with a
> rowing boat, drying racks and nets, about 5 levels like the coastal one.
>
> **4. Hammerschmiede** (a water-powered hammer mill; the iron boost
> building, **river only**, never on the lake): a timber mill house with an
> undershot water wheel in the channel, driving a trip hammer on an anvil
> block, and bellows. The wheel is a rotating part (`anim_drive = "rotate"`,
> see `scripts/build_cropmill.py`); the hammer's rise and fall is a keyframed
> part. Build it for the straight river shape first (the Crop Mill's
> constraint), then bends if they read well. About 5 levels.
>
> **Process:**
> - Design the silhouettes on Opus/Fable or as a Claude Design three.js
>   prototype first. Sonnet only ports settled geometry.
> - Put the palette block from `docs/color-palette.md` into every design
>   prompt.
> - Render previews with `scripts/render_with_bpy.py` (16 samples).
> - Rate the six rotations and add rows to `docs/orientation-weights.md`.
> - Document each file in `docs/asset-inventory.md`.
> - Open a PR labelled `render-preview`, and list which tiles need the
>   maintainer's full render. Do not render for shipping, pack atlases or
>   push to `bg_assets_hextile`: the maintainer does that by hand.

---

## B. Game — bjarnoy

> Read `CLAUDE.md`, `docs/design/economy.md` (§2 Resources and §8 Iron:
> lake ore) and `docs/design/river-generation.md`, then the river code:
> `World/RiverGenerator.cs`, `RiverTile.cs`, `TerrainSampler.cs`,
> `WorldGenerator.cs`, the `src/shared/river-*-golden.json` goldens, and the
> frontend's river art lookup (`textures.ts` `riverArtFor`).
>
> **Goal: lakes as terrain, the lake-ore iron building, and the
> Hammerschmiede.**
>
> 1. **Lake terrain.**
>    - World generation places **exactly one lake per island** (or one
>      cluster, matching whatever the art in `docs/lake-tiles.md` settled
>      on), reachable from the island's likely start area, the same
>      guarantee idea as a mountain.
>    - Rivers connect to it: at least one river leaves the lake towards the
>      sea, and river springs may start at the lake. Keep the backend
>      (C#) and frontend (TS) river generation byte-identical via the
>      shared goldens; regenerate them with the repo's tooling.
>    - Lakes aren't buildable land. A lake hex can take only the lake-ore
>      building.
> 2. **Lake-ore works** (new BuildingType): the iron producer. Most units
>    cost iron (economy.md §8), so this has to be in reach by about LH 6.
>    - Stands on a lake hex only (like `RequiresCoastalWater`, but for
>      lakes).
>    - Unlock at **LH 6**, no feeder building, and use the producer formulas
>      from economy.md §3. Pick an iron P₁ that makes the first iron units
>      affordable at the rate economy.md §8 describes.
>    - Terrain boost: +10% per neighbouring lake or river hex, capped like
>      the others.
> 3. **Hammerschmiede** (new BuildingType): a radius-boost building exactly
>    like the Sawmill and Crop Mill.
>    - **River hexes only**, with shapes limited to the ones that have art.
>      Never on a lake.
>    - Unlock at LH 20 with a feeder of lake-ore works level 10. Max level 20.
>    - Boosts lake-ore works within range; same percent and range curve as
>      the mills.
> 4. **Fisher Hut on lakes.** The (merged) Fisher Hut may also stand on a
>    lake-shore hex, using the lakeshore art from part A.3.
> 5. **Iron and units.** Rework unit costs and unit Longhouse gates to
>    economy.md §8: the Thrall costs no iron, every other unit does, and
>    unit unlocks follow the new building ladder (Barracks LH 5, Archery
>    Range LH 9, Dockyard LH 8, Cart Workshop LH 10). Run the admin
>    Economy lab (`/admin/economy`) to check that iron income and unit
>    unlocks line up, and put the numbers in the PR.
> 6. **Art.** Wire the families from the 3D_assets work into
>    `textures.ts`/`buildingArt.ts` once they are vendored. Until then, use
>    a clearly marked placeholder and say which families are missing.
>
> Tests: worldgen guarantees (every island has its lake, the lake connects
> to a river), placement rules for both buildings, the boost, and the unit
> cost and gate changes. Open a PR with the Economy lab screenshots.
