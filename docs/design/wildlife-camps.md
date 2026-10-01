# Wildlife camps: placement, levels, guard ranges and fights

Camps are generated with the world, stored per island and drawn on the map. Players hunt them with
armies, strong camps attack armies and towers inside their guard range, and camps repopulate and grow
stronger the more often they are cleared: see [Gameplay](#gameplay). Almost every camp stands on land; the
**whale road** is the first **water camp**, on open sea and met by fleets only: see [Water camps](#water-camps). Requirements:
`world-generation-rules.md`, "Wildlife camps"; `economy.md` section 10; owner decisions in issue #334.

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
| whaleroad | open sea, 6-10 hexes off a coast ([Water camps](#water-camps)) | strong | cubic |

Every main ground has a strong and a weak camp except the mountain (the eagle eyrie, strong; a weak mountain
camp is still to be drawn) - owner decisions: the eyrie, the walrus and the moose are strong. The walrus
haul-out has no art of its own yet and is drawn with the seal haul-out's (`KEY_FAMILY` in `textures.ts`).
A ground with several families offers one candidate per family on each tile (see Placement, step 2), so
the two budgets decide which one a tile gets. The whale road is the last row of both tables, so no land
family's candidate hash moves; it is placed by its own sea pass, never by `PlaceCore` / `placeCamps`.
The bog camps are placed on plain bog tiles (moss that is not a shore, creek or lake; `plainBog` in
`CampGenerator.PlaceCore` / `placeCamps`): the moose mire from the strong budget, the beaver lodge or the
crane dance (whichever candidate's hash wins) from the weak one. Bearrapids goes on a river tile of shape
`Straight` and **River width** only (not a stream, widening or river-stream tile). Wasted islands get
fenrirbrood only. Otterslide takes the same river tiles as bearrapids and brings its own river base, like it.

## Placement

Per island, deterministic, run after rivers and giants and **before** start positions
(`WorldGenerator.BuildIslands`). Pure core: `CampGenerator.PlaceCore` (C#) and `placeCamps` (TS),
bit-identical; `src/shared/camp-placement-golden.json` is asserted by both
(`CampPlacementGoldenTests`, `campPlacement.golden.test.ts`; regenerate with
`GoldenRegenerationTests`, `BJARNOY_REGEN_GOLDENS=1`). The land camps below are placed from the island's land; the water camps (the whale road) follow in their own sea pass, see [Water camps](#water-camps).

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
   cap they were 44% of all camps. A budget the caps and grounds cannot fill stays unfilled and is never turned into the other kind.
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

A **water camp has no guard range**: `Camp.GuardRange` is 0 for a family on `CampGround.Sea` (and `campGuardRange` in
`campPlacement.ts`). It holds no land and locks no towers; the start-position margin below, the tower threat
(`CampTowerThreat`, `towerThreatAt`) and the client's tower warning skip it. For a fleet's route a range of 0 means
"the camp's own hex" (see [Water camps](#water-camps)).

`GuardRange(level, strength)` for the land camps: weak `1 + floor(level / 2)` (1 to 3 hexes), strong `2 + level` (3 to 7).
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
the eyrie and walrus strong: 314 camps (100 strong, 214 weak: deerglade 88, harewarren 71, sealhaulout 47,
walrushaulout 32, wolfden 23, eagleeyrie 22, boarwallow 16, otterslide 8, bearrapids 7; the preview does not
generate bog, so no bog camps). The weak budget now fills; the start-position numbers above predate this
change and were not re-measured.

Tuning defaults for the land camps (all in `CampGenerator` and `campPlacement.ts`; the whale road's are under [Water camps](#water-camps)): `StrongCampTilesPer` 1500, `WeakCampTilesPer` 600, `MaxStrongCampsPerIsland` 16, `MaxWeakCampsPerIsland` 24,
`MinCampIslandTiles` 60, `SandTilesPerSealCamp` 2000, `MountainTilesPerEyrieCamp` 2000, `MinCampSpacing` 6, `MaxCampLevel` 5, `StartPositionMargin` 2, plus the two
guard-range formulas above.

## Water camps

The whale road (3D_assets `hextile134_whaleroad`: a humpback cow and calf surfacing on open sea, with gulls; the empty
state is the gulls only; the guarded art is kept in rotations SE and NE) is the first camp on the sea. The name is a sea
kenning, the camp does not move. Family `whaleroad`, ground `CampGround.Sea` (appended last in the enum), **strong**,
`CampLevelSkew.Cubic`, last row of `CampFamilies.All` / `CAMP_FAMILIES`.

- **No range, no land.** Guard range 0: it holds no land, locks no towers and costs no start positions (it sits 6+ hexes
  off the coast, the margin is `range + 2`).
- **Placement**: a separate, pure, deterministic sea pass per island, run after the island's land camps
  (`CampGenerator.PlaceWhaleRoads` in C#, `placeWhaleRoads` in TS, bit-identical; `GenerateWhaleRoads` and the demo
  `WorldModel` wire them in). Only **green** islands with at least `MinCampIslandTiles` (60) land tiles get any.
  - Candidates: hexes whose distance to the island's nearest land tile is `WhaleMinShoreDistance` (6) to
    `WhaleMaxShoreDistance` (10) inclusive, and whose nearest land **of any island** (wasted ones and specks included) is
    this island's: no land of another island at the same or a shorter distance, so there is none within 5 and two
    islands never offer the same hex (ties are skipped). They are enumerated by expanding rings from the island's coast,
    not by scanning the world, and the open-sea check is made lazily for the candidates that would win a pick.
  - Count: `clamp(round(land / WhaleTilesPer), 1, MaxWhaleCampsPerIsland)` with `WhaleTilesPer` 3000 and
    `MaxWhaleCampsPerIsland` 3 (1 up to 4 499 land tiles, 2 up to 7 499, then 3).
  - Selection: farthest-point sampling like the land camps (first pick the hash-best candidate, each next the one
    farthest from the picks so far, at least `MinWhaleSpacing` (12) apart; ties by hash, then q, r) on its own hash salts
    (`WhaleHashSalt` 4093, level `WhaleLevelSalt` 5419), so it is independent of the land camps. Level: cubic, like the
    other strong camps (`1 + floor(u^3 * 5)`).
  - Golden: `src/shared/whale-placement-golden.json` (an island's tiles plus the land of its neighbours, asserted by
    `WhalePlacementGoldenTests` and `whalePlacement.golden.test.ts`; regenerated by
    `GoldenRegenerationTests.Regenerate_whale_placement_golden`). The land-camp golden is untouched.
- **Ambush at sea**: a **fleet** is attacked when its route **enters the whale road's own hex** while the camp is
  aggressive (strong, not calm, adults or alphas alive; `CampAmbush.FindEarliest` with range 0). Land armies are only
  checked against land camps and fleets only against water camps (`CampAmbushService`). Same fight as on land: the
  beasts' attack against the units' defense, raid-capped; a beaten fleet turns home from where it is
  (`Army.ForceFieldRetreat` works for a fleet: it paths over sea to the home settlement), a winning one sails on; the camp
  is calm for 24 h and a `CampReport` of kind `ambush` is written. A fleet hunting this camp is exempt, like a land hunt.
- **Hunted by fleets**: `ArmyMission.Hunt` takes ships when the target is a water camp (`Army.PlanDispatch`'s
  `targetCampIsWater`); the route ends on the camp's own sea hex (`Army.HuntRouteDestination(..., isFleet: true)`). Land
  units at a water camp are refused with `HuntRequiresFleet`, ships at a land camp with `HuntRequiresLandUnits` (HTTP 409
  `rejection`, both in `apiErrors`). Battle, report and the empty-camp pickup are the ordinary hunt rules
  (`CampBattleResolver.Hunt`, the fleet fights with the settlement's ship attack bonus).
- **Loot: food only**, though the camp is strong (no automatic iron): `CampRules.LootKinds` / `lootKindsOf` special-case
  it. The pool is the strong one (`1800 x L^0.7`, all of it food), capped by the ships' carry capacity
  (`CarryCapacity` of the surviving ships); the rest stays as leftover.
- **Always regrows**: a sea hex is never held by a realm, so a cleared whale road refills (`CampState.GarrisonAt`
  treats a water camp like Fenrir's brood and ignores a realm that might reach the hex).
- Beasts: whale calf / humpback / old bull (`catalogue.beasts.whaleroad`).

Still to do on the client: drawing the whale road on the map, the docs page card, a hunt order for fleets and the camp
report UI (its docs card and strings are minimal for now).

## Gameplay

Owner decisions (issue #334 and the camp-fights PR). All numbers are tuning constants in
`CampRules` (C#), mirrored in `campRules.ts` where the client shows them.

### Beasts

A camp's garrison is beasts in three tiers per family; they are not `UnitType`s (nobody trains them)
but a `BeastTier` (`young`, `adult`, `alpha`) on the camp's family. The family only names them
(`catalogue.beasts.<family>.<tier>`); the stats depend on the camp's strength:

| Strength | young atk/def | adult atk/def | alpha atk/def |
|---|---|---|---|
| weak | 0 / 2 | 8 / 12 | 15 / 25 |
| strong | 2 / 5 | 25 / 30 | 50 / 60 |

Names: wolfden wolf pup / wolf / alpha wolf; boarwallow piglet / boar / tusker; bearrapids cub / bear /
great bear; fenrirbrood black pup / black wolf / Fenrir's get; walrushaulout calf / walrus / walrus bull;
eagleeyrie eaglet / sea eagle / old sea eagle; moosemire calf / moose / moose bull; sealhaulout pup /
seal / seal bull; beaverlodge kit / beaver / old beaver; cranedance chick / crane / lead crane;
harewarren leveret / hare / jack hare; deerglade fawn / deer / stag; otterslide pup / otter / old otter;
whaleroad whale calf / humpback / old bull.

**Full garrison** at effective level `L`:

| Strength | young | adult | alpha |
|---|---|---|---|
| weak | `2 + L` | `3 + 2L` | `max(0, L - 2)` |
| strong | `2 + L` | `3 + 3L` | `L - 1` |

Defense power (Σ count × defense): strong L1 195, L5 815, L10 1 590, L25 3 915, L100 ~16 000; weak L1 66,
L5 245, L25 1 265.

### Effective level

`EffectiveLevel = min(100, Level + floor(Clears / 10))`: every 10th clear of a camp (by any player)
raises it a level, up to 100, and it never drops back. The **guard range stays on the rolled `Level`**
(`GuardRange(Level, strength)`, 1 to 7 hexes), so a farmed camp gets tougher but never holds more land
or costs start positions. Loot grows slower than the garrison, so an early clear pays far more than it
costs and a late one is only moderate:

### Loot

`pool(L) = base × L^0.7` (strong base 1 800, weak base 450), split over the camp's loot kinds
(section Loot below) by weight: each kind 1, a `++` kind 2. The army takes what its survivors can carry
(`BattleResolver.ComputeLootWithCapacity`, the same carry cap as raids). Strong pool:
L1 1 800, L5 5 550, L10 9 020, L25 17 130, L100 45 210; weak L1 450, L5 1 390, L25 4 280.

- **Leftover**: what a clearing army cannot carry stays at the camp (`CampState.Leftover`, capped at one
  full pool of the camp's new effective level).
- **Partly regrown camp**: a hunt pays `Leftover + pool × f`, `f` = the garrison's current defense power /
  its full defense power, so re-clearing a barely regrown camp pays little.
- **Empty camp**: a hunt that reaches an empty camp fights nothing and takes what it can carry of the
  leftover (possibly nothing). It is not a clear: clears, regrowth and calm are unchanged.

### Hunting a camp

- New mission `hunt` (`ArmyMission.Hunt`): land units against land camps, **fleets against water camps** (the
  whale road) and neither the other; sent to the camp's hex (to the nearest reachable neighbour when the camp's
  own hex is not walkable, e.g. a river camp; a fleet sails to the water camp's own hex), with the usual
  round-trip food check.
- On arrival the garrison is settled to the arrival instant and the battle is fought with the ordinary
  attack rules (`BattleResolver` maths: army attack vs. beast defense, a tie goes to the camp, the loser
  loses everything, the winner `(loser/winner)^1.5`). No raid caps, no tower bonus.
- Army wins: the camp is **cleared** (garrison 0, `ClearedAt`, `Clears + 1`), loot as above, the survivors
  walk home on the precomputed return leg. Camp wins: the army is gone, the camp keeps its survivors.
- An empty camp (already cleared): no fight; the army picks up leftover loot (see Loot) and turns home.

### Regrowth, calm and respawn

- **Regrowth**: a damaged camp regrows gradually, each tier linearly to its full count over **4 h (weak) / 8 h
  (strong)** (`floor(full × elapsed / regrow)` on top of the snapshot), computed lazily from the stored
  snapshot like the resource pool.
- **Calm**: after any fight (hunt, ambush, tower attack) a camp is calm for **24 h** (`CalmUntil`): it
  regrows but does not attack. A camp nobody has fought is never calm.
- **Respawn** of a cleared camp: it regrows (from `ClearedAt`) only while its hex is **outside every
  realm** (no settlement's claim covers it). An empty camp inside a realm never refills; it keeps its
  empty art. The realm test is made when the state is read, so a camp whose realm disappears refills as
  if it had been outside all along (an accepted approximation).
- **Fenrir's brood** always regrows, inside a realm too, and is never removed. So does every water camp (the whale road).
- **Building on a camp**: a cleared, empty camp is buildable under its ground's normal rules (not
  Fenrir's brood; the eyrie's mountain is never buildable). A building on the hex removes the camp from
  the map for as long as it stands; when the building is gone and the hex is outside every realm, the
  camp comes back (regrowing as above).

### Strong camps attack

Only **strong** camps attack, and only when **aggressive**: not calm and with at least one adult or
alpha alive. Camp-initiated fights use the beasts' **attack** against the units' **defense** and are
**raid-capped** (both sides lose at most half), so a camp is never cleared by its own attack.

- **Ambush**: an army (not retreat-immune; land armies by land camps, fleets by water camps, see
  [Water camps](#water-camps)) whose route enters an aggressive strong camp's guard
  range is attacked at the instant it enters (`CampAmbush.EarliestAmbush`, the earliest over all camps,
  checked when the army is settled, like field battles). A hunting army is not ambushed by the camp it
  hunts; an army that sets out from inside the range is attacked as it leaves. Army loses: it retreats home from where it stands (`Army.ForceFieldRetreat`). Army wins: it
  marches on. Either way the camp is then calm for 24 h.
- **Towers**: building a tower inside an aggressive strong camp's guard range is **allowed** (the client
  warns). The camp attacks it **30 min** after its construction started, or for a standing tower as soon
  as the camp is aggressive (`CampAggressionHostedService`, every minute). The tower is defended only by
  the owner's armies **standing on the tower hex** (arrived, not yet turned around); if there are none, or
  they lose, a tower under construction burns (the order is dropped, its cost is lost) and a standing
  tower is razed. Either way the camp is then calm for 24 h.

### Reports

Every camp fight writes a `CampReport` (kind `hunt`, `ambush` or `tower`): camp coord, family,
effective level, the player's settlement and army, the winner, both powers, seed, the player's units
(sent / lost) and the beasts (before / lost) per tier, loot, whether the camp was cleared and whether a
tower burned. `GET /settlements/{id}/camp-reports`, `GET /camp-reports/{id}`; the reports inbox shows them
under "Camps".

### State and API

- `camp_states` (world, q, r): tier counts at `SnapshotAt`, `ClearedAt`, `CalmUntil`, `Clears`, `Leftover`. No row
  means a pristine camp: full garrison at its rolled level, aggressive.
- `GET /worlds/{worldId}/camps[?islandId=]`: every camp's live state (effective level, garrison per tier,
  cleared, calm until, clears, removed by a building).

## Loot (kinds only)

Clearing a camp pays loot (`economy.md` section 10) in the four resources. The kinds are the owner's mix of a
base rule and each camp's own extras from the design roster (#334's brainstorm); the amounts are still open.

- **Base rule:** every camp gives food, from the hunt; a strong camp adds iron, the gear of earlier settlers
  its pack has eaten (the whale road is the exception: food only, the sea holds no gear).
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
| whaleroad | strong | **food only** (no iron: the one strong camp that does not add it) |

Amounts: see [Loot](#loot) under Gameplay (`CampRules.LootPool`); the docs page (`WildlifeCampsView.vue`,
`LOOT_EXTRAS`/`lootOf`) shows the kinds per card.

## Data, API and art

- `GeneratedIsland.Camps` (`Camp`: coord, family, level, orientation; `Strong` and `GuardRange` derived),
  stored in `islands.Camps` (`CampListConverter`, `q,r,family,level,orientation` tokens; existing
  islands have none until a reseed), sent as `IslandResponse.camps` and in the admin preview island.
- Client: `WorldModel.setCamps` tags `Tile.camp`; demo mode places camps in `placeGiantsForIsland`; a
  camp hex is not buildable; `findLandfall` avoids strong camps.
- Build rule, also enforced server-side: `Settlement.PlanBuild` refuses a hex that holds a camp with
  `BuildRejection.HexOccupiedByCamp` (HTTP 409, `rejection: "HexOccupiedByCamp"`), checked right after the
  giant rule via `CampIndex` (`SettlementService.LoadCampIndexAsync`). Only a camp that is not empty
  blocks (and Fenrir's brood always does); a cleared camp is buildable, see Gameplay. The admin god-mode
  building edit is not gated.
- Render: the ground's own base plus the camp's guarded (`level001`) animated top, or its empty
  (`level000`) top once cleared, and no top while a building stands on it, from the
  `buildings-anim` atlas (bearrapids also brings its river base). The guarded art ships only one to
  three rotations; the tile orientation is mapped onto those (read off the atlas) by modulo in
  `TILE_ORIENTATIONS` order, and bearrapids picks the kept rotation with its river's channel
  (orientation index mod 3, a straight channel is symmetric).
- Preview: `npm run worldgen-preview -- --layers terrain,camps` (markers per family, ring = guard range).
