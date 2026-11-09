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
| T1 | A new player is never waiting in the first 10 minutes | founding stock covers every build started in the first 10 min; first builds take 1–3 min (1, 2.8 and 8 min at levels 1 to 3) |
| T2 | Something new unlocks often, one building at a time | at most one new building per Longhouse level (LH1 excepted); no run of 3+ LH levels without an unlock before LH 18 |
| T3 | 2nd settlement: optimising player ≈ **1 week**, average player ≈ **2 weeks** | simulated (§6, with feasts): active d7.1, 4 check-ins d15.0, 2 check-ins d30.0; without feasts the active player d11.6; with the §9 build-time curves d16.3, d24.5, d34.5 (§6) |
| T4 | A settlement is "full" (LH 30, producers maxed) after about **4–7 months** (LH 30 needs Great Storehouses, the Longhouse costs ×1.60 per level from level 11) | simulated: active ≈ d138 (about 4.5 months), 4 check-ins ≈ d207 (about 7 months) |
| T5 | Later levels still pay off, but ever more slowly | producer payback grows ~8% per level (cost ×1.30 vs the level's added output ×1.20) |
| T6 | Troops come before settling | Cart Workshop (settlers) at LH 10, after Barracks (LH 5) and Dockyard (LH 8) |
| T7 | Territory grows through towers, not the Longhouse | Longhouse claim radius stops growing at LH 3 (§5) |

### World speed

Each world has a speed factor (1 = normal). It scales:

- production (×)
- build, training and feast times (÷); build times also take Odin's Wisdom
- the decay of buildings outside the realm (÷)
- travel time of armies and fleets (÷)

It does not scale troop upkeep (at home or on the march), how much food an army carries, or fight stats: those run
per real hour on every world. So on a fast world a full load of provisions reaches correspondingly farther.

## 2. Resources

Wood, Brick, Food, Iron. (The internal key stays `stone` in the API, stores and i18n keys; the German name is Stein.)

- **Wood** — Lumberjack (forest).
- **Brick** — the **Clay Brickworks** on bog ground is the start's brick
  source: bog is guaranteed in reach of every start (§8, `bog.md`), a
  mountain is not. Where a mountain is in reach, the **Quarry** is an
  alternative. Both unlock at LH 1.
- **Food** — Reindeer Herder (the default, any grass), later Farm / Pumpkin
  Farm by island soil (one tech-tree card), Fishing Hut on coastal water.
- **Iron** — comes from **bog ore**: the bog-ore works stand on bog ground
  (§8, `bog.md`), and a **Hammer Forge** (water-powered hammer mill) on a
  bog creek boosts them later, the way the Sawmill boosts Lumberjacks. Before
  the bog-ore works there is no iron source, so buildings cost no iron;
  iron is a military resource (units).

The **Magic Tower is removed**. The **Smithy** is renamed **Weaponsmith**
(Waffenschmiede; its art has an anvil) so it doesn't clash with the
Hammer Forge. It produces nothing and is a troop-upgrade building only.
Only its display name changes; the internal type stays `smithy`.

## 3. Level formulas

For a building with level-1 values `C₁` (cost, per resource), `P₁`
(production/h); build time follows its own curves (below):

```
cost(L)       = C₁ · g_c^(L−1)           g_c = 1.30  (some buildings have their own, see below)
                                         producers: levels 1, 2, 3 are multiplied by 0.6, 0.75, 0.9
cost_LH(L)    = C₁ · 1.34^(L−1)          for L ≤ 10
cost_LH(L)    = C₁ · 1.34^9 · 1.60^(L−10)  for L > 10
production(L) = I₁ · (g_p^L − 1) / (g_p − 1)   g_p = 1.20
buildTime(L)  = see "Build times" below       early curve (Longhouse, producers, Storage House) or tech curve (the rest)
```

Build times, in minutes, rounded to whole seconds (`BuildingCatalogue.BuildTime`, one table):

- **Early curve** (Longhouse, all resource producers, Storage House): 1 min at level 1, `8^(1/2)` = 2.83 min at level 2, 8 min at level 3, then doubling (16, 32, 64 min) up to level 6; from level 6 to the max level a log-like tail `64 + (top − 64) · ln(1 + 3u) / ln 4` with `u = (L − 6) / (max − 6)`.
- **Tech curve** (every other building): a level-1 time by tech-tree position, then a straight line to the top-level time at the max level: `t₁ + (top − t₁) · (L − 1) / (max − 1)`.

Costs and output are both geometric (Travian's shape). Each level of a
producer adds `I₁ · g_p^(L−1)` per hour (increment-geometric), so `production(L)`
is the level total, the same shape as the storage buildings' capacity. The payback
`cost(L) / (production(L) − production(L−1))` therefore grows by 1.30/1.20 ≈ 1.08
per level: the next level is always worth building, just less obviously.

Every cost is rounded once for display and charge, per resource: below 100 to a
whole number, 100–999 to the nearest 10, 1 000–9 999 to the nearest 50,
10 000–99 999 to the nearest 500 (from four digits, a step of `5 · 10^(digits−3)`).

### Level-1 values

| Building | C₁ wood/brick/food | I₁ /h | build time: t₁ → top (max level) |
|---|---|---|---|
| Lumberjack | 16 / 49 / 30 | 8 wood | 1 min → 20 h (L25) |
| Clay Brickworks | 52 / 10 / 33 | 8 brick | 1 min → 22 h (L25) |
| Quarry | 55 / 8 / 33 | 8 brick | 1 min → 22 h (L25) |
| Reindeer Herder | 52 / 36 / 7 | 8 food | 1 min → 20 h (L25) |
| Farm | 57 / 29 / 9 | 12 food | 1 min → 22 h (L25) |
| Pumpkin Farm | 55 / 33 / 8 | 13 food | 1 min → 22 h (L25) |
| Fishing Hut | 49 / 39 / 7 | 16 food | 1 min → 22 h (L25) |
| Bog-ore works | 42 / 34 / 20 | 4 iron | 1 min → 24 h (L25) |
| Longhouse | 120 / 100 / 60 | +15 wood, +15 food per level (linear; no brick, no iron) | 1 min → 26 h (L30) |
| Storage House | 90 / 50 / 0, g_c 1.20 | +300 capacity · 1.22^(L−1) | 1 min → 20 h (L25) |
| Great Storehouse | 4 500 / 3 000 / 0, g_c 1.23 | +50 000 capacity · 1.25^(L−1) | 2 h → 30 h (L10) |
| Tower | 140 / 200 / 30 | | 10 min → 12 h (L5) |
| Barracks | 100 / 78 / 43 | | 15 min → 22 h (L20) |
| Town Square | 120 / 130 / 44 | | 20 min → 22 h (L20) |
| Dockyard | 410 / 99 / 33 | | 30 min → 24 h (L20) |
| Archery Range | 470 / 200 / 58 | | 45 min → 22 h (L20) |
| Cart Workshop | 680 / 230 / 75 | | 1 h → 22 h (L20) |
| Meadery | 860 / 470 / 230, g_c 1.30 | | 1 h → 24 h (L20) |
| Druid Hut | 1 050 / 640 / 780, g_c 1.619 | | 1.5 h → 24 h (L20) |
| Weaponsmith (Smithy) | 4 100 / 5 100 / 1 000, g_c 1.486 | | 2 h → 24 h (L20) |
| Siege Workshop | 26 500 / 13 000 / 2 200, g_c 1.379 | | 3 h → 24 h (L20) |
| Sawmill | 41 500 / 59 500 / 5 950, g_c 1.313 | | 4 h → 24 h (L20) |
| Crop Mill | 59 500 / 41 500 / 5 950, g_c 1.313 | | 4 h → 24 h (L20) |
| Hammer Forge (Hammerschmiede) | 59 000 / 37 500 / 10 500, g_c 1.313 | | 4 h → 24 h (L20) |
| Shrines (Thor, Freyja, Ullr, Njörd, Odin Statue) | 475 000 / 505 000 / 150 000, g_c 2.140 | | 6 h → 24 h (L5) |
| Palisade, Palisade Gate (per hex) | 540 / 150 / 40 | | 10 min → 1 h (L3) |

- The starting buildings (Longhouse, Tower, Lumberjack, Reindeer Herder) cost no brick up to and including level 5. The Clay Brickworks costs no brick at level 1.
- The Longhouse produces wood and food only: no brick, no iron.
- Each producer level adds 20% more output than the level before it, starting at 8/h for wood and brick.
- The food buildings are worth different amounts, so where you build food is a choice: Reindeer Herder 8/h (the start building), Farm 12/h, Pumpkin Farm 13/h, Fishing Hut 16/h (going to the shore for fish pays off).
- Farms are the upgrade over Reindeer Herders: once Farms unlock, it pays to build Farms instead and tear the old Herders down.
- The Pumpkin Farm yields more than the Farm, but no mill boosts it (the Crop Mill boosts Farms only).
- A building costs least of the resource it produces; each building has its own mix of wood, brick and food.
- Producer levels 1–3 cost less than the formula: ×0.6, ×0.75 and ×0.9.
- A building's level 1 costs about a quarter of the Longhouse upgrade at the level it unlocks. The late buildings (the Druid Hut and everything unlocking from Longhouse 15 on) grow so that their top level costs 40% of a Longhouse 30; the shrines and the Druid Hut 50%.
- The Longhouse gets dearer faster from level 11, after the level the second settlement needs.
- The Palisade is priced as a strong defensive building: 540 wood, 150 brick and 40 food per wall hex at level 1.
- Any number of Storage Houses may be built, and their level is not capped by the Longhouse.
- The Great Storehouse is the follow-up to the Storage House: to hold n Great Storehouses you need n Storage Houses at level 25.
- Maxing a storage building pays: each level is a little better value than the one before, because its cost grows slower than its capacity.
- Building costs are round numbers: below 100 exact, three digits to the nearest 10 (148 → 150), from four digits to the nearest half step of the second digit (1 458 → 1 450).

(Other buildings: same formulas, `C₁` set per building in the
catalogue; the lab shows all of them.)

What this gives for a producer:

(a Farm, I₁ = 12; the brick and food costs are 29/57 and 9/57 of the wood)

| L | cost (wood) | output /h | build time |
|---|---|---|---|
| 1 | 34 | 12 | 1 min |
| 5 | 160 | 89 | 32 min |
| 10 | 600 | 312 | 8.5 h |
| 15 | 2 250 | 864 | 14.4 h |
| 20 | 8 350 | 2 240 | 18.7 h |
| 25 | 31 000 | 5 664 | 22 h |

## 4. Max level per building

Not every building needs 25 levels; late-game buildings have fewer. The art
has 3–8 stages per building, and each level maps onto a stage
(`stage = ceil(L / maxLevel · stages)`).

| Group | Max level |
|---|---|
| Longhouse | 30 (also drives build slots and claim radius) |
| Resource producers (incl. the bog-ore works), Storage House | 25 |
| Military and civic buildings (Barracks, Archery Range, Siege Workshop, Dockyard, Town Square, Cart Workshop, Druid Hut, Weaponsmith, Meadery) | 20 |
| Mills (Sawmill, Crop Mill, Hammer Forge) | 20 |
| Tower | 5 |
| Great Storehouse | 10 |
| Shrines | 5 (one per settlement) |
| Palisade | 3 |
| Bridge | 4 |

Construction slots: `2 + ⌊(LH − 5) / 5⌋` → 2 at LH 1–9, 7 at LH 30.

**What caps a building's level.** Most buildings can never be a higher level
than the Longhouse (level `L` needs LH `max(unlock, L)`). The **resource producers** (Lumberjack, Quarry, Clay Brickworks,
Reindeer Herder, Farm, Pumpkin Farm, Fishing Hut, bog-ore works) and the **Storage House** are capped by **storage**
instead: they only need their unlock LH at every level, and a level whose cost
exceeds what the settlement can store can never be afforded, so the next level
has to fit in storage. Any number of Storage Houses may be built. A new
**Great Storehouse** needs one more Storage House at level 25 than the settlement
already holds Great Storehouses (standing plus queued): the n-th needs n maxed
Storage Houses (upgrading one is always allowed). See §5 for why.

## 5. Unlock ladder

Each building needs a Longhouse level, and at most one feeder building. The
Longhouse level is also the level cap for everything except the resource
producers, which storage caps instead (§4).
Early levels unlock one building each; late game comes in tiers (LH 15, 20,
25), since there is no need for an unlock at every late level.

| LH | Unlocks | Also needs |
|---|---|---|
| 1 | Lumberjack, Clay Brickworks, Reindeer Herder, Storage House (the Quarry is switched off: no new one can be built, standing ones keep working) | — |
| 2 | Fishing Hut | — |
| 3 | Tower, Bog-ore works (iron, §8) | — |
| 4 | Farm / Pumpkin Farm (one card, by island soil) | Reindeer Herder 3 |
| 5 | Barracks | Tower 3 |
| 6 | Town Square (feasts, §6) | — |
| 7 | Palisade / Palisade Gate (one card, the wall) | Tower 5 |
| 7 | Bridge (over a wide river) | Town Square 1 |
| 8 | Dockyard | Fishing Hut 5 |
| 9 | Archery Range | Barracks 5 |
| 10 | Cart Workshop (settlers) | Town Square 3 |
| 11 | Meadery | Farm 5 |
| 12 | Druid Hut | Town Square 5 |
| 15 | Weaponsmith, Great Storehouse | Barracks 10 / Storage House 25 (the n-th Great Storehouse: n Storage Houses at 25) |
| 18 | Siege Workshop (trains the catapult and the battering ram) | Archery Range 3 |
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
Simulator result, production per hour (wood + brick + food) of an active
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
Storage Houses are capped by storage too (any number, no Longhouse cap), and the
Great Storehouse, the big capacity step, needs maxed Storage Houses (the n-th
needs n at level 25), so the biggest storage cannot be had cheaply.

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
- **Where a tower stands:** on grass, sand, forest or plain bog moss (not a
  bog shore, creek, spring or lake). It replaces the tile it stands on; its
  art keeps that ground round it, so each ground has its own version of the
  tower.
- **Towers have to be chained to a longhouse.** A tower claims its ground only
  while it is connected: it stands on ground claimed by one of your
  longhouses, or by a tower that is itself connected. All of your longhouses
  on an island count, so a chain that a longhouse reaches from either end stays
  connected when a tower in the middle falls. A cut-off tower claims nothing and
  sees nothing until the link is rebuilt; it still counts for prerequisites. It
  does not count against the tower limit while cut off; once it is connected
  again it counts, even if that puts you over the limit (you then can't build
  more towers).
- **A destroyed longhouse ends the settlement's claim.** A settlement whose
  Longhouse is destroyed claims nothing at all, not even its centre hex (it
  contributes no disc to the chain). Its towers stay connected only if they
  stand within the claim of another Longhouse of yours, directly or through
  a chain of connected towers; otherwise they are cut off like any other
  cut-off tower.
- **A destroyed longhouse also ends the settlement's centre sight.** The settlement's centre vision disc (explored and
  visible ring, Odin's Ravens included) follows the same decision as its claim (`Settlement.LonghouseDisc`; server
  `FogVisionRadii.ToVisionSource`, client `WorldModel.visionDiscsFor`): without a standing Longhouse there is no disc, so
  nothing around the centre is seen or newly explored. Towers still chained to another Longhouse of yours keep their own
  sight and Ravens rings; armies' own sight is unaffected. Ground explored earlier stays explored.
- **How a tower claims:** a tower claims every hex within its level of
  itself (level 1 its neighbours, level 2 two rings, …), centred on the
  tower. It has to be built inside the realm, which includes ground another
  tower claimed, so towers can chain out across an island. A tower claims
  nothing while it is under construction (a level-0 stub claims only its own
  hex, which is already inside the realm); its ground joins the realm when
  level 1 finishes.
- **Giants are claimed whole:** a giant's seven hexes join the realm only when
  the claim covers all seven; a claim that reaches some of them takes none.
- **Buildings outside the realm decay.** A building whose hex is no longer
  inside the realm has no function: it stops producing and gives no bonus; a
  palisade still blocks, but a gate or bridge outside the realm is open to
  everyone. It loses a level at a steady pace until the realm reaches it
  again; at level 0 it is gone and the hex is free. Each building type takes
  max level × 24 hours to go from its top level to gone, but never less than 7
  days or more than 30. Longhouses never decay: they make the realm.
  When a building leaves the realm, its queued upgrade, the training orders in its queue
  and a foundation still under construction there are cancelled and
  refunded; a rune slotted in it stays on the hex; a dockyard outside the
  realm is no fleet home or dock. In faster worlds decay runs on world speed:
  the time to gone is max level × 24 h ÷ world speed, clamped between a
  minimum and a maximum that shrink with world speed on a log scale, from
  7 days–30 days at 1× to 1 hour–1 day at 100× (3.8 hours–2.4 days at 30×).
- **Linked realms share their stores.** Two of your settlements are linked when their realms touch (share a hex edge). Linked settlements share one stock: it is kept split between them in proportion to each one's storage capacity, per resource; production goes into it and a build in any of them draws from all of them in that ratio. When the link breaks, each keeps its share. The oldest settlement of a linked group is the one the game shows; the stock of the others is shown with it.
- **A linked group is one realm.** It has one name (the oldest settlement's) and one stock. The newer settlements are left out of every list, yours and your rivals', and rivals see the oldest settlement's name on every longhouse of the group. Only their longhouses and the border stay on the map. You run the whole linked realm from the oldest settlement and can build on any of its hexes from there. A raid on any longhouse of the group can loot the whole stock.
- A linked realm has one build queue: its construction slots are the members' slots added up, and a build on any of its hexes joins that queue.
- In a linked realm, build requirements count for the whole realm: its highest longhouse level unlocks buildings on all of its ground, its tower limit is the members' limits added up, and the Great Storehouse count requirement counts all of its Storage Houses and Great Storehouses.
- A linked realm's units eat from the shared food. When it runs out, the units with the highest upkeep across the whole realm starve first, until the shared food stops falling.
- Leaderboards show a linked realm once, under the oldest settlement's name, with the members' scores added up; battle and trade reports use the realm's name.
- A linked realm holds one shrine in total, like a settlement: while it holds one or more, no new shrine can be built in it. Settlements that each raised a shrine before they linked keep them all, and all of them keep working, so linking settlements is a way to combine favours.
- **Producers are limited only by territory:** every matching hex inside
  the claim can hold one.
- **Rivers and bog creeks block space but pay for it.** A river hex can't
  take an ordinary building, but it is the only place for the mills, and a
  mill boosts every Lumberjack / Farm within its range (up to +100% at max
  level); a bog creek hex is the only place for the Hammer Forge, which does
  the same for bog-ore works. A river or creek running through a claim is a
  trade: fewer producer hexes, and a much stronger boost on the ones that are
  left.
- **Which ground takes what.** Sand takes only towers and walls. Every other
  ordinary building (Smithy, Archery Range, Barracks, Siege Workshop and the
  rest) stands on grass only. A stream, a widening or a river spring takes no
  building. A full-width river hex takes only what has art for its shape:
  the Sawmill on a straight or a bend (not the hairpin loop), the Crop Mill on
  a straight only, and the bridge on a wide straight or bend. A bog creek
  takes only the Hammer Forge. Walls never stand on rivers, streams or creeks.
  Where a river hex takes a river building in general but this stretch bends
  too much for it, the ring shows the building disabled with the hint that it
  needs a straighter river piece (no degrees: players don't read them).

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
behind a level-5 Tower, and has **3 levels**. Per hex it costs `C₁ = 540 wood /
150 brick / 40 food`, and takes 10 min at level 1 and 1 h at level 3 (tech curve), with the standard cost growth
(×1.30 per level). It has no production, storage or claim.

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
impassable, then stream flat 9, then half-open end (ground + 3), then blocked (unless a
friendly gate), then the terrain cost.

- Every wall hex **blocks every army, the owner's included**. Only standing hexes
  count (level 1 or more): a foundation does not block.
- A **gate** passes its **owner's** armies and their **friends'** at the normal terrain
  cost: friends are the owner's guildmates and the members of guilds with an active peace
  treaty with that guild (`WorldPalisades.IndexAsync` reads both). Anyone else is stopped
  like at any wall hex. A friend's plain wall hex still blocks, and an anonymous
  settlement has no friends.
- A **land end** (a plain palisade hex with exactly one wall neighbour) is **half open**:
  every army crosses it at the ground's own cost **plus 3** (grass 1 -> 4, forest 1.3 -> 4.3, bog 2 -> 5; a stream
  under it, which no wall can be built on, would be 9 -> 12). If it touches
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

**Siege.** On land a wall hex falls to **battering rams only** (a fleet can hit a wall's sea end, see below): a won Attack or Raid that names the wall hex
as `TargetBuildingCoord` takes **one level** off it, however many rams survive
(`SiegeResolver.LevelsTakenFrom`, the same rule as a bridge): a level-3 palisade needs three won
sieges to be breached, and the hex is gone at level 0. Catapults do nothing to a wall. There is no
separate siege mission: the in-game "Siege" action on a rival wall opens an Attack on the wall's
settlement with the wall hex as the preferred target building. Which engine damages which
building is one table (`UnitDefinition.SiegeTargets`, asked through `SiegeResolver.CanDamage`):

| Target | Rams | Catapults | Ships (shore only) | Levels per won siege |
|---|---|---|---|---|
| Wall hex (Palisade, Palisade Gate) | yes | no | yes | 1 |
| Tower | yes | yes | yes | `LevelsDestroyed` of the surviving power that can damage it |
| Bridge | no | yes | yes | 1 |
| Every other building (Longhouse included) | no | yes | yes | `LevelsDestroyed` |

Only the surviving engines that can damage the target count towards its levels. A named target
the surviving engines cannot damage takes no damage (the report has no siege line). Without a
named target, or when it is gone, the pick is random (seeded) among the buildings the surviving
engines can damage; if there are none, no siege happens. Rams and catapults are trained at the Siege Workshop
(section 8, the iron ladder).

**Fleets.** A fleet Attack or Raid is always sent at one building on the target's shore: a building inside the target's
claim on a shoreline land hex or on a sea hex (Dockyard, Fishing Hut, Shrine of Njörd, a wall's sea end). Without one the
dispatch is refused (`FleetTargetBuildingRequired`, `FleetTargetBuildingNotOnShore`). The fleet's route ends at that
building's hex and the target's Longhouse may be inland. The battle there is fought by the ships standing on that hex
only: the defender's ships at home when the target is the hex they are anchored at (its Dockyard, or a centre on the
shore), and allied fleets supporting it when the target is its centre. Land troops on either side stay out of it. With no
ships on that hex there is no battle and the fleet's siege hits the building.
A won fight damages only that building, by `LevelsDestroyed` of the surviving ships' siege power (Karve 10, Longship 20,
starting values to be tuned; catapult 40), walls and bridges one level as above. A fleet has no random fallback: if the
building is gone when it arrives, nothing is damaged.

**Troops on ships.** Ships carry land units in slots (`ShipCargo`); every mission a fleet can take can carry them, and a
dispatch whose passengers need more slots than its ships have is refused (`InsufficientShipCapacity`). A fleet moves at the
speed of its slowest ship; passengers do not slow it. Passengers eat from the fleet's provisions. They stay on board during a
fleet battle and do not fight; they only go ashore at a beach camp (`skirmish/beach-camp.md`). When ships are lost, the
passengers beyond what the surviving ships can carry drown, the units that take the most slots first. Starting values, to be tuned:

| Ship | Slots |
|---|---|
| Karve | 10 |
| Longship | 20 |

| Unit | Slots |
|---|---|
| Thrall, Spearman, Settler, Camp Builder | 1 |
| Bowman, Axeman, Provisioner | 2 |
| Berserker | 4 |
| Catapult, Ram | 10 |

**Not built yet.** Fire takes a level off a wall hex at a time until it is gone; nothing
burns walls yet (`TODO(economy.md section 5)` in `BuildingCatalogue.PalisadeHex`).
The admin building editor places a wall hex without the placement rules.

### Bridge

A bridge over a **wide river** (`BuildingType.Bridge` 32, wire id `bridge`). A wide river
is impassable to every land army (`troop-movement-range.md` section 5); a bridge is the
only way to open one. It unlocks at Longhouse 7 behind a level-1 Town Square, has **4
levels** (a causeway, a footbridge, a king's bridge and a guarded bridge), and no
production, storage or claim. Costs are set per level (no cost growth), times follow the tech curve, wood-heavy,
with brick from level 3 and no iron:

| Level | Name | Wood | Brick | Food | Iron | Time |
|---|---|---|---|---|---|---|
| 1 | Causeway | 120 | 0 | 20 | 0 | 30 min |
| 2 | Footbridge | 220 | 0 | 30 | 0 | 1 h 20 min |
| 3 | King's bridge | 380 | 160 | 40 | 0 | 2 h 10 min |
| 4 | Guarded bridge | 660 | 340 | 60 | 0 | 3 h |

**Placement** (`Settlement.PlanBuild`, `BuildingCatalogue.BridgeHex`): on the river hex
itself, inside the claim, when the river tile is of shape Straight, Bend or Bend60 and
**wide** (`RiverIndex.IsWide`, the same test the pathfinder uses). Refused on a spring,
a confluence or a mouth (`TerrainNotAllowed`), on a stream or a widening tile that is
not wide (`BuildRejection.BridgeNeedsWideRiver`: a stream can be waded, so it needs no
bridge), on a wasted (lava) island, outside the claim, and on an occupied hex. Any river
art variant is allowed (the bridge swaps it for the plain channel), and so is any ground
under the river (grass, forest or sand).

**Movement** (land armies; fleets are unaffected). Only standing bridges count (level 1
or more): a foundation leaves the river shut. The bridge's price replaces the
impassable wide river in `HexPathfinder.LandStepCost`; streams keep their own price.

| Level | Land army |
|---|---|
| 1 | every army, the owner's included: slower than any ground (`1.0 + CausewayCrossingCost` = 6) |
| 2 | every army: still slower than the ground, but quicker than the causeway (`1.0 + FootbridgeCrossingCost` = 4) |
| 3 | every army: `1.0 + KingsBridgeCrossingCost` = 1.5, a little slower than grass whatever ground lies under the river |
| 4 | the owner's armies and their friends: also 1.5; everyone else is stopped as if there were no bridge |

Friends of a guarded bridge are the same as for a palisade gate: the owner's guildmates
and the members of guilds with an active peace treaty with that guild
(`WorldBridges.IndexAsync` reads both via `WorldPalisades.FriendsAsync`). An anonymous
settlement has no friends.

**Burning.** An Attack mission with catapults (rams cannot burn a bridge) that names the bridge's hex as
`TargetBuildingCoord` burns it, but a bridge burns **one level per won siege**, however
many catapults survive (`SiegeResolver.LevelsTakenFrom`), like a wall hex, where any other building loses several. A
guarded bridge therefore falls to the king's bridge first and opens to everyone, attackers
included; each further siege takes another level, and a causeway burnt once is gone and
shuts the river again.

### Training troops

- Units are trained in a building: the Barracks, Archery Range, Siege Workshop, Dockyard or
  Cart Workshop that trains them (table in section 8). The Longhouse trains nothing.
- Every training building has its own queue of at most 5 orders. It trains them one after
  another: a new order waits behind the orders already in its queue. Different buildings train
  at the same time.
- Training time falls with the building's level: −1% per level, −20% at level 20
  (per-unit time = catalogue time × (1 − 0.01 × level) ÷ world speed). The time is fixed when the
  order is placed; a later upgrade does not change it.
- In a building's window the player trains either in this building only or distributes the order
  over all of the settlement's working buildings of that type (inside the realm, queue not full);
  a distributed order becomes one order in the queue of each building that gets units:
  - evenly: the unit count is divided; units left over go one each to the highest-level
    buildings; with fewer units than buildings only the highest-level ones get a unit;
  - fastest (premium): the units are split so the orders finish as early and as close together
    as possible, counting each building's speed and the orders already waiting in it.
- The whole order is paid when it is placed.
- When a building leaves the realm or is gone (destroyed, decayed to level 0), the orders in its
  queue are cancelled and refunded in full. Orders in other buildings keep training.

## 6. Settling and renown

A new settlement needs:

1. a Cart Workshop (LH 10, Town Square 3), so troops come first (T6);
2. 5 Settlers (the settler cost doubles per settlement already held);
3. **renown**: +1 per building level per hour, across all settlements
   (`Renown.cs`), never spent. Thresholds: **80 000** for the 2nd, then
   ×2 per settlement.

**Feasts (Town Square)** are what lets a strong player settle early:
Travian's celebrations.

- A feast needs a standing Town Square; its level TS sets the numbers.
- It costs `800 · 1.25^(TS−1)` of each of wood, brick and food, paid up front.
- It runs for 12 h and then grants `3 500 · 1.15^(TS−1)` renown to the account.
- Only one feast can run at a time per settlement. It does not use a
  construction slot.

The constants live in `Feasts.cs` (backend) and `lib/economy/feasts.ts` (lab).

An average player earns renown only from their buildings. An optimising
player turns surplus into feasts.

### Tuning the gain

The first guess, `6 000 · 1.20^(TS−1)`, was too strong: by day 60 the lab
showed 2.4–3.7 million renown against a 55 000 threshold (the threshold is 80 000 now, see the rebalance note below), so feasts stopped
mattering and the Cart Workshop's Longhouse 10 unlock became the only gate.
The gain `G1 · g^(TS−1)` was picked on a grid, with the live catalogue and the
lab's defaults (join 09:00, 3/3/3 producers, 2 storage houses, producers 3
ahead), against four targets (the grid and the chosen-gain table below were run on the catalogue before the rebalance;
the numbers after the rebalance are in the last paragraph of this section):

- active with feasts founds the 2nd settlement around day 5 (4.5–6.5), without
  around day 12–14 (about day 12 since the lab's default start has clay pits and bog-ore works instead of quarries);
- 4 check-ins with feasts around day 13–15;
- renown is the binding gate for the active player (it reaches 80 000 well
  after Longhouse 10, which is done on day 4.1);
- renown on day 30 with feasts stays within 2–6× the no-feast figure, so the
  3rd and 4th thresholds (160k, 320k) still mean something.

| G1 | g | active 2nd | active renown 55k (old threshold) | active r30 (x no-feast) | 4 check-ins 2nd | 4 check-ins r30 (x) | 2 check-ins 2nd |
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

| Profile | 2nd settlement, no feasts | 2nd settlement, feasts | Renown reaches 55k (feasts, old threshold) | Longhouse 10 | Renown day 30, feasts (no feasts) | Binds with feasts |
|---|---|---|---|---|---|---|
| active | d13.5 | d6.4 | d6.4 | d3.4 | 773k (162k, 4.8×) | renown |
| 4 check-ins | d20.7 | d13.0 | d12.5 | d13.0 | 408k (106k, 3.9×) | Longhouse 10 (renown half a day earlier) |
| 2 check-ins | d28.2 | d26.0 | d18.5 | d26.0 | 211k (61k, 3.4×) | Longhouse 10 |

These runs predate the faster Longhouse and the cost rebalance, and the build-time curves of §9.

**After the rebalance** (threshold 80 000, Longhouse ×1.60 from level 11, producers' first levels cheaper, every
tower adding one more producer of each type, the Cart Workshop and its Town Square paid for, three Lumberjacks, Clay
Brickworks and Reindeer Herders and two bog-ore works, join 09:00, producers 3 ahead; the same gain
`3 500 · 1.15^(TS−1)`): the 2nd settlement comes on day 7.1 for the active player with feasts (11.6 without), day 15.0
for 4 check-ins and day 30.0 for 2 check-ins. Longhouse 10 is reached on day 4.1 (active) and day 14.5 (4 check-ins),
so renown binds the active player and the Longhouse the 4-check-ins player. Feasts multiply the day-30 renown by about
2.7× for the active player and 3.3× for 4 check-ins.

**With the build-time curves of §9** (same settings, simulated 2026-11): the 2nd settlement comes on day 16.3 for the active
player with feasts (21.1 without), day 24.5 for 4 check-ins and day 34.5 for 2 check-ins. Longhouse 10 is reached on day 16.3
(active) and day 24.5 (4 check-ins), Longhouse 30 on day 279 (active), so the Longhouse now binds the active player, not
renown. The §1 targets above predate these curves and still need re-tuning (the Pacing bench has the knobs).

Feasts are what lets an active player settle a week early. A casual player
gains a few days at most, because the Longhouse 10 unlock is still ahead of
their renown.

## 7. First 10 minutes (T1)

- Founding stock: the starting storage nearly full — capacity (500 base +
  250 from the Longhouse) less 50, so 700 wood / 700 brick / 700 food, no
  iron.
- Level-1 producers cost between 16 and 57 wood, 8 and 49 brick, 7 and 33 food (each its own mix, §3; no brick for the Lumberjack and the
  Reindeer Herder, nor for the Clay Brickworks) and build in 1 min; the
  Longhouse is +15 wood and +15 food per level.
- **Onboarding quests pay resources** (Travian's task list), so the first
  hour keeps moving. They never hand out a finished building, so the
  Longhouse 2 upgrade the tutorial asks for has to build fast: the
  Longhouse builds level 2 in 2.8 min. The tutorial also walks the player through placing a Storage
  House and upgrading the Longhouse.

  The quests come in this order (`Bjarnoy.Domain.Settlers.Quests`, mirrored
  for demo mode in `src/frontend/src/lib/quests.ts`):

  | # | Quest | Condition | Reward (wood / brick / food) |
  |---|---|---|---|
  | 1 | 3 producers built | 3 standing resource producers | 150 / 120 / 80 |
  | 2 | Longhouse 2 | Longhouse level 2 or more | 250 / 200 / 150 |
  | 3 | First Storage House | a standing Storage House | 200 / 200 / 200 |
  | 4 | 6 producers built | 6 standing resource producers | 200 / 150 / 100 |
  | 5 | Longhouse 3 | Longhouse level 3 or more | 400 / 300 / 200 |
  | 6 | Tower 3 | your highest Tower at level 3 or more (what the Barracks needs) | 400 / 300 / 200 |
  | 7 | Longhouse 5 | Longhouse level 5 or more | 800 / 600 / 400 |
  | 8 | Train 5 spearmen | 5 fighting land units at home (any type), stored once reached: it stays completed after the troops leave or die | 500 / 400 / 300 |
  | 9 | Hunt a camp | an army sent to hunt a wildlife camp; unlocks once troops were trained (5 fighting land units were ever at home when it was sent), no claim needed | 400 / 300 / 300 |

  Rules:

  - **Manual claim.** A completed quest pays nothing until the player presses
    Claim in the quest tray (`POST /settlements/{id}/quests/{questId}/claim`).
    The tray shows the first unclaimed quest, plus any other completed one so
    it can be claimed; quests can be claimed in any order. Claims are optional
    and never gate anything (not even "Hunt a camp"), so a player may hold
    rewards back: unclaimed quest loot works as a hidden storage buffer.
  - **Exactly once per settlement.** Each quest has a bit in the settlement's
    claimed-quests mask, set in the same save that pays the reward, so a
    double click or a retry gets a 409 (`AlreadyClaimed`), never a second
    payment. A second settlement has its own list.
  - **Only standing buildings count.** Queued and under-construction orders do
    not; a producer is any building (other than the Longhouse) that yields
    wood, brick, food or iron of its own, so storage, towers and the
    radius-boost buildings (Sawmill, Crop Mill) do not.
  - **Clamped to storage.** The reward is deposited like any other income, so
    whatever would exceed a resource's storage capacity is lost; the tray
    warns when a reward will not fully fit.
  - **Never a building.** Rewards are resources only, never a finished or
    free building.
  - **New and claimable marker.** On phones the quest strip shows a dot on its
    icon when a quest appeared that you haven't opened yet, or a quest just
    became claimable.

Simulated: the first 25 minutes are continuous building (9 producers, then
LH 2 at about 13 min), LH 3 at about 1h15.

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

A furnace alone creates no ore, so bog ore is the only source: the Longhouse
makes no iron.

**Iron is an indirect gate for the army.** Buildings cost no iron. Every
unit costs iron except the cheap first unit (Thrall), so how fast you can
raise troops depends on your iron income. For that to work, the iron
sources have to line up with the unit unlocks:

| When | Iron source | Units it has to carry |
|---|---|---|
| LH 1–2 | none | Thrall (no iron) |
| from LH 3 | bog-ore works: bog ground has to be in reach of every start (`bog.md`) | the Barracks' first Spearmen (LH 5), then the main army: Axeman, Bowman, Karve, Settler, Provisioner |
| LH 20 | Hammer Forge (bog creek) boosts bog ore | elite units: Berserker, Catapult, Longship |

So bog ground and the bog-ore works are needed by about LH 3, not as a
late add-on. The unit costs and unlock levels are reworked together with
them so the levels match. *Implemented:*

- the Thrall costs no iron (it was 15); every other unit still does (Spearman
  40, Axeman 60, Bowman 50, Berserker 120, Provisioner 20, Karve 100,
  Longship 220, Settler 60, Catapult 250);
- each unit's Longhouse gate follows the building that trains it:

  | Unit | Trained at | Longhouse gate (was) |
  |---|---|---|
  | Thrall | Barracks | the Barracks' own gate (LH 5); no gate of its own (1) |
  | Spearman | Barracks | 5 (1) |
  | Axeman | Barracks | 6 (3): three levels after the bog-ore works open (LH 3) |
  | Karve | Dockyard | 8 (5) |
  | Bowman | Archery Range | 9 (4) |
  | Provisioner, Settler | Cart Workshop | 10 (4, 5) |
  | Berserker, Catapult, Longship | Barracks, Siege Workshop, Dockyard | 20 (6, 10, 8): with the Hammer Forge |
  | Ram | Siege Workshop | 20: after the Berserker, like the Catapult |

  (Berserker still needs the Axeman, Catapult the Berserker, Longship the
  Karve.) The elite units are gated by the Longhouse level only, not by a
  standing Hammer Forge: not every settlement has a creek.

### Bog-ore works numbers (Economy lab)

The bog-ore works follow the producer formulas (§3): cost 42 / 34 / 20 (its own mix, §3),
 each level adds `I₁ · 1.20^(L−1)`, terrain boost +10% per
neighbouring bog, creek or lake hex up to +50%, storage-capped (§4). **I₁ = 4
iron/h** (the other producers: 8 to 13). The lab places a producer that unlocks late
(a level-1 gate above Longhouse 1) when its Longhouse level, prerequisites, a
free slot and the stock allow, instead of assuming it stands from minute 0.

Why 4: iron is the indirect gate for the army, so it must stay scarcer than
wood. A unit costs about half as much iron as wood (Spearman 40 iron / 80
wood, Karve 100 / 250, Catapult 250 / 300), so iron income at about **half of
wood income** makes both equally binding. With three bog-ore works the lab
(three Lumberjacks, Quarries and Farms, one Clay Brickworks, two storage
houses, producers up to three levels ahead) gives iron/wood 0.40 to 0.48 from
Longhouse 5 on; one works gives 0.14 to 0.16, so a settlement with one works is
iron-limited.

Iron per hour by Longhouse level (three works, I₁ 4; the Longhouse makes no
iron). The profile only shifts *when* a level is reached:

| LH | iron/h | reached: active | 4 check-ins | 2 check-ins |
|---|---|---|---|---|
| 3 (works open) | 22 | day 0.4 | day 2.3 | day 5.0 |
| 5 (Barracks) | 155 | day 1.5 | day 6.1 | day 12.5 |
| 6 | 198 | day 2.0 | day 7.5 | day 15.5 |
| 8 | 312 | day 3.1 | day 10.5 | day 21.5 |
| 10 | 475 | day 4.9 | day 14.1 | day 28.5 |
| 15 | 1 271 | day 12.0 | day 22.0 | day 42.0 |
| 20 | 3 252 | day 32.2 | day 39.2 | day 55.7 |

There is no iron before the works (Longhouse 1 and 2). From Longhouse 3
the works carry it, so the Barracks' first Spearmen (LH 5) are paid from
works income, and every other unit is affordable the moment its gate opens,
because its gate opens with or after the works: Axeman at LH 6, Karve at LH 8,
Settler and Provisioner at LH 10, the elite units at LH 20 (income 3 252/h
against a Catapult's 250). The table is the Economy lab's own setup re-run for the
rebalanced catalogue (three Lumberjacks, Quarries and Farms, one Clay
Brickworks, three bog-ore works, two storage houses, producers up to three
levels ahead, joining at 09:00, 60 days).

Second-settlement timing (§6) needs iron for the Settlers, so a lab run without
bog-ore works never settles. With the lab's default producers plus two bog-ore works
(three Lumberjacks, Clay Brickworks and Reindeer Herders, feasts on) it
is 7.1 days for the active player and 15.0 for 4 check-ins; without feasts the
active player settles at 11.6 days (§6, after the rebalance).

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
check (renown, optional feasts). It models the settlement's growth the way a player plays it: every tower the
Longhouse allows adds one more producer of each owned type (a setting, default 1, placed when affordable; they do not hold
the Longhouse back, and the starting set is upgraded first); while saving for the Longhouse it still starts a producer
upgrade that pays back sooner than the Longhouse would be affordable; storage is built only when the next Longhouse level
or a producer's next level costs more than the current capacity (upgrade the lowest Storage House, a new one only when none
can be upgraded, the lowest or a new Great Storehouse, the best capacity per cost); and the Town Square and the Cart Workshop
are built and paid for like any building.

The admin page **Pacing bench** (`/admin/pacing-bench`) runs this simulator on the what-if catalogue (`whatIf.ts`) for four fixed
profiles (active with and without feasts, 4 and 2 check-ins with feasts) and compares them with a pinned reference run: the
producer counts and level-1 outputs, the producers' cost growth and early price factors, the Longhouse's growth and break level,
the two storage buildings' capacity and cost, the renown threshold and the simulated days are its knobs.

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
fall further behind and everyone reaches the caps sooner. Hence the curves:
short early for the entry (1 min, 2.8 min, 8 min, then doubling to 64 min at
level 6), long late so a casual player can keep up.

| Curve | Buildings | Level 1 | Level 3 | Level 6 | Top level |
|---|---|---|---|---|---|
| Early, log-like tail | Longhouse | 1 min | 8 min | 64 min | 26 h (L30) |
| | Lumberjack, Reindeer Herder | 1 min | 8 min | 64 min | 20 h (L25) |
| | Clay Brickworks, Quarry, Farm, Pumpkin Farm, Fishing Hut | 1 min | 8 min | 64 min | 22 h (L25) |
| | Bog-ore works | 1 min | 8 min | 64 min | 24 h (L25) |
| | Storage House | 1 min | 8 min | 64 min | 20 h (L25) |
| Tech, straight line | Tower, Barracks, Town Square, Palisade and Gate, Bridge, Dockyard | 10–30 min | | | 1–24 h |
| | Archery Range, Cart Workshop, Meadery, Druid Hut, Weaponsmith, Siege Workshop | 45 min–3 h | | | 22–24 h |
| | Great Storehouse | 2 h | | | 30 h (L10) |
| | Sawmill, Crop Mill, Hammer Forge | 4 h | | | 24 h |
| | Shrines | 6 h | | | 24 h |

The tech buildings start at a time that grows with their place in the tech
tree, so a late building is a real commitment from its first level. Towers
follow the same logic (10 min at level 1, 12 h at level 5).
The active edge there is bounded by the tower count, which grows with the
Longhouse (§5), so the edge is getting each tower sooner, not getting more
of them. The premium build queue works the other way: it lets a casual
player queue past full slots, which gives back some of the idle time.

The Pacing bench (admin) has the curves' knee level, tail shape and top hours as knobs and charts them per level.

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
   for the 2nd settlement at 80 000.~~ Done.
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
