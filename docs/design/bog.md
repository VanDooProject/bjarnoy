# Bogs, bog ore and the Hammerschmiede (game side)

Status: **implemented**: bog terrain, creeks and lakes (bog PR), the bog buildings, the lake
props and the landing-spot rule (bog buildings PR). The art was built in
`VanDooProject/3D_assets` as the **bog set** (PRs #115, #116; design
session: https://claude.ai/code/session_01KeZX9kzmCwKuGbwBo4BEBo). Its
contract, the tile list and the map rules live in that repo's
`docs/bog-tiles.md`, which is the source of truth. This page covers only what the game has to do
with it. For why iron comes from bog ore, see `economy.md` §8; for where
this sits among the open work, see §11 there.

## What the bog set provides

| Tile | What it is in the game |
|---|---|
| `bog` (moss ground, several decorated variants) | a new land terrain with its own base tile (its own `Terrain` value, not a grass variant) |
| `bogcreek`, `bogcreek_bend`, `bogcreek_spring` | creeks: water crossings on bog ground with a river's profile, so they join rivers seamlessly. They do **not** count as rivers for the Sawmill or Crop Mill: those buildings' art has grass banks, which don't match bog ground. The **Hammerschmiede** does stand on a bog creek (below). |
| `boglake`, `boglake_inlet`, `boglake_shore`, `boglake_half`, `boglake_mouth` | bog lakes: open water plus shore tiles with 1, 2 or 3 water edges |
| `bogoreworks` | **Bog-ore works**, the iron producer (7 levels: diggings to bloomery) |
| `fisherhut_lake` | the **Fishing Hut** on stilts on a half-shore: the same building as the coastal one, with lake art |
| `claybrickworks` (existing, re-rendered) | **Clay Brickworks** now stands on bog ground; the grass version is dropped |

The Hammerschmiede isn't part of the bog set. It still needs its own art
(TODO(art): bog-creek Hammerschmiede): until then it is drawn with the existing
river hammer-mill families (`hammerschmiede` on a straight creek,
`hammerschmiede_bend` on a bend), turned like the creek.

## World generation

The generator has to follow the art's map rules, or tiles are missing:

1. A bog tile touches at most three water tiles, and they are next to each
   other. Fill any notch that would give it four or more.
2. Separate lakes are at least two tiles apart.
3. Creeks run straight or bend 120°, and end in a spring or a lake mouth.
   No 60° bends, no forks.
4. A creek meets a lake only at a mouth, arriving opposite the inlet's water
   edge.
5. The fish weir (a lake variant) goes only near a lake Fisher Hut.
6. No walkways or causeways.

On top of that, the economy needs one thing: **bog ground in reach of every
start**. The Clay Brickworks on bog is the start's stone source (LH 1), and
the bog-ore works on bog are its iron source (from about LH 6). A mountain
is *not* needed at the start; where one is in reach, the Quarry is an
alternative stone source.

Bogs are part of the living lands (not a wasted or frozen pack). A bog meets
grass at a hex edge, like the wasteland does.

## Implemented generation (bog PR)

*Implemented.* `BogGenerator` (C#, `Bjarnoy.Domain/World/BogGenerator.cs`) and its byte-identical twin
`src/frontend/src/lib/map/bogGenerator.ts` run inside the green river pipeline
(`RiverGenerator.GenerateWithBogs`); the shared golden is `src/shared/bog-generation-golden.json`. Order:

1. **Pockets first.** Enclosed sea pockets of an island (3 to `BogPocketMaxTiles` tiles) are found before rivers
   are traced. The pocket ring and the filled lake tiles are blocked for the drainage and count as land for
   rivers, so rivers sink into the pocket. A pocket's bog ring may touch sand (it lies inside the island); a pocket
   that is too thin or touches open sea is left as it is.
2. **Through-river sites.** After tracing, before the width pass, sites are placed on scratch state: a lake with
   its shore tiles, and a creek from the lake's mouth to a river tile. Each site is validated with a trial
   `AssignWidths` (R11: the feeding river must have widened before the creek meets it) and committed only when
   valid. Exactly one river runs through each lake (one outflow mouth, at least one inflow).
3. **Sinks and spawns.** A bog may sink an extra river (`BogSinkChance`) or spawn one from a creek spring
   (`BogSpawnChance`), both below 20%; a sink is tried before a spawn.
4. **Moss region** last, around the lake, creeks and the anchor; it never touches sea or sand (R7).

Creeks are routed by a BFS over (tile, heading) with turns {0, +60, -60}: only straight tiles and 60-degree bends
(see the tile kinds in `BogTileKind`). Giants, camps and start positions see bog through `BogTerrain.Overlay`; bog
costs 2x grass in `HexPathfinder`, a lake is impassable and not coastal water, and nothing can be built on a lake.
Generation never places the fish weir and boat variants (lake variants 4-6): buildings ask for them (see
"Lake props"). Bog camps (moosemire, beaverlodge, cranedance)
are weak camps on plain bog tiles.

Persistence: `IslandEntity.BogTiles` (text column, `BogTileListConverter`, token `q,r,kind,ins,out,water`),
migration `AddIslandBogTiles` for Sqlite and PostgreSql; the API serves `IslandResponse.BogTiles`.

Knobs (`WorldGenerationOptions`, defaults): `BogTilesPerSite` 6000, `BogMaxSites` 3 (at least 1), `BogSiteRadius` 7,
`BogLargeIslandTiles` 15000, `BogLakeMax` 12, `BogLakeMaxLarge` 18, `BogMinFromSpring` 4, `BogMinFromMouth` 6,
`BogSinkChance` 0.15, `BogSpawnChance` 0.05, `BogPocketMinTiles` 3, `BogPocketMaxTiles` 400,
`BogPocketRadius` 4, `BogMaxSinkReroute` 12.

Measured over seeds 1-8 at radius 1000: 273 islands, 95 with a bog (87 of the islands of 3000+ tiles); 124
through-river bogs, 165 lakes (median 7 tiles, max 176); sinks 3.2%, spawns 7.3%; 48 pockets found, 41 filled;
no inland river mouths; R1-R11 violations 0 (`BogRuleViolations` / `bogRules.ts`, counted by the preview tool).

## Art pack orientation convention

Pixel-measured against the vendored art (bg_assets_hextile edba233). Directions 0..5 = E, NE, NW, W, SW, SE;
`file D` is the texture rendered for orientation index `D`. The measured table lives in
`src/frontend/src/lib/map/types.test.ts`; the helpers are in `types.ts`.

| Family | Rule | Helper |
|---|---|---|
| `bogcreek` (straight) | touches edges `D+1` and `D+4`, so `D = (2 - dir) mod 6` | `straightOrientationOf` |
| `bogcreek_bend` | same as the river bend | `bendOrientationOf` |
| `bogcreek_spring` | `D = (2 - out) mod 6` | `springOrientationOf` |
| `boglake_inlet/shore/half` | water on edges `a, a+1, a+2` (first water edge `a`): `D = (5 - a) mod 6` | `bogShoreOrientationOf` |
| `boglake_mouth` | as an inlet for the water edge; the creek is on the opposite edge | `bogMouthOrientationOf` |

Texture keys: `bog`, `lake`, `bogcreek`, `bogcreekbend`, `bogcreekspring`, `lakeinlet`, `lakeshore`, `lakehalf`,
`lakemouth`. `normalizeBogFrames` renames `variantNNN` to contiguous variants; lake variants above 3 (fish weir,
both boats) are dropped. The variant is `tile.variant % variants.length`.

## Buildings

*Implemented.* Rules live in `BuildingCatalogue.cs` (`RequiresBogKind`, `LakeShoreKinds`, `Boosts`,
`RadiusBoostTargets`), mirrored on the client in `ringCatalogue.ts` (`buildingAllowedOnHex`) and
`buildingEconomy.ts`; `BogBuildingTests.cs` and the frontend tests pin them.

- **Bog-ore works** (`bogoreworks`): the iron producer, on **plain bog moss** only
  (`BogTileKind.Bog`: not a shore, mouth, creek, spring or lake). Unlocks at LH 6 with no
  feeder, max level 25, storage-capped like the other producers. 7 art levels (level000-006);
  game level `L` shows art level `min(L, 6)`, the same clamp every producer uses. Iron P₁ is
  **20/h**, tuned in the Economy lab (`economy.md` §8), growing 1.20 per level. Terrain boost:
  +10% per neighbouring bog, creek or lake hex (any bog kind), capped at +50%.
- **Clay Brickworks**: allowed terrain is plain bog now (it was grass); art was already on the bog base.
- **Fishing Hut**: also placeable on a lake **half shore** (`BogTileKind.Half`, three water
  edges), drawn with `fisherhut_lake` turned by `bogShoreOrientationOf(waterEdges)`. Its boost
  counts neighbouring lake hexes the way the coastal hut counts sea. Coastal behaviour is unchanged.
- **Hammerschmiede** (`hammerschmiede`): a radius-boost building like the Sawmill and Crop Mill,
  on a **bog creek** (`BogTileKind.Creek`, straight or bend; never a mouth, spring or lake).
  Unlocks at LH 20 behind bog-ore works level 10, max level 20. Boosts bog-ore works within
  range, with the mills' curve (5% to 100%, 1 to 5 rings). Placeholder art: the river
  hammer mill (TODO(art): bog-creek Hammerschmiede).
- Nothing is built on a lake. No building with an empty `AllowedTerrain` set (the coastal-water
  buildings) can land on bog other than the Fishing Hut on a half shore; no grass building can.

### Lake props

Owner: "boats are placed on the lake if the according building was placed nearby; limit boat
density - not every building gets a boat, only big lakes have multiple boats". Render-only
(`lakeProps.ts`), a pure function of the world seed, the lake and the buildings' coordinates, so every
client that knows the same buildings draws the same lake:

- a lake Fishing Hut may put a **fish weir** (`boglake` variant004) and, independently, a
  **fishing boat** (variant006, animated, camera W only) on an open-lake hex within 2 of it;
- a bog-ore works with open lake water within 3 of it may put an **ore boat** (variant005,
  animated, camera SW only) on an open-lake hex within 3;
- each qualifying building rolls 0.5 per prop; a lake holds at most `max(1, floor(lakeTiles / 12))`
  boats in total (weirs are not boats), and boats and weirs are at least 3 hexes apart;
- a boat always renders at its variant's one camera, whatever the tile's own rotation; the weir (all
  six cameras) keeps the tile's.

## Decisions

- Bog is its own `Terrain` value with its own base tile.
- Bog creeks don't count as rivers for the river buildings.
- "Bog in reach of every start" is guaranteed by the **landing spots**: a
  new player is never offered a landing spot (start position) without bog
  in reach. An island without bog simply gets no landing spots. This rule
  is only about where new players land; where later settlements are founded
  is up to the player. *Implemented* (`WorldGenerationOptions.BogReach`,
  default 12, 0 = off; `WorldGenerator.FindStartPositions`; the demo mirror
  is `WorldModel.hasPlainBogInReach`): a spot needs a **plain-bog** tile
  (moss; a shore or creek does not count) within 12 hexes. Measured over
  seeds 1-8 at radius 1000 (273 green islands): landing spots 90 536 to
  13 617; islands with any spot 176 to 94; of the 176 islands that had
  spots, 82 lost all of them, every one an island with no plain bog at all
  (179 of the 273 islands have none; the 100 islands of 3 000+ tiles
  keep spots on 87). Raising the reach does not bring those islands back
  (reach 20 and 30 keep 94), only more spots on the islands that have bog.
  The compact test preset switches the rule off (its islands are too small for bog).

## Agent prompt (game side)

> Read `CLAUDE.md`, `docs/design/economy.md` (§2, §3, §8) and this file,
> then `VanDooProject/3D_assets` `docs/bog-tiles.md` (the contract and the
> map rules), then the river code: `World/RiverGenerator.cs`,
> `RiverTile.cs`, `TerrainSampler.cs`, `WorldGenerator.cs`, the
> `src/shared/river-*-golden.json` goldens, and the frontend's river art
> lookup (`textures.ts` `riverArtFor`).
>
> **Goal: bog ground, creeks and lakes in world generation; the bog-ore
> works; Clay Brickworks and the Fisher Hut on the bog.**
>
> 1. **Terrain.** Add `Terrain.Bog` (its own base tile) and generate bogs
>    with the map rules above. The landing spots offered to new players (the
>    landing page's plot suggestions and reservations) never include a spot
>    without bog in reach. Keep the C# and TS generators byte-identical
>    through the shared goldens (regenerate them with the repo's tooling).
> 2. **Buildings.** Add the bog-ore works (new `BuildingType`), move Clay
>    Brickworks to bog ground, and let the Fisher Hut stand on a bog-lake
>    shore, all as described above. The Hammerschmiede comes separately,
>    once its art exists.
> 3. **Iron and units.** Rework unit costs and unit Longhouse gates to
>    `economy.md` §8: the Thrall costs no iron, every other unit does, and
>    unit unlocks follow the building ladder. Check in the Economy lab
>    (`/admin/economy`) that iron income and unit unlocks line up, and put
>    the numbers in the PR.
> 4. **Art.** Wire the bog families into `textures.ts`/`buildingArt.ts`
>    once they are vendored. Until then use a clearly marked placeholder and
>    say which families are missing. Don't render or push art: that's the
>    maintainer's (see the 3D_assets `AGENTS.md`).
>
> Tests: landing spots (none offered without bog in reach), the map
> rules), placement rules for the buildings, the terrain boost, and the unit
> cost and gate changes. (All done; see the sections above.)
