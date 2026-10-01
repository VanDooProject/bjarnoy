# Bogs, bog ore and the Hammerschmiede (game side)

Status: **implemented**: bog terrain, creeks and lakes (bog PR), the bog buildings, the lake
props, the landing-spot rule and the bog guarantee (bog buildings PR). The art was built in
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
7. Padding (R12): every lake, shore, mouth, creek and spring tile has all six neighbours inside the bog, so water
   features never touch grass or forest (a creek may touch its own river).

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
4. **Moss region** around the lake, creeks and the anchor; it never touches sea or sand (R7).
   **Padding (R12), per site, right after its region**: every lake, shore, mouth, creek and spring tile of the site must have all six
   neighbours inside the bog (`TryPad`). Missing neighbours become plain moss when they are grass or forest, not a river and not
   beside sand or the open sea (`CanPad`, so R7 holds); a creek tile may touch only the river its own in/out link leads to (the
   creek's upstream or downstream river tile). A site that cannot be padded is restored from its snapshot and dropped like any
   other unplaceable site (`BogPaddingRejected`); the guarantee's attempts count theirs apart. To keep that rare the site search
   avoids what cannot be padded: shore, creek and spring tiles take no mountain neighbour (`MountainFree`), creek routes avoid
   foreign river tiles beside them, the shore ring takes no foreign river, and a spawned river is traced with the creeks' and the
   lake ring's neighbours blocked. A pocket's two inner rings must be free of mountains and open sea (not only the first), else the
   pocket stays sea.
5. **Holes** (`FillHoles`) once all sites, sinks, spawns, pockets and the guarantee are done: any group of non-bog island tiles with no
   path out that does not cross bog or lake turns its grass and forest (river tiles stay) into plain moss. Mountains inside stay
   mountains. The noisy region outline used to leave such patches, which made one bog look like two.
6. **The bog guarantee** (bog buildings PR), after step 4 for the normal sites (its attempts pad too, and holes are filled after it). An island of at least `BogGuaranteeMinTiles` (150) land tiles that has a
   landing-spot candidate by terrain alone (grass with a forest and two grass neighbours, no water within two; giants and strong camps do
   not exist yet at this point) but no candidate with plain bog moss within `BogReach` is given a bog. Anchors are tried best-covered first
   (most candidates within reach), and a bog that would leave no candidate covered is rolled back (the generator snapshots its state):
   a. a **through-river site with relaxed criteria** (disc radius `BogGuaranteeRadius` 5, lake of 3 to 8, river tiles from 2 after the
      spring to 3 before the mouth), the same `TryPlaceSite` as the normal pass;
      the guarantee's lakes (here and in b) grow only onto tiles whose six neighbours could all be its shore (allowed, in the disc, no
      mountain beside them, no river within one), so a lake the plain growth would finish anyway grows the same, and one that would
      have grown against a mountain or the coast and been thrown away grows the other way instead (island density PR);
   b. otherwise a **spawn bog** on river-free inland grass or forest: a small lake, a creek from a spring inside the disc (at least three
      from the lake) into one mouth, and a creek out of another mouth to a tile just outside the disc where a normal river starts, traced
      to the sea (or a trunk) by the drainage tracer, so exactly one river runs through the lake and it is the spawned one. The tracer's
      drainage field gives every basin (connected group of interior tiles) an outlet of its own: the island's outlets are spread by
      count (one per 2000 tiles), and a basin cut off by a neck of coastal tiles can otherwise have none, so nothing traced in it
      reaches the sea (island density PR). Rules R1-R12
      hold as for any site; R9 accepts a spring whose creek ends in a lake that has its outflow;
   c. otherwise the island is left as it is: no room. Rule R7 keeps every lake tile, shore and creek more than two hexes from sand and
      sea, on grass or forest, and a lake with its shore ring needs about 6 hexes of such ground across.
   Islands without mountains (no river candidates at all) take path b too. The guarantee rolls no sinks or spawns of its own.

7. **Valley streams** (after the width pass, once the bogland is final): a stream out of every mountain-enclosed valley of 100+ hexes (see
   `river-generation.md`, "Valley streams"). The bogland is a wall to it: a new stream never touches a bog tile or a neighbour of
   a water feature, and `BogRules` may not get worse.

*Before/after the padding and hole fill* (R12, seeds 1-8 at radius 1000; the earlier table is the state before). The measure is the same as the table
below: Domain tests, `FindStartPositions`, `bog-stats.ts`. Padding costs sites because a ring of bog around every water feature needs
grass or forest all round it (no mountain beside a shore or creek, no foreign river):

| | before R12 | with padding and hole fill |
|---|---|---|
| islands with a bog | 146 | 142 |
| bog tiles in total | 25 933 | 23 541 |
| islands with a candidate / with landing spots (bog rule on) | 177 / 144 | 177 / 140 |
| landing spots (bog rule on) | 15 396 | 14 010 |
| bogs by the normal pass / guarantee through-river / guarantee spawn | 124 / 20 / 32 | 100 / 31 / 29 |
| sites dropped for padding (normal pass / guarantee attempts) | - | 1 / 0 |
| rolled sinks, rolled spawns, guarantee spawns (% of all bogs) | 2.3%, 5.1%, 18.2% | 0.0%, 4.4%, 18.1% |
| all spawns (the 20% rule, see below) | 23.3% | 22.5% |
| R12 violations / enclosed grass-forest groups | 1 773 / 18 | 0 / 0 |
| grass/forest tiles filled into bogs by the hole fill | - | 26 |
| pockets found / filled (a pocket's two inner rings must be mountain- and sea-free) | 48 / 41 | 48 / 37 |
| R1-R11 violations, inland river mouths | 0, 0 | 0, 0 |

The "sites dropped" row is small because the search steers clear of unpaddable ground up front; the real cost is in the second row from
the top and in the normal pass (124 to 100 bogs): rivers start on mountains and most candidate lakes have one near. The 37 islands with a
candidate and no bog are 5 more than before; the largest has 438 tiles (a mountainous island: every anchor has a mountain within one ring of
the shore or creek).

*On the denser terrain* (island density PR, seeds 1-8 at radius 1000, 482 islands, measured the same way). The terrain change left two
islands of 500+ tiles with a candidate and no bog, which the guarantee test does not allow: seed 4 island 28 (2705 tiles, an arc joined to a
74-tile islet by a one-hex strip of beach; the island's single drainage outlet sat on the islet, so every spawn bog's river on the arc
failed to trace, 1 400+ attempts) and seed 8 island 31 (605 tiles, forest round a mountain massif; every spawn lake grew towards the
mountains and was rejected). The two fixes in step 6 (an outlet per basin for the spawned river, lakes grown onto shore-fit tiles)
only rescue attempts that used to fail, so islands the guarantee already helped keep their bog:

| | before the two fixes | with them |
|---|---|---|
| islands with a bog | 258 | 276 |
| green islands with a landing candidate / with landing spots (bog rule on) | 341 / 258 | 338 / 273 |
| guarantee: islands acted on / through-river / spawn / could not help | 159 / 49 / 68 / 42 | 159 / 53 / 82 / 24 |
| rolled sinks, rolled spawns, guarantee spawns (% of all bogs, pockets excluded) | 1.8%, 2.5%, 24.5% (of 278) | 1.7%, 2.4%, 27.7% (of 296) |
| lakes / bog tiles | 339 / 39 310 | 357 / 40 038 |
| R1-R12 violations, inland river mouths | 0, 0 | 0, 0 |

The guarantee's spawn bogs push the spawn share further over the owner's 20% (30.1% of all bogs with the rolled ones); see "The 20% rule".

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
`BogPocketRadius` 4, `BogMaxSinkReroute` 12, `BogGuaranteeMinTiles` 150 (0 = off; the compact test preset has it off),
`BogGuaranteeRadius` 5. The client mirrors are the `BOG_*` constants in `bogGenerator.ts`.

Measured over seeds 1-8 at radius 1000 (273 green islands), before and after the guarantee (`scripts/worldgen-preview/bog-stats.ts`
and the Domain tests; landing spots as `FindStartPositions` finds them, "no bog rule" being the same call with `BogReach` 0):

| | before the guarantee | with the guarantee |
|---|---|---|
| islands with a bog | 94 | 146 |
| green islands with a landing candidate (no bog rule) | 176 | 176 |
| ... of them with a bog | 94 | 144 |
| islands with landing spots (bog rule on) | 94 | 144 |
| landing spots, bog rule off / on | 90 536 / 13 617 | 90 057 / 15 396 |
| bogs by the normal pass (through-river, incl. sinks and rolled spawns) | 124 | 124 |
| bogs by the guarantee: through-river / spawn | - | 20 / 32 |
| sinks, % of all 176 bogs (pockets excluded) | 3.2% (of 124) | 2.3% |
| rolled spawns, % of all bogs | 7.3% (of 124) | 5.1% |
| guarantee spawns, % of all bogs | - | 18.2% |
| all spawns, % of all bogs | 7.3% | **23.3%** (over the owner's 20%, see below) |
| R1-R11 violations, inland river mouths | 0, 0 | 0, 0 |
| `Generate()` radius 4000, seed 1 (Release, 4 cores) | 12.8 s, 225 islands with a bog | 12.7 s, 386 islands with a bog |

The guarantee acted on 63 islands: 20 got a relaxed through-river site, 32 a spawn bog, 11 nothing. The 176 - 144 = 32 islands with a
candidate and no bog are 21 islands under `BogGuaranteeMinTiles` (no lower island was ever helped when the threshold was 34) and those
11, of 150 to 354 tiles: the smallest island the guarantee helped has 190 tiles. Each of the 11 is narrow or mountainous: its land is
at most 2 to 8 hexes from the coast, and its grass and forest more than two hexes in from sand and sea (R7) is too little for a lake with
its shore ring. Normal-pass numbers are unchanged: 124 through-river bogs, 165 lakes before (217 now), 48 pockets found, 41 filled.

**The 20% rule.** The owner's rule is that a bog spawns or sinks a river as an exception, below 20%. The rolled sinks and spawns
together are 7.4% of all bogs and 10.5% of the normal pass's, unchanged. A guarantee spawn bog is a bog that spawns a river by
construction, so with them the spawn share is 23.3% of all bogs. Ways to bring it down: cover fewer islands (raise
`BogGuaranteeMinTiles`; the smallest island helped has 190 tiles) or make the relaxed through-river site succeed more often (it reaches 20
of 52 bogs; on the rest no river passes the site's disc in a way that satisfies the single-path and R11 checks, and loosening the
river-tile margins and the disc test moved it by one island). The owner decided more bogs; whether 23.3% is acceptable is theirs to confirm.

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
  in reach. This rule is only about where new players land; where later
  settlements are founded is up to the player. *Implemented*
  (`WorldGenerationOptions.BogReach`, default 12, 0 = off;
  `WorldGenerator.FindStartPositions`; the demo mirror is
  `WorldModel.hasPlainBogInReach`): a spot needs a **plain-bog** tile (moss; a
  shore or creek does not count) within 12 hexes. Without more, 82 of the 176
  islands that had landing spots (seeds 1-8, radius 1000) lost all of them,
  every one an island with no plain bog at all (179 of the 273 islands have
  none; raising the reach to 20 or 30 does not help).
- **More bogs** (owner decision): every island big enough to hold landing spots gets
  at least one bog, by the guarantee in "Implemented generation", step 5, so the
  rule above no longer empties islands. Islands with a landing candidate and a bog:
  94 to 144 of 176 (140 of 177 with the padding ring, R12); landing spots 13 617 to 15 396 (14 010 with it). The islands left are
  narrow or mountainous (no inland room for a lake, R7) or under 150 tiles.
  The compact test preset switches the rule and the guarantee off (its islands are too
  small for bog).

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
