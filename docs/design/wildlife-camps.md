# Wildlife camps: placement, levels and guard ranges

Spawn and render only. Camps are generated with the world, stored per island and drawn on the map;
nothing reads them yet (no tower blocking, clearing, loot or respawn: see `economy.md` section 10
for the rules they will carry). Requirements: `world-generation-rules.md`, "Wildlife camps".

## Families

One shared table, mirrored by `Camp.cs` (`CampFamilies.All`) and `campPlacement.ts` (`CAMP_FAMILIES`):

| Family | Ground | Strength | Level roll |
|---|---|---|---|
| wolfden | grass | strong | cubic |
| boarwallow | forest | strong | cubic |
| bearrapids | a straight river tile (river width) | strong | cubic |
| fenrirbrood | wasteland (grass of a wasted island); wasted islands only | strong | cubic |
| sealhaulout | sand | weak | quadratic |
| eagleeyrie | mountain | weak | quadratic |
| moosemire / beaverlodge / cranedance | plain bog | weak | quadratic |

The bog camps are in the table but are **not placed yet**: bog terrain lands in a later PR
(`TODO(bog PR)` in `CampGenerator.PlaceCore` / `placeCamps`). Bearrapids goes on a river tile of shape
`Straight` only; a later PR adds "river width only, not stream" (`TODO(streams PR)`). Wasted islands get
fenrirbrood only.

## Placement

Per island, deterministic, run after rivers and giants and **before** start positions
(`WorldGenerator.BuildIslands`). Pure core: `CampGenerator.PlaceCore` (C#) and `placeCamps` (TS),
bit-identical; `src/shared/camp-placement-golden.json` is asserted by both
(`CampPlacementGoldenTests`, `campPlacement.golden.test.ts`; regenerate with
`GoldenRegenerationTests`, `BJARNOY_REGEN_GOLDENS=1`).

1. **Count**: an island with fewer than `MinCampIslandTiles` (60) land tiles gets **no camp** (islets stay
   camp-free, so seal colonies do not dominate). Otherwise
   `clamp(round(islandLand / CampTilesPerCamp), 1, MaxCampsPerIsland)`: a 60-tile island gets one camp if it
   has a candidate, an island of 14 400+ tiles gets the cap (32).
2. **Candidates**: land tiles not on a giant footprint, not a river tile (except a straight river tile
   for bearrapids), and whose ground has a family (see the table). Mountain tiles count.
3. **Farthest-point sampling** (like the river springs): the first pick is the hash-best candidate; each
   next pick is the candidate farthest from every camp so far, at least `MinCampSpacing` from all of them
   (ties: hash, then q, r). Weighting: while some ground the island has still has no camp, only
   candidates on such grounds are considered, so each ground gets one before any gets a second.
   **Seal cap**: at most `MaxSealCampsFor(land)` = `max(1, round(land / SandTilesPerSealCamp))` seal
   colonies per island (`SandTilesPerSealCamp` 4000). The sand rim is always the ground farthest from the
   interior camps, so without the cap farthest-point sampling gave seals about 45% of all camps.
4. **Level**: rolled per camp in `1..MaxCampLevel` from a hash `u`, low for every family so few start
   positions are lost: weak `1 + floor(u^2 * 5)`, strong `1 + floor(u^3 * 5)` (only `*` and `floor`, so C# and
   TS are bit-identical; `CampLevelSkew.Quadratic` / `Cubic`). Resulting distribution (level 1 to 5):

   | | L1 | L2 | L3 | L4 | L5 | guard range |
   |---|---|---|---|---|---|---|
   | weak (`u^2`) | 44.7% | 18.5% | 14.3% | 11.9% | 10.6% | 1, 2, 2, 3, 3 |
   | strong (`u^3`) | 58.5% | 15.2% | 10.6% | 8.5% | 7.2% | 3, 4, 5, 6, 7 |

   So strong camps sit on levels 1-3 (guard 3-5) about 84% of the time and weak ones on levels 1-2 (guard
   1-2) about 63%; higher levels stay possible but rare. (`u^1.5` for strong, the first try, cost 17.8% of
   the start positions; see the measurement below.)
5. **Orientation**: the tile's own orientation (`TerrainSampler.OrientationAt`); a bearrapids camp
   follows its river (`straightOrientationOf` of the river's direction).

## Guard range

`GuardRange(level, strength)`: weak `1 + floor(level / 2)` (1 to 3 hexes), strong `2 + level` (3 to 7).
A start position is dropped when its distance to a **strong** camp is at most `GuardRange + 2`
(`StartPositionMargin`); weak camps may sit next to a spot. Camps are placed first, so an island
with strong camps everywhere can lose start positions.

**Decided (owner):** a small island where one strong camp's guard range removes every start position is
simply not a start island. That is kept as is: there is no fallback that keeps a spot near a camp, and no
exemption for small islands.

Measured on seeds 1-8 at radius 1000 (273 green islands, 15 wasted; the 76 islands under 60 tiles have no
camp), start positions on green islands:

| | camps | strong / weak | start positions | green islands without one |
|---|---|---|---|---|
| no camps | 0 | | 278 363 | 60 |
| first camps PR (700 tiles per camp, cap 24, strong `1-(1-u)^2`) | 1 532 | 1 122 / 410 | 238 273 (-14.4%) | 85 |
| dense (450, cap 32, strong `u^3`, weak `u^2`) | 2 277 | 1 809 / 468 | 237 493 (-14.7%) | 75 |

(The -11% quoted for the first camps PR was measured before the seal cap; with the cap it was -14.4%.)
Levels of the dense set: strong L1-L5 = 1 082 / 273 / 183 / 141 / 130, weak 207 / 93 / 61 / 60 / 47. Families:
wolfden 816, boarwallow 690, sealhaulout 283, bearrapids 195, eagleeyrie 185, fenrirbrood 108. Tried and
rejected on the way: strong `u^1.5` (`u * sqrt(u)`) 228 757 start positions (-17.8%, 82 islands without),
strong `u^2` 232 964 (-16.3%, 77); a `StartPositionMargin` of 1 instead of 2 would give 244 782 with `u^2` and
248 632 with `u^3` (-10.7%), but it changes the start rule and was not taken. Seed 11 at radius 1000
(32 islands, 23 with camps): 286 camps (226 strong, 60 weak: wolfden 115, boarwallow 81, sealhaulout 39,
bearrapids 30, eagleeyrie 21).

Tuning defaults (all in `CampGenerator` and `campPlacement.ts`): `CampTilesPerCamp` 450,
`MinCampIslandTiles` 60, `SandTilesPerSealCamp` 4000, `MaxCampsPerIsland` 32, `MinCampSpacing` 6, `MaxCampLevel` 5, `StartPositionMargin` 2, plus the two
guard-range formulas above.

## Data, API and art

- `GeneratedIsland.Camps` (`Camp`: coord, family, level, orientation; `Strong` and `GuardRange` derived),
  stored in `islands.Camps` (`CampListConverter`, `q,r,family,level,orientation` tokens; existing
  islands have none until a reseed), sent as `IslandResponse.camps` and in the admin preview island.
- Client: `WorldModel.setCamps` tags `Tile.camp`; demo mode places camps in `placeGiantsForIsland`; a
  camp hex is not buildable; `findLandfall` avoids strong camps.
- Build rule, also enforced server-side: `Settlement.PlanBuild` refuses a hex that holds a camp with
  `BuildRejection.HexOccupiedByCamp` (HTTP 409, `rejection: "HexOccupiedByCamp"`), checked right after the
  giant rule via `CampIndex` (`SettlementService.LoadCampIndexAsync`). Every camp counts as guarded for now
  (`TODO(camp gameplay PR)`: only a guarded camp will block once clearing exists). The admin god-mode
  building edit is not gated.
- Render: the ground's own base plus the camp's guarded (`level001`) animated top from the
  `buildings-anim` atlas (bearrapids also brings its river base). The guarded art ships only one to
  three rotations; the tile orientation is mapped onto those (read off the atlas) by modulo in
  `TILE_ORIENTATIONS` order, and bearrapids picks the kept rotation with its river's channel
  (orientation index mod 3, a straight channel is symmetric).
- Preview: `npm run worldgen-preview -- --layers terrain,camps` (markers per family, ring = guard range).
