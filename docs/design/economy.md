# Economy & tech tree

Status: **agreed design.** The catalogue runs these numbers; the bog-ore works,
the Hammer Forge and the unit iron rework (§8) are in the game. Numbers are
tuned against the pacing simulator (the admin *Economy lab* page,
`/admin/economy`); change them together with it. Buildings marked * don't exist
in the game yet and come in their own PRs.

## 1. Design targets

These are the requirements every number below is tuned against. When a
formula changes, re-run the lab and check all of them.

| # | Target | Measured as |
|---|---|---|
| T1 | A new player is never waiting in the first 10 minutes | founding stock covers every build started in the first 10 min; first builds take 1–3 min |
| T2 | Something new unlocks often, one building at a time | at most one new building per Longhouse level (LH1 excepted); no run of 3+ LH levels without an unlock before LH 18 |
| T3 | 2nd settlement: optimising player ≈ **5 days**, average player ≈ **2 weeks** | simulator profiles `pro` / `average` (§6) |
| T4 | A settlement is "full" (LH 30, producers maxed) after **1–2 months** | `pro` ≈ 5–6 weeks, `average` ≈ 8–9 weeks |
| T5 | Later levels still pay off, but ever more slowly | producer payback grows ~7% per level (cost ×1.30 vs output ×1.20) |
| T6 | Troops come before settling | Cart Workshop (settlers) at LH 10, after Barracks (LH 5) and Dockyard (LH 8) |
| T7 | Territory grows through towers, not the Longhouse | Longhouse claim radius stops growing at LH 3 (§5) |

## 2. Resources

Wood, Stone, Food, Iron.

- **Wood** — Lumberjack (forest).
- **Stone** — the **Clay Brickworks** on bog ground is the start's stone
  source: bog is guaranteed in reach of every start (§8, `bog.md`), a
  mountain is not. Where a mountain is in reach, the **Quarry** is an
  alternative. Both unlock at LH 1.
- **Food** — Reindeer Herder (the default, any grass), later Farm / Pumpkin
  Farm by island soil (one tech-tree card), Fishing Hut on coastal water.
- **Iron** — comes from **bog ore**: the bog-ore works stand on bog ground
  (§8, `bog.md`), and a **Hammer Forge** (water-powered hammer mill) on a
  bog creek boosts them later, the way the Sawmill boosts Lumberjacks. Before
  the bog-ore works, the Longhouse is the only iron source, so buildings
  cost no iron; iron is a military resource (units, Tower).

The **Magic Tower is removed**. The **Smithy** is renamed **Weaponsmith**
(Waffenschmiede; its art has an anvil) so it doesn't clash with the
Hammer Forge. It produces nothing and is a troop-upgrade building only.
Only its display name changes; the internal type stays `smithy`.

## 3. Level formulas

For a building with level-1 values `C₁` (cost, per resource), `P₁`
(production/h) and `t₁` (build minutes):

```
cost(L)       = C₁ · g_c^(L−1)           g_c = 1.30  (Longhouse 1.34)
production(L) = P₁ · g_p^(L−1)           g_p = 1.20
buildTime(L)  = t₁ · g_t^(L−1)           g_t = 1.33
```

Costs and output are both geometric (Travian's shape), so the payback
`cost(L) / (production(L) − production(L−1))` grows by 1.30/1.20 ≈ 1.08
per level: the next level is always worth building, just less obviously.

### Level-1 values

| Building | C₁ wood/stone/food | P₁ /h | t₁ min |
|---|---|---|---|
| Producers (Lumberjack, Quarry, Clay, Herder, Farm, Fishing) | 50 / 40 / 15 | 40 | 3 |
| Longhouse | 120 / 100 / 60 | +15 wood, +12 stone, +15 food per level (linear) | 1.5 |
| Storage House | 80 / 60 / 0 | +600 capacity · 1.22^(L−1) | 2.5 |

(Other buildings: same formulas, `C₁`/`t₁` set per building in the
catalogue; the lab shows all of them.)

What this gives for a producer:

| L | cost (wood) | output /h | build time |
|---|---|---|---|
| 1 | 50 | 40 | 3 min |
| 5 | 143 | 83 | 9 min |
| 10 | 530 | 206 | 39 min |
| 15 | 1 969 | 514 | 2.7 h |
| 20 | 7 310 | 1 278 | 11 h |
| 25 | 27 140 | 3 180 | 47 h |

## 4. Max level per building

Not every building needs 25 levels; late-game buildings have fewer. The art
has 3–8 stages per building, and each level maps onto a stage
(`stage = ceil(L / maxLevel · stages)`).

| Group | Max level |
|---|---|
| Longhouse | 30 (also drives build slots and claim radius) |
| Resource producers (incl. the bog-ore works), Storage House | 25 |
| Military and civic buildings (Barracks, Archery Range, Dockyard, Town Square, Cart Workshop, Druid Hut, Weaponsmith, Meadery) | 20 |
| Mills (Sawmill, Crop Mill, Hammer Forge) | 20 |
| Tower | 10 |
| Great Storehouse | 10 |
| Shrines | 5 (one per settlement) |
| Palisade | 3 |

Construction slots: `2 + ⌊(LH − 5) / 5⌋` → 2 at LH 1–9, 7 at LH 30.

**What caps a building's level.** Most buildings can never be a higher level
than the Longhouse (level `L` needs LH `max(unlock, L)`), and Storage Houses
keep that cap. The **resource producers** (Lumberjack, Quarry, Clay Brickworks,
Reindeer Herder, Farm, Pumpkin Farm, Fishing Hut, bog-ore works) are capped by **storage**
instead: they only need their unlock LH at every level, and a level whose cost
exceeds what the settlement can store can never be afforded, so the next level
has to fit in storage. Each **additional Storage House** raises the bar: with `n` held (standing plus
queued), the next needs `min(n, 4)` Storage Houses at level
`min(10 + 5·(n − 1), 25)`, so the second needs one at L10, the third two at L15,
the fourth three at L20, the fifth four at L25, and once four are maxed any
number more is allowed (the first is never held back, and upgrading is always
allowed). See §5 for why.

## 5. Unlock ladder

Each building needs a Longhouse level, and at most one feeder building. The
Longhouse level is also the level cap for everything except the resource
producers, which storage caps instead (§4).
Early levels unlock one building each; late game comes in tiers (LH 15, 20,
25), since there is no need for an unlock at every late level.

| LH | Unlocks | Also needs |
|---|---|---|
| 1 | Lumberjack, Quarry, Clay Brickworks, Reindeer Herder, Storage House | — |
| 2 | Fishing Hut | — |
| 3 | Tower | — |
| 4 | Farm / Pumpkin Farm (one card, by island soil) | Reindeer Herder 3 |
| 5 | Barracks | Tower 3 |
| 6 | Town Square (feasts, §6), Bog-ore works (iron, §8) | — |
| 7 | Palisade / Palisade Gate (one card, the wall) | Tower 5 |
| 8 | Dockyard | Fishing Hut 5 |
| 9 | Archery Range | Barracks 5 |
| 10 | Cart Workshop (settlers) | Town Square 3 |
| 11 | Meadery | Farm 5 |
| 12 | Druid Hut | Town Square 5 |
| 15 | Weaponsmith, Great Storehouse | Barracks 10 / Storage House 15 |
| 20 | Sawmill, Crop Mill, Hammer Forge | Lumberjack 10 / Farm 10 / Bog-ore works 10 |
| 25 | Shrine of Ullr, Freyja, Njörd, Thor, and the Odin Statue | Sawmill 5 / Crop Mill 5 / Dockyard 10 / Weaponsmith 5 / **Druid Hut 10** (Odin) |

The shrines all open at LH 25, but each also needs its own feeder, so in
practice they still arrive one at a time.
The Odin Statue cannot ask for another shrine as its feeder, because a
settlement holds only one shrine in total (§5, Shrines), so it hangs off the
civic line's Druid Hut at level 10 instead.

### Why producers are capped by storage, not the Longhouse

If producers could never outlevel the Longhouse, an active player's economy
would stall at the cap while the Longhouse (the slow, expensive upgrade)
catches up, and a casual player who checks in twice a day would close the gap.
Capping producers by storage lets an active player's production run ahead.
Simulator result, production per hour (wood + stone + food) of an active
player (awake 07–23) relative to one checking in twice a day, 3 of each
producer:

| Rule | day 7 | day 14 | day 30 |
|---|---|---|---|
| producers capped at the Longhouse level | 2.4× | 3.0× | 1.7× |
| producers up to 3 levels ahead | 2.8× | 3.3× | 2.1× |
| producers limited only by storage | 2.7× | 3.4× | 3.8× |

With the Longhouse cap the casual player catches up once the active one
stalls at the cap; without it the active player's lead keeps growing.

Storage stays a real brake because a higher producer level costs more than
base capacity plus the Longhouse can hold, so storage has to grow with it.
Storage Houses themselves keep the Longhouse cap, and each additional one needs
more houses at a higher level (1 at L10, 2 at L15, 3 at L20, 4 at L25), so
storage cannot be stacked cheaply in place of upgrading.

**Design principle.** When an active player's first settlement slows down (the
Longhouse and storage become the limit), the answer is a second settlement,
not waiting: the renown threshold and Town Square feasts (§6) are tuned so an
optimising player can settle at about the point their first settlement's
growth flattens (~day 5), which gives them a new, fast-growing settlement to
play.

### Territory and towers

- **The Longhouse grows the realm only until towers are available.** Its
  claim radius is 2 at LH 1 and 3 from LH 2 on, and it stops there: from
  LH 3, when the first Tower unlocks, territory grows only through towers.
- **Tower count follows one rule:** 1 tower from LH 3, then one more for
  every second Longhouse level after LH 5:

  ```
  maxTowers(LH) = 0                          for LH < 3
                = 1 + max(0, ⌊(LH − 5) / 2⌋)  otherwise
  ```

  So LH 3–6 allow 1, LH 7 allows 2, LH 9 allows 3, …, and LH 29–30 allow 13.
  The tech tree shows only the first unlock (LH 3); the rule is shown where
  a tower is placed, not as extra tech-tree cards.
- **Producers are limited only by territory:** every matching hex inside
  the claim can hold one.
- **Rivers and bog creeks block space but pay for it.** A river hex can't
  take an ordinary building, but it is the only place for the mills, and a
  mill boosts every Lumberjack / Farm within its range (up to +100% at max
  level); a bog creek hex is the only place for the Hammer Forge, which does
  the same for bog-ore works. A river or creek running through a claim is a
  trade: fewer producer hexes, and a much stronger boost on the ones that are
  left.

### Shrines

A settlement holds **one shrine in total**, of any god (the Odin Statue counts
too), and each god has at most one shrine per island
(`BuildRejection.SettlementAlreadyHasShrine`). Which god a settlement serves is
therefore a real choice; stacking favours means holding several settlements and
merging them later.

| Shrine | Favour |
|---|---|
| Thor | + land unit attack (feeder: Weaponsmith) |
| Freyja | + food production |
| Ullr | + wood production |
| Njörd | + ship attack (coastal-water building) |
| Odin | two effects on his own settlement, both linear in level (max level 5): **Wisdom**, −2% build time per level (−10% at level 5), applied to every build order of the settlement at the moment the order starts, multiplicatively with the world speed; **Ravens**, +2 rings of vision per level (+10 at level 5) for the settlement's claim, its towers and its travelling armies (live vision and the persisted explored area). Cost and build time as the other shrines; feeder: Druid Hut 10 |

### Palisade

The settlement's wall, built **one hex at a time** (`BuildingType.Palisade` 30 and
`BuildingType.PalisadeGate` 31, wire ids `palisade` and `palisadegate`; they share
one tech-tree card, "Palisade / Gate", in the LH 7 row). It unlocks at Longhouse 7
behind a level-5 Tower, and has **3 levels**. Per hex it costs `C₁ = 40 wood /
10 stone`, no food, and takes `t₁ = 2 min` at level 1, with the standard growth
(cost ×1.30 and time ×1.33 per level). It has no production, storage or claim.

**Placement** (`Settlement.PlanBuild`, `Palisades/PalisadeRules.cs`; the frontend
mirrors it in `palisadeTiles.ts`, and `src/shared/palisade-golden.json` keeps the
two in step):

- On a land hex inside the settlement's claim: grass, forest, sand or **plain bog moss**
  (`BogTileKind.Bog`). Not mountain, a bog shore, mouth, creek or lake, any river tile
  (a stream or a wide river), or an occupied hex. A wall hex keeps its own ground
  (grass, forest floor without the trees, sand or bog moss) under the wall piece.
- Or on a **coastal-water hex** inside the claim, as the wall's **sea end**: it must
  touch exactly one land wall hex, and it can never be a gate.
- **Walls never branch**: no hex may end up with three or more wall neighbours,
  counting the new hex and the existing ones (`BuildRejection.PalisadeWouldBranch`).
  Queued wall orders count as wall hexes too. A gate and a plain wall count the same
  as wall hexes for neighbour and branch purposes.
- A **gate** only stands where its piece resolves to a straight (two opposite wall
  neighbours), and that must stay true after any later placement
  (`BuildRejection.GateNotOnStraight`).

**Pieces.** The piece a wall hex draws follows its wall neighbours (3D_assets
`docs/wall-tiles.md`): a straight (`palisade_straight180`), a gate
(`palisade_gate180`), a 60-degree bend (`palisade_bend60`, which only exists in a
triangle, since a fourth hex would branch), a 120-degree bend
(`palisade_bend120`), a land end with one neighbour (`palisade_end`) and the sea end
(`palisade_end_coast`). Each is drawn from the camera file that turns it onto its
neighbours, and a hex re-resolves when a neighbour is added or removed. A foundation (level 0)
draws art `level000`, the construction site; game levels 1-3 draw `level001`-`level003`,
and a level the atlas does not have yet shows the richest rung it has (level 3 shows
`level002` until the fourth stage is rendered).

**Movement** (land armies; fleets are unaffected). The rules apply in this order in
`HexPathfinder` and in the frontend's `hexPath.ts`: wide river and mountain
impassable, then stream flat 9, then half-open end 3, then blocked (unless a friendly
gate), then the terrain cost.

- Every wall hex **blocks every army, the owner's included**. Only standing hexes
  count (level 1 or more): a foundation does not block.
- A **gate** passes its **owner's** armies and their **friends'** at the normal terrain
  cost: friends are the owner's guildmates and the members of guilds with an active peace
  treaty with that guild (`WorldPalisades.IndexAsync` reads both). Anyone else is stopped
  like at any wall hex. A friend's plain wall hex still blocks, and an anonymous
  settlement has no friends.
- A **land end** (a plain palisade hex with exactly one wall neighbour) is **half open**:
  every army crosses it at a flat cost of 3 in place of the terrain cost (bog's 2 included). If it touches
  a mountain or a wide river it is a **sealed end** and blocks like any wall hex, so a
  wall run up to a river or a mountain still seals.
- The **sea end** stays sea, impassable to land armies, so a wall that ends in one
  seals up to the water. A wall whose last hex is a plain land end next to open sea
  does not: a hex grid has no diagonal moves, so the sea end would add nothing there,
  and the half-open end is the way through.
- A lone wall hex with no neighbour blocks and is walked round.

Routes are priced the same on both sides (`river-pathing-golden.json`: walls, a gate
for friend and foe, a half-open end and a sealed end), the dispatch is refused when no
land route is left, and the range tint applies the same rules for the selected
settlement's owner (friends come from the guild store: `friendlyUserIds`).

**Not built yet.** Siege and fire take a level off a wall hex at a time until it is
gone; nothing does yet (`TODO(economy.md section 5)` in `BuildingCatalogue.PalisadeHex`).
The admin building editor places a wall hex without the placement rules.

## 6. Settling and renown

A new settlement needs:

1. a Cart Workshop (LH 10, Town Square 3), so troops come first (T6);
2. 3 Settler Crews (the crew cost doubles per settlement already held);
3. **renown**: +1 per building level per hour, across all settlements
   (`Renown.cs`), never spent. Thresholds: **55 000** for the 2nd, then
   ×2 per settlement.

**Feasts (Town Square)** are what lets a strong player settle early:
Travian's celebrations.

- A feast needs a standing Town Square; its level TS sets the numbers.
- It costs `800 · 1.25^(TS−1)` of each of wood, stone and food, paid up front.
- It runs for 12 h and then grants `3 500 · 1.15^(TS−1)` renown to the account.
- Only one feast can run at a time per settlement. It does not use a
  construction slot.

The constants live in `Feasts.cs` (backend) and `lib/economy/feasts.ts` (lab).

An average player earns renown only from their buildings. An optimising
player turns surplus into feasts.

### Tuning the gain

The first guess, `6 000 · 1.20^(TS−1)`, was too strong: by day 60 the lab
showed 2.4–3.7 million renown against a 55 000 threshold, so feasts stopped
mattering and the Cart Workshop's Longhouse 10 unlock became the only gate.
The gain `G1 · g^(TS−1)` was picked on a grid, with the live catalogue and the
lab's defaults (join 09:00, 3/3/3 producers, 2 storage houses, producers 3
ahead), against four targets:

- active with feasts founds the 2nd settlement around day 5 (4.5–6.5), without
  around day 13–14;
- 4 check-ins with feasts around day 13–15;
- renown is the binding gate for the active player (it reaches 55 000 well
  after Longhouse 10, which is done on day 3.4);
- renown on day 30 with feasts stays within 3–6× the no-feast figure, so the
  3rd and 4th thresholds (110k, 220k) still mean something.

| G1 | g | active 2nd | active renown 55k | active r30 (x no-feast) | 4 check-ins 2nd | 4 check-ins r30 (x) | 2 check-ins 2nd |
|---|---|---|---|---|---|---|---|
| no feasts | | d13.48 | d13.47 | 162k | d20.65 | 106k | d28.18 |
| 1500 | 1 | d10.08 | d10.08 | 241k (1.5x) | d16.18 | 157k (1.5x) | d25.98 |
| 1500 | 1.05 | d9.42 | d9.42 | 281k (1.7x) | d15.63 | 175k (1.7x) | d25.98 |
| 1500 | 1.1 | d8.72 | d8.72 | 340k (2.1x) | d15.43 | 201k (1.9x) | d25.98 |
| 1500 | 1.15 | d8.03 | d8.03 | 423k (2.6x) | d15.00 | 235k (2.2x) | d25.98 |
| 1500 | 1.2 | d7.52 | d7.52 | 541k (3.3x) | d14.95 | 283k (2.7x) | d25.98 |
| 2500 | 1 | d8.92 | d8.92 | 294k (1.8x) | d14.46 | 191k (1.8x) | d25.98 |
| 2500 | 1.05 | d8.14 | d8.14 | 361k (2.2x) | d14.07 | 221k (2.1x) | d25.98 |
| 2500 | 1.1 | d7.42 | d7.42 | 459k (2.8x) | d13.63 | 264k (2.5x) | d25.98 |
| 2500 | 1.15 | d7.05 | d7.05 | 598k (3.7x) | d13.63 | 322k (3.0x) | d25.98 |
| 2500 | 1.2 | d6.92 | d6.92 | 794k (4.9x) | d13.27 | 402k (3.8x) | d25.98 |
| 3500 | 1 | d7.92 | d7.92 | 347k (2.1x) | d13.00 | 225k (2.1x) | d25.98 |
| 3500 | 1.05 | d7.42 | d7.42 | 441k (2.7x) | d13.00 | 268k (2.5x) | d25.98 |
| 3500 | 1.1 | d6.92 | d6.92 | 578k (3.6x) | d12.98 | 327k (3.1x) | d25.98 |
| 3500 | 1.15 | d6.42 | d6.42 | 773k (4.8x) | d12.98 | 408k (3.9x) | d25.98 |
| 3500 | 1.2 | d6.42 | d6.42 | 1046k (6.4x) | d12.98 | 520k (4.9x) | d25.98 |
| 4000 | 1 | d7.55 | d7.55 | 374k (2.3x) | d12.98 | 242k (2.3x) | d25.98 |
| 4000 | 1.05 | d6.92 | d6.92 | 481k (3.0x) | d12.98 | 291k (2.7x) | d25.98 |
| 4000 | 1.1 | d6.67 | d6.67 | 638k (3.9x) | d12.98 | 358k (3.4x) | d25.98 |
| 4000 | 1.15 | d6.42 | d6.42 | 860k (5.3x) | d12.98 | 451k (4.3x) | d25.98 |
| 4000 | 1.2 | d5.92 | d5.92 | 1173k (7.2x) | d12.98 | 579k (5.5x) | d25.98 |
| 5000 | 1 | d6.92 | d6.92 | 427k (2.6x) | d12.98 | 276k (2.6x) | d25.98 |
| 5000 | 1.05 | d6.51 | d6.51 | 561k (3.5x) | d12.98 | 337k (3.2x) | d25.98 |
| 5000 | 1.1 | d6.42 | d6.42 | 757k (4.7x) | d12.98 | 421k (4.0x) | d25.98 |
| 5000 | 1.15 | d5.92 | d5.92 | 1035k (6.4x) | d12.98 | 538k (5.1x) | d25.98 |
| 5000 | 1.2 | d5.92 | d5.92 | 1425k (8.8x) | d12.98 | 697k (6.6x) | d25.98 |
| 6000 | 1 | d6.67 | d6.67 | 480k (3.0x) | d12.98 | 310k (2.9x) | d25.98 |
| 6000 | 1.05 | d6.42 | d6.42 | 641k (3.9x) | d12.98 | 383k (3.6x) | d25.98 |
| 6000 | 1.1 | d5.92 | d5.92 | 875k (5.4x) | d12.98 | 484k (4.6x) | d25.98 |
| 6000 | 1.15 | d5.92 | d5.92 | 1209k (7.4x) | d12.98 | 624k (5.9x) | d25.98 |
| 6000 | 1.2 | d5.43 | d5.42 | 1678k (10.3x) | d12.98 | 815k (7.7x) | d25.98 |

**Chosen: `G(TS) = 3 500 · 1.15^(TS−1)`.**

| Profile | 2nd settlement, no feasts | 2nd settlement, feasts | Renown reaches 55k (feasts) | Longhouse 10 | Renown day 30, feasts (no feasts) | Binds with feasts |
|---|---|---|---|---|---|---|
| active | d13.5 | d6.4 | d6.4 | d3.4 | 773k (162k, 4.8×) | renown |
| 4 check-ins | d20.7 | d13.0 | d12.5 | d13.0 | 408k (106k, 3.9×) | Longhouse 10 (renown half a day earlier) |
| 2 check-ins | d28.2 | d26.0 | d18.5 | d26.0 | 211k (61k, 3.4×) | Longhouse 10 |

These runs predate the faster Longhouse (t₁ 1.5 min ×1.33, §3). With it, the
4-check-ins player settles about half a day earlier (d12.35 in the lab test).

Feasts are what lets an active player settle a week early. A casual player
gains a few days at most, because the Longhouse 10 unlock is still ahead of
their renown.

## 7. First 10 minutes (T1)

- Founding stock: the starting storage nearly full — capacity (500 base +
  250 from the Longhouse) less 50, so 700 wood / 700 stone / 700 food, no
  iron.
- Level-1 producers cost 50 / 40 / 15 and build in 3 min; the Longhouse is
  +15 / 12 / 15 per level.
- **Onboarding quests pay resources** (Travian's task list), so the first
  hour keeps moving. They never hand out a finished building, so the
  Longhouse 2 upgrade the tutorial asks for has to build fast: the
  Longhouse's `t₁` is 1.5 min at the shared ×1.33, so LH 2 builds in about 2
  min. The tutorial also walks the player through placing a Storage
  House and upgrading the Longhouse.

  The quests come in this order (`Bjarnoy.Domain.Settlers.Quests`, mirrored
  for demo mode in `src/frontend/src/lib/quests.ts`):

  | # | Quest | Condition | Reward (wood / stone / food) |
  |---|---|---|---|
  | 1 | 3 producers built | 3 standing resource producers | 150 / 120 / 80 |
  | 2 | Longhouse 2 | Longhouse level 2 or more | 250 / 200 / 150 |
  | 3 | First Storage House | a standing Storage House | 200 / 200 / 200 |
  | 4 | 6 producers built | 6 standing resource producers | 200 / 150 / 100 |
  | 5 | Longhouse 3 | Longhouse level 3 or more | 400 / 300 / 200 |
  | 6 | Longhouse 5 | Longhouse level 5 or more | 800 / 600 / 400 |

  Rules:

  - **Manual claim.** A completed quest pays nothing until the player presses
    Claim in the quest tray (`POST /settlements/{id}/quests/{questId}/claim`).
    The tray shows the first unclaimed quest, plus any other completed one so
    it can be claimed; quests can be claimed in any order.
  - **Exactly once per settlement.** Each quest has a bit in the settlement's
    claimed-quests mask, set in the same save that pays the reward, so a
    double click or a retry gets a 409 (`AlreadyClaimed`), never a second
    payment. A second settlement has its own list.
  - **Only standing buildings count.** Queued and under-construction orders do
    not; a producer is any building (other than the Longhouse) that yields
    wood, stone, food or iron of its own, so storage, towers and the
    radius-boost buildings (Sawmill, Crop Mill) do not.
  - **Clamped to storage.** The reward is deposited like any other income, so
    whatever would exceed a resource's storage capacity is lost; the tray
    warns when a reward will not fully fit.
  - **Never a building.** Rewards are resources only, never a finished or
    free building.

Simulated: the first 25 minutes are continuous building (9 producers, then
LH 2 at about 13 min), LH 3 at about 1h45.

## 8. Iron: bog ore

Viking-age Norse iron did not come from mountains. It came from ore that
forms by itself where iron-rich fresh groundwater meets air:

- **Bog iron** (Old Norse *mýrr*, German Raseneisenerz or Sumpferz): rusty
  lumps a spade's depth under wet moss ground and bog edges.
- **Lake ore** (Seeerz, Swedish *sjömalm*): the same process on lake
  bottoms.
- Not sea water: the sea doesn't form this ore.
- The ore was dug, roasted, and smelted on site in a small clay furnace
  (Rennofen, bloomery) with charcoal, giving a bloom (Luppe) that the smith
  hammered into iron. Rock-ore mines in mountains only mattered after the
  Viking age.

The art for this is the **bog set** in `VanDooProject/3D_assets`
(`docs/bog-tiles.md` there, PRs #115 and #116). The game side is in
[`bog.md`](./bog.md):

- **Bog ground** (moss), with bog creeks and bog lakes.
- **Bog-ore works** on plain bog moss: the iron producer, from diggings to a
  bloomery over 7 art levels (a level past the last shows the last).
- **Clay Brickworks** moves from grass onto plain bog moss.
- A **lake Fishing Hut** on stilts on a lake's half shore, the same building
  as the coastal one.
- A **Hammer Forge** on a bog creek (straight or bend): boosts bog-ore works
  within range, with the mills' percent and range curve. It is drawn with the
  river hammer-mill art until its own bog-creek art exists.

A furnace alone creates no ore, so bog ore is the only real source, and the
Longhouse gives a small trickle (+2 iron/h per level).

**Iron is an indirect gate for the army.** Buildings cost no iron. Every
unit costs iron except the cheap first unit (Thrall), so how fast you can
raise troops depends on your iron income. For that to work, the iron
sources have to line up with the unit unlocks:

| When | Iron source | Units it has to carry |
|---|---|---|
| LH 1–5 | Longhouse trickle only (2–10 iron/h) | Thrall (no iron), then the first Spearmen when the Barracks opens at LH 5 |
| from ~LH 6 | bog-ore works: bog ground has to be in reach of every start (`bog.md`) | the main army: Spearman, Axeman, Bowman, Karve, Settler Crew, Provisioner |
| LH 20 | Hammer Forge (bog creek) boosts bog ore | elite units: Berserker, Catapult, Longship |

So bog ground and the bog-ore works are needed by about LH 6, not as a
late add-on. The unit costs and unlock levels are reworked together with
them so the levels match. *Implemented:*

- the Thrall costs no iron (it was 15); every other unit still does (Spearman
  40, Axeman 60, Bowman 50, Berserker 120, Provisioner 20, Karve 100,
  Longship 220, Settler Crew 100, Catapult 250);
- each unit's Longhouse gate follows the building that trains it:

  | Unit | Trained at | Longhouse gate (was) |
  |---|---|---|
  | Thrall | Barracks | the Barracks' own gate (LH 5); no gate of its own (1) |
  | Spearman | Barracks | 5 (1) |
  | Axeman | Barracks | 6 (3): opens with the first bog-ore works |
  | Karve | Dockyard | 8 (5) |
  | Bowman | Archery Range | 9 (4) |
  | Provisioner, Settler Crew | Cart Workshop | 10 (4, 5) |
  | Berserker, Catapult, Longship | Barracks, Archery Range, Dockyard | 20 (6, 10, 8): with the Hammer Forge |

  (Berserker still needs the Axeman, Catapult the Berserker, Longship the
  Karve.) The elite units are gated by the Longhouse level only, not by a
  standing Hammer Forge: not every settlement has a creek.

### Bog-ore works numbers (Economy lab)

The bog-ore works follow the producer formulas (§3): cost 50 / 40 / 15 like
the other producers, output `P₁ · 1.20^(L−1)`, terrain boost +10% per
neighbouring bog, creek or lake hex up to +50%, storage-capped (§4). **P₁ = 20
iron/h** (the other producers: 40). The lab places a producer that unlocks late
(a level-1 gate above Longhouse 1) when its Longhouse level, prerequisites, a
free slot and the stock allow, instead of assuming it stands from minute 0.

Why 20: iron is the indirect gate for the army, so it must stay scarcer than
wood. A unit costs about half as much iron as wood (Spearman 40 iron / 80
wood, Karve 100 / 250, Catapult 250 / 300), so iron income at about **half of
wood income** makes both equally binding. With the default three bog-ore
works the lab (three producers each of wood, stone and food, two storage
houses, producers up to three levels ahead) gives iron/wood 0.44 to 0.49 from
Longhouse 8 on; one works gives 0.16, so a settlement with one works is
iron-limited. P₁ 40 gave 0.9 (iron never binds), P₁ 10 gave 0.23.

Iron per hour by Longhouse level (three works, P₁ 20; the Longhouse trickle
included). The profile only shifts *when* a level is reached:

| LH | iron/h | reached: active | 4 check-ins | 2 check-ins |
|---|---|---|---|---|
| 5 (Barracks) | 10 | day 1.3 | day 5.4 | day 11.0 |
| 6 (works open) | 98 (32 for the check-in profiles, whose works are still level 1) | day 2.0 | day 6.5 | day 13.5 |
| 8 | 326 | day 3.0 | day 12.2 | day 24.5 |
| 10 | 466 | day 4.2 | day 16.2 | day 32.5 |
| 15 | 1 139 | day 9.2 | day 25.4 | day 48.5 |
| 20 | 2 800 | day 21.2 | day 40.6 | — (past day 60) |

Iron before the works is the Longhouse trickle alone (2/h per level: 10/h at
LH 5), which has banked 139 iron at LH 5 for the active profile (622 and 1 256
for the slower ones): the first three Spearmen (40 each) are affordable the
moment the Barracks open, ten of them about 17 h later. Every other unit is
affordable the moment its gate opens, because its gate opens with or after the
works: Axeman at LH 6 (361 iron banked), Karve at LH 8, Settler Crew and
Provisioner at LH 10, the elite units at LH 20 (income 2 800/h against a
Catapult's 250).

Second-settlement timing (§6) is unchanged as long as the lab's default
producers are used (no bog-ore works: 6.4 / 12.3 / 25.0 days for active / 4
check-ins / 2 check-ins). A lab run that adds works delays it, because the
simulator's greedy player upgrades the scarce iron producer ahead of the others:
one works gives 7.4 / 14.3 / 29.0 days, three works 7.1 / 16.1 / 32.5. That is a
simulator artefact (a player raises iron only as far as the army needs), not a
target; the default count stays 0.

## 9. Pacing model (the Economy lab)

The admin **Economy lab** (`/admin/economy`) simulates one settlement minute
by minute against the live building catalogue. It is how every number in
this document is checked.

### Player profiles

| Profile | Online |
|---|---|
| active | awake 07–23, acting whenever a build slot is free (8 h sleep) |
| 4 check-ins | four short sessions a day (e.g. 08, 12, 17, 21) |
| 2 check-ins | two short sessions a day (08, 20) |

A check-in is a **short session** (10 minutes), not a whole hour online: a
profile is a list of daily `{start, minutes}` sessions and the player only
acts inside them, starting at a join time (default 09:00). The lab also has a
24 h reference profile and an editable custom schedule, a *producers ahead of
the Longhouse* strategy setting, a what-if panel (growth factors and level-1
values, shown dashed next to the live catalogue) and a second-settlement
check (renown, optional feasts).

### What the simulator showed

- **Measure economic strength as production per hour on a given day**, not
  as "days until Longhouse X". When producers may run ahead of the Longhouse,
  a player who invests in them levels the Longhouse later while being
  stronger.
- **Without combat, the active player's lead comes from the build queue.**
  A 2-check-ins player fills the slots, logs off, and the slots sit idle
  until the next visit. That gap (about 2.1× to Longhouse 20) barely moves
  with the economy knobs:

  | Change | Gap at Longhouse 20 (active vs 2 check-ins) |
  |---|---|
  | today | 2.15× |
  | Longhouse cost ×1.5 | 1.98× |
  | Longhouse cost ×2 | 1.79× |
  | storage houses hold 30–50% as much | 1.98–2.08× |

  A pricier Longhouse **shrinks** the gap: it adds waiting for everyone, and
  waiting costs a casual player nothing. Storage pressure hardly matters
  either, because a casual player runs out of queue before storage overflows.
- **The Longhouse cap on producers let casual players catch up.** An active
  player stalled at the cap. Capping producers by storage instead keeps the
  lead growing (§5, "Why producers are capped by storage").

### Build times

Short build times do two things at once: the first hour is a run of real
moves instead of waiting, and a player who checks in often can chain builds
while an infrequent player's slots sit idle. The cost is that casual players
fall further behind and everyone reaches the caps sooner. Hence the growing
curve (×1.33 per level): short early for the entry, long late so a casual
player can keep up.

Towers follow the same logic (8 min at level 1, about 1 h 45 at level 10).
The active edge there is bounded by the tower count, which grows with the
Longhouse (§5), so the edge is getting each tower sooner, not getting more
of them. The premium build queue works the other way: it lets a casual
player queue past full slots, which gives back some of the idle time.

## 10. Raiding, wildlife and snowballing

### Where an active player's early loot comes from

In Travian the early production rush comes from farming: inactive players,
oases and NPC villages. Bjarnoy's version:

- **Wildlife on empty islands.** Unclaimed islands are guarded by wildlife
  (wolves, bears; a seal colony on the coast). Founding a settlement there is
  allowed (land troops need a base on the island to fight from), but **no
  tower can go up within a guarded camp's range** ("wolves eat the
  builders"). The range depends on the camp's level, rolled at random when
  the camp spawns: a strong camp holds a wide stretch of land, a weak one
  only its nearest hexes. A small island can be held whole by one camp; on
  a big one a player clears only the camps in the way and builds towers
  where the land is then free. Clearing a camp gives loot. **Exploring and
  clearing new islands must pay much more than farming smaller players.**
  Spawn, levels and guard ranges are implemented (no gameplay yet): see
  [`wildlife-camps.md`](./wildlife-camps.md).
- **Beast dens** are the oasis equivalent: raidable spots whose loot grows
  back over time, and which can later be annexed for a production bonus.
- **Merchant ships** sail NPC routes between islands and can be raided at
  sea.
- **Inactive players** become raidable, but only after several days of
  inactivity (7 by default).
- **Late game:** the Jötunn outposts and the giant fortress.

The NPC side hooks into the existing NPC settlement design (issue #125:
peaceful, hostile and trader villages). The beginner-protection design
(`beginner-protection.md` §4) already points a new player's first raids at
peaceful NPC villages.

### Keeping snowballing in check

- **Size-gap protection with revenge.** A player can't attack a settlement
  whose Longhouse is more than 5 levels below theirs, unless that settlement
  attacked them in the last 48 hours. Inactive players (§ above) are exempt.
- **Hideout.** Storage buildings hide a share of the stock from plunder
  (10% by default, growing with the storage house level) — Travian's cranny,
  built into the storage houses rather than a separate building.
- When an active player's first settlement slows down, the answer is a
  **second settlement**, not attacking smaller neighbours (§6).

The defaults above (5 levels, 48 h, 7 days, 10%) are starting values to
tune, not settled numbers.

## 11. Roadmap

Open work, in rough order. Each is its own PR.

1. ~~**Economy lab:** session-based profiles, what-if panel, producers-ahead
   strategy and second settlement.~~ Done.
2. ~~**Feasts and renown** (§6): Town Square feasts, and the renown threshold
   for the 2nd settlement at 55 000.~~ Done.
3. **Tutorial** (§7): placing a Storage House and upgrading the Longhouse,
   resource rewards for the onboarding steps, and a fast Longhouse 2 (about
   2 minutes).
4. ~~Merge Fishing Hut and Fisher Hut~~ into one coastal building: done. The
   Fisher Hut is gone from the catalogue; a stored Fisher Hut (and a queued
   order for one) becomes a Fishing Hut at the same hex and level when its
   settlement loads. The enum value 15 stays so persisted rows still read.
5. **New buildings:** ~~the Reindeer Herder~~ (done: the default food building,
   LH 1, grass, the standard producer numbers and no terrain boost; Farm and
   Pumpkin Farm moved to LH 4 behind a level-3 Herder, shown as one card by
   soil), the Odin Statue (Ravens and
   Wisdom, §5) and the Palisade (§5).
6. ~~**Bogs and iron** (§8, `bog.md`): bog ground, creeks and lakes in world
   generation, the bog-ore works, Clay Brickworks on bog ground, the lake
   Fishing Hut, and the Hammer Forge.~~ Done (the Hammer Forge with the
   river mill's art until the bog-creek art exists).
7. ~~**Units and iron:** every unit except the Thrall costs iron, and the unit
   unlock levels follow the building ladder, matched to the iron sources.~~
   Done (§8).
8. **Raiding and snowballing** (§10): wildlife on empty islands, beast dens,
   merchant ships, size-gap protection with revenge, and the hideout.

## 12. Open questions

- ~~Fishing Hut and Fisher Hut~~: merged into one coastal building (the
  Fishing Hut). The lake version (on stilts on a bog-lake half shore) is the
  same building, with its own art.
- The profile parameters (online hours, share spent on troops) are
  assumptions; real telemetry should replace them once players exist.
