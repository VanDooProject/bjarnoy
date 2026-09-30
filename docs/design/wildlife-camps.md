# Wildlife camps: placement, levels and guard ranges

Spawn and render only. Camps are generated with the world, stored per island and drawn on the map;
nothing reads them yet (no tower blocking, clearing, loot or respawn: see `economy.md` section 10
for the rules they will carry). Requirements: `world-generation-rules.md`, "Wildlife camps".

## Families

One shared table, mirrored by `Camp.cs` (`CampFamilies.All`) and `campPlacement.ts` (`CAMP_FAMILIES`):

| Family | Ground | Strength | Level skew |
|---|---|---|---|
| wolfden | grass | strong | high |
| boarwallow | forest | strong | high |
| bearrapids | a straight river tile (river width) | strong | high |
| fenrirbrood | wasteland (grass of a wasted island); wasted islands only | strong | high |
| sealhaulout | sand | weak | low |
| eagleeyrie | mountain | weak | low |
| moosemire / beaverlodge / cranedance | plain bog | weak | low |

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
   has a candidate, an island of 16 800+ tiles gets the cap.
2. **Candidates**: land tiles not on a giant footprint, not a river tile (except a straight river tile
   for bearrapids), and whose ground has a family (see the table). Mountain tiles count.
3. **Farthest-point sampling** (like the river springs): the first pick is the hash-best candidate; each
   next pick is the candidate farthest from every camp so far, at least `MinCampSpacing` from all of them
   (ties: hash, then q, r). Weighting: while some ground the island has still has no camp, only
   candidates on such grounds are considered, so each ground gets one before any gets a second.
   **Seal cap**: at most `MaxSealCampsFor(land)` = `max(1, round(land / SandTilesPerSealCamp))` seal
   colonies per island (`SandTilesPerSealCamp` 4000). The sand rim is always the ground farthest from the
   interior camps, so without the cap farthest-point sampling gave seals about 45% of all camps.
4. **Level**: rolled per camp in `1..MaxCampLevel` from a hash `u`: weak `u^2` (mostly low), strong
   `1 - (1 - u)^2` (mostly high).
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

Measured on seeds 1-8 at radius 1000 (273 green islands, 15 wasted, 1 532 camps, 752 strong; the 76 islands
under 60 tiles have none): start positions fell from 278 363 to 248 965 (-11%); 60 green islands had none
before, 85 have none now (25 islands lost all of theirs, mostly small ones a single strong camp can hold
whole). Camp families over the same seeds: sealhaulout 653, wolfden 314, boarwallow 241, eagleeyrie 127,
bearrapids 125, fenrirbrood 72 (before the seal cap). Seed 11 at radius 1000 (32 islands, 9 under 60 tiles,
23 with camps): 193 camps; before the seal cap 87 strong (sealhaulout 89, wolfden 36, boarwallow 31,
bearrapids 20, eagleeyrie 17), with it 137 strong (wolfden 65, boarwallow 49, sealhaulout 39, bearrapids 23,
eagleeyrie 17).

Tuning defaults (all in `CampGenerator` and `campPlacement.ts`): `CampTilesPerCamp` 700,
`MinCampIslandTiles` 60, `SandTilesPerSealCamp` 4000, `MaxCampsPerIsland` 24, `MinCampSpacing` 6, `MaxCampLevel` 5, `StartPositionMargin` 2, plus the two
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
