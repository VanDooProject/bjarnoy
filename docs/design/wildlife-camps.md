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
| walrushaulout | sand | strong | cubic |
| eagleeyrie | mountain | strong | cubic |
| moosemire | plain bog | strong | cubic |
| beaverlodge / cranedance | plain bog | weak | quadratic |
| harewarren | grass | weak | quadratic |
| deerglade | forest | weak | quadratic |
| otterslide | a straight river tile (river width) | weak | quadratic |

Every main ground has a strong and a weak camp except the mountain (the eagle eyrie, strong; a weak mountain
camp is still to be drawn) - owner decisions: the eyrie, the walrus and the moose are strong. The walrus
haul-out has no art of its own yet and is drawn with the seal haul-out's (`KEY_FAMILY` in `textures.ts`).
A ground with several families offers one candidate per family on each tile (see Placement, step 2), so
the two budgets decide which one a tile gets.
The moose mire is the bog's strong camp, the beaver lodge and the crane dance its weak ones.
The bog camps are in the table but are **not placed yet**: bog terrain lands in a later PR
(`TODO(bog PR)` in `CampGenerator.PlaceCore` / `placeCamps`). Bearrapids goes on a river tile of shape
`Straight` and **River width** only (not a stream, widening or river-stream tile). Wasted islands get
fenrirbrood only. Otterslide takes the same river tiles as bearrapids and brings its own river base, like it.

## Placement

Per island, deterministic, run after rivers and giants and **before** start positions
(`WorldGenerator.BuildIslands`). Pure core: `CampGenerator.PlaceCore` (C#) and `placeCamps` (TS),
bit-identical; `src/shared/camp-placement-golden.json` is asserted by both
(`CampPlacementGoldenTests`, `campPlacement.golden.test.ts`; regenerate with
`GoldenRegenerationTests`, `BJARNOY_REGEN_GOLDENS=1`).

1. **Count**: an island with fewer than `MinCampIslandTiles` (60) land tiles gets **no camp** (islets stay
   camp-free). Otherwise two separate budgets: strong
   `clamp(round(land / StrongCampTilesPer), 0, MaxStrongCampsPerIsland)` (1500 tiles each, max 16) and weak
   `clamp(round(land / WeakCampTilesPer), 0, MaxWeakCampsPerIsland)` (600 tiles each, max 24; weak camps
   have no start-position distance rule because they do not attack on their own). An island of 60+ tiles
   whose budgets both round to zero still gets one camp, of either kind. A budget that the island's
   ground cannot fill (no sand or mountain for weak, say) stays unfilled and is never turned into the other kind.
2. **Candidates**: land tiles not on a giant footprint, not a river tile (except a straight river tile
   for bearrapids and otterslide), and whose ground has a family (see the table). Mountain tiles count.
   A tile gets **one candidate per family** its ground holds, in table order: the first keeps the plain
   candidate hash, each further one draws its own (`FamilyHashSalt`), so a ground with one family places
   exactly as before. Once a tile is picked, its other candidates sit at distance 0 and are never picked.
3. **Farthest-point sampling** (like the river springs): the first pick is the hash-best candidate; each
   next pick is the candidate farthest from every camp so far, at least `MinCampSpacing` from all of them
   (ties: hash, then q, r). Weighting: while some ground the island has still has no camp, only
   candidates on such grounds are considered, so each ground gets one before any gets a second. Spacing is
   shared by both kinds, but a pick is only taken from a kind (strong / weak) whose budget is not used up.
   **Sand cap**: at most `MaxSealCampsFor(land)` = `max(1, round(land / SandTilesPerSealCamp))` sand
   camps (seals and walruses together) per island (`SandTilesPerSealCamp` 2000). The sand rim is always the ground farthest from the
   interior camps, so without the cap farthest-point sampling gave seals about 45% of all camps.
   **Eyrie cap**, the same for mountains: at most `MaxEyrieCampsFor(land)` = `max(1, round(land /
   MountainTilesPerEyrieCamp))` eagle eyries per island (`MountainTilesPerEyrieCamp` 2000); with only the seal
   cap they were 44% of all camps. A budget the caps and grounds cannot fill stays unfilled (bog camps come with the bog PR).
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
5. **Orientation**: the tile's own orientation (`TerrainSampler.OrientationAt`); a bearrapids or
   otterslide camp follows its river (`straightOrientationOf` of the river's direction).

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
| one budget (450, cap 32, strong `u^3`, weak `u^2`) | 2 277 | 1 809 / 468 | 237 493 (-14.7%) | 75 |
| two budgets (strong 1500 / weak 600, seal cap 2000) | 2 352 | 759 / 1 593 | 260 095 (-6.6%) | 75 |
| **two budgets + eyrie cap 2000** | 1 819 | 759 / 1 060 | **260 095 (-6.6%)** | 75 |

(The -11% quoted for the first camps PR was measured before the seal cap; with the cap it was -14.4%.)
Two budgets without the eyrie cap: eagleeyrie 1 038, sealhaulout 555, wolfden 336, boarwallow 274, bearrapids 115,
fenrirbrood 34 (eyries 44% of all camps). With the eyrie cap: sealhaulout 555, eagleeyrie 505, wolfden 336,
boarwallow 274, bearrapids 115, fenrirbrood 34; strong levels L1-L5 = 460 / 114 / 74 / 52 / 59, weak
452 / 203 / 167 / 133 / 105. Weak camps have no distance rule, so the start positions do not change with the
cap. Tried on the way with the single budget: strong `u^1.5` -17.8%, strong `u^2` -16.3%, `StartPositionMargin` 1
would have given -10.7%; the owner asked for fewer strong and more weak camps instead, which keeps the margin at 2.
Seed 11 at radius 1000 (32 islands, 23 with camps): 254 camps (102 strong, 152 weak: sealhaulout 79,
eagleeyrie 73, wolfden 45, boarwallow 39, bearrapids 18). With the weak hare, deer and otter camps and
the eyrie and walrus strong: 314 camps (100 strong, 214 weak: deerglade 91, harewarren 70, sealhaulout 46,
walrushaulout 33, eagleeyrie 23, wolfden 21, boarwallow 15, bearrapids 8, otterslide 7). The weak budget now
fills; the start-position numbers above predate this change and were not re-measured.

Tuning defaults (all in `CampGenerator` and `campPlacement.ts`): `StrongCampTilesPer` 1500, `WeakCampTilesPer` 600, `MaxStrongCampsPerIsland` 16, `MaxWeakCampsPerIsland` 24,
`MinCampIslandTiles` 60, `SandTilesPerSealCamp` 2000, `MountainTilesPerEyrieCamp` 2000, `MinCampSpacing` 6, `MaxCampLevel` 5, `StartPositionMargin` 2, plus the two
guard-range formulas above.

## Loot (kinds only)

Clearing a camp pays loot (`economy.md` section 10) in the four resources. The kinds are the owner's mix of a
base rule and each camp's own extras from the design roster (#334's brainstorm); the amounts are still open.

- **Base rule:** every camp gives food, from the hunt; a strong camp adds iron, the gear of earlier settlers
  its pack has eaten.
- **Extras:** what the camp's ground holds. **++** marks the kind a camp pays a larger share of, so a camp's
  type shapes its loot once amounts exist.

| Camp | Strength | Loot |
|---|---|---|
| wolfden | strong | food, wood, iron |
| boarwallow | strong | **food ++**, iron |
| bearrapids | strong | food, stone, iron |
| moosemire | strong | **food ++**, iron |
| fenrirbrood | strong | food, **iron ++** |
| eagleeyrie | strong | food, stone, iron |
| walrushaulout | strong | food, iron |
| sealhaulout | weak | food |
| beaverlodge | weak | food, wood |
| cranedance | weak | food |
| otterslide | weak | food, wood |
| deerglade, harewarren | weak | food |

Amounts grow with the camp's level, a strong camp's several times a weak one's. The eagle eyrie and Fenrir's
brood are never built on, so their loot is a one-off prize. Nothing reads this yet: the docs page
(`WildlifeCampsView.vue`, `LOOT_EXTRAS`/`lootOf`) shows it per card and is the only consumer.

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
