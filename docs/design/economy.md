# Economy & tech tree

Status: **agreed design, not yet in the game.** The catalogue still runs
the old numbers until the rebalance PR lands. Numbers are tuned against the
pacing simulator (the admin *Economy lab* page, `/admin/economy`); change
them together with it. Buildings marked * don't exist in the game yet and
come in their own PRs.

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
- **Stone** — Quarry (mountain) *or* Clay Brickworks (grass). Both at LH 1:
  world generation does not guarantee a mountain near a start, so Clay is
  the no-mountain stone source, not an upgrade.
- **Food** — Reindeer Herder (the default, any grass), later Farm / Pumpkin
  Farm by island soil (one tech-tree card), Fishing Hut on coastal water.
- **Iron** — comes from **lake ore** (Seeerz): a later feature adds a lake
  tile to every island, connected to the rivers, with a lake-ore building
  on it and a river **Hammerschmiede** (water-powered hammer mill) that
  boosts it, the way the Sawmill boosts Lumberjacks (§8). Until then the
  Longhouse is the only iron source, so buildings cost no iron; iron is a
  military resource (units, Tower).

The **Magic Tower is removed**. The **Smithy** is renamed **Weaponsmith**
(Waffenschmiede; its art has an anvil) so it doesn't clash with the
Hammerschmiede. It produces nothing and is a troop-upgrade building only.
Only its display name changes; the internal type stays `smithy`.

## 3. Level formulas

For a building with level-1 values `C₁` (cost, per resource), `P₁`
(production/h) and `t₁` (build minutes):

```
cost(L)       = C₁ · g_c^(L−1)           g_c = 1.30  (Longhouse 1.34)
production(L) = P₁ · g_p^(L−1)           g_p = 1.20
buildTime(L)  = t₁ · g_t^(L−1) · s(LH)   g_t = 1.33  (Longhouse 1.30)
s(LH)         = 0.97^(LH−1)              Longhouse build-speed bonus (Travian's Main Building)
```

Costs and output are both geometric (Travian's shape), so the payback
`cost(L) / (production(L) − production(L−1))` grows by 1.30/1.20 ≈ 1.08
per level: the next level is always worth building, just less obviously.

### Level-1 values

| Building | C₁ wood/stone/food | P₁ /h | t₁ min |
|---|---|---|---|
| Producers (Lumberjack, Quarry, Clay, Herder, Farm, Fishing) | 50 / 40 / 15 | 40 | 3 |
| Longhouse | 120 / 100 / 60 | +15 wood, +12 stone, +15 food per level (linear) | 3 |
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
| Longhouse | 30 (also drives build slots, claim radius and the build-speed bonus) |
| Resource producers, Storage House | 25 |
| Military and civic buildings (Barracks, Archery Range, Dockyard, Town Square, Cart Workshop, Druid Hut, Weaponsmith, Meadery) | 20 |
| Mills (Sawmill, Crop Mill) | 20 |
| Tower | 10 |
| Great Storehouse | 10 |
| Shrines | 5 (one per settlement) |
| Palisade | 3 |

Construction slots: `2 + ⌊(LH − 5) / 5⌋` → 2 at LH 1–9, 7 at LH 30.

**What caps a building's level.** Most buildings can never be a higher level
than the Longhouse (level `L` needs LH `max(unlock, L)`), and Storage Houses
keep that cap. The **resource producers** (Lumberjack, Quarry, Clay Brickworks,
Farm, Pumpkin Farm, Fishing Hut, Fisher Hut) are capped by **storage**
instead: they only need their unlock LH at every level, and a level whose cost
exceeds what the settlement can store can never be afforded, so the next level
has to fit in storage. An **additional Storage House** can only be placed once
one already stands at **level 10** (the first is never held back, and
upgrading is always allowed). See §5 for why.

## 5. Unlock ladder

Each building needs a Longhouse level, and at most one feeder building. The
Longhouse level is also the level cap for everything except the resource
producers, which storage caps instead (§4).
Early levels unlock one building each; late game comes in tiers (LH 15, 20,
25), since there is no need for an unlock at every late level.

| LH | Unlocks | Also needs |
|---|---|---|
| 1 | Lumberjack, Quarry, Clay Brickworks, Reindeer Herder*, Storage House | — |
| 2 | Fishing Hut | — |
| 3 | Tower | — |
| 4 | Farm / Pumpkin Farm (one card, by island soil) | Reindeer Herder 3 |
| 5 | Barracks | Tower 3 |
| 6 | Town Square (feasts, §6) | — |
| 7 | Palisade* | Tower 5 |
| 8 | Dockyard | Fishing Hut 5 |
| 9 | Archery Range | Barracks 5 |
| 10 | Cart Workshop (settlers) | Town Square 3 |
| 11 | Meadery | Farm 5 |
| 12 | Druid Hut | Town Square 5 |
| 15 | Weaponsmith, Great Storehouse | Barracks 10 / Storage House 15 |
| 20 | Sawmill, Crop Mill | Lumberjack 10 / Farm 10 |
| 25 | Shrine of Ullr, Freyja, Njörd, Thor, and the Odin Statue* | Sawmill 5 / Crop Mill 5 / Dockyard 10 / Weaponsmith 5 / any other shrine 5 |

The shrines all open at LH 25, but each also needs its own feeder, so in
practice they still arrive one at a time.

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
Storage Houses themselves keep the Longhouse cap, and an additional one needs
one at level 10, so storage cannot be stacked cheaply in place of upgrading.

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
- **Rivers block space but pay for it.** A river hex can't take an ordinary
  building, but it is the only place for the mills, and a mill boosts every
  Lumberjack / Farm within its range (up to +100% at max level). A river
  running through a claim is a trade: fewer producer hexes, and a much
  stronger boost on the ones that are left.

### Shrines

One shrine per god per settlement. The only way to stack a god's favour is
to hold several settlements on one island and merge them later.

| Shrine | Favour |
|---|---|
| Thor | + land unit attack (feeder: Weaponsmith) |
| Freyja | + food production |
| Ullr | + wood production |
| Njörd | + ship attack (coastal-water building) |
| Odin | two weaker effects: **Ravens**, +vision range for everything tied to this settlement (its claim, its towers, its armies and ships) and early intel on incoming attacks; **Wisdom**, −X% build time in this settlement |

### Palisade

A wall piece on a land hex. It blocks movement: nothing passes except
friendly troops through a gate piece. It has 3 levels, and siege or fire
takes a level off at a time until it is gone.

## 6. Settling and renown

A new settlement needs:

1. a Cart Workshop (LH 10, Town Square 3), so troops come first (T6);
2. 3 Settler Crews (the crew cost doubles per settlement already held);
3. **renown**: +1 per building level per hour, across all settlements
   (`Renown.cs`), never spent. Thresholds: **55 000** for the 2nd, then
   ×2 per settlement.

**Feasts (Town Square)** are what lets a strong player settle early:
Travian's celebrations.

- A feast costs `800 · 1.25^(TS−1)` of each of wood, stone and food.
- It runs for 12 h and then grants `6 000 · 1.20^(TS−1)` renown.
- Only one feast can run at a time per settlement.

An average player earns renown only from their buildings. An optimising
player turns surplus into feasts.

Simulator result for these numbers:

| Profile | Online | Spends on troops etc. | Feasts | 2nd settlement | LH 25 |
|---|---|---|---|---|---|
| pro | 07–23 h | 20% of income | yes | ~4d 20h | ~29 d |
| average | 3 check-ins/day | 45% of income | no | ~13d 9h | ~2 months |

The pacing lab will model a second settlement, so the "settle when the first
one flattens" check in §5 can be verified against these numbers.

## 7. First 10 minutes (T1)

- Founding stock: the starting storage nearly full — capacity (500 base +
  250 from the Longhouse) less 50, so 700 wood / 700 stone / 700 food, no
  iron.
- Level-1 producers cost 50 / 40 / 15 and build in 3 min; the Longhouse is
  +15 / 12 / 15 per level.
- **Onboarding quests pay resources** (Travian's task list), so the first
  hour keeps moving. They never hand out a finished building, so the
  Longhouse 2 upgrade the tutorial asks for has to build fast (a couple of
  minutes). The tutorial also walks the player through placing a Storage
  House and upgrading the Longhouse:

  | Quest | Reward (wood / stone / food) |
  |---|---|
  | 3 producers built | 150 / 120 / 80 |
  | Longhouse 2 | 250 / 200 / 150 |
  | 6 producers built | 200 / 150 / 100 |
  | Longhouse 3 | 400 / 300 / 200 |
  | First Storage House | 200 / 200 / 200 |
  | Longhouse 5 | 800 / 600 / 400 |

Simulated: the first 25 minutes are continuous building (9 producers, then
LH 2 at about 13 min), LH 3 at about 1h45.

## 8. Iron: lake ore (later feature)

Viking-age Norse iron did not come from mountains. It came from ore that
forms by itself where iron-rich fresh groundwater meets air:

- **Bog iron** (Raseneisenerz, Sumpferz): rusty lumps a spade's depth under
  wet meadows and bog edges.
- **Lake ore** (Seeerz, Swedish *sjömalm*): the same process on lake
  bottoms, raked up from boats, often through the winter ice.
- Not sea water: the sea doesn't form this ore.
- The ore was smelted on site in a small clay furnace (Rennofen) with
  charcoal (Holzkohle, from a Kohlenmeiler), giving a bloom (Luppe) that the
  smith hammered into iron. Rock-ore mines in mountains only mattered after
  the Viking age.

The plan:

- A **lake tile**, one guaranteed per island (like a mountain), connected
  to the river network. It needs new art and world-generation changes.
- A **lake-ore building** on the lake: the iron producer.
- A **Hammerschmiede** on a river: a water-powered hammer mill that boosts
  lake-ore buildings within range, limited by river shapes the same way the
  Sawmill and Crop Mill are. (Water-powered hammers are a century or two
  later than the Vikings, like the game's water-powered sawmill.)

The Hammerschmiede stands on a river only, never on the lake itself.

A furnace alone (Rennofen) creates no ore, so lake ore is the only real
source, and the Longhouse gives a small trickle (+2 iron/h per level).

**Iron is an indirect gate for the army.** Buildings cost no iron. Every
unit costs iron except the cheap first unit (Thrall), so how fast you can
raise troops depends on your iron income. For that to work, the iron
sources have to line up with the unit unlocks:

| When | Iron source | Units it has to carry |
|---|---|---|
| LH 1–5 | Longhouse trickle only (2–10 iron/h) | Thrall (no iron), then the first Spearmen when the Barracks opens at LH 5 |
| from ~LH 6 | lake ore: the lake tile is guaranteed on every island, so it is always in reach | the main army: Spearman, Axeman, Bowman, Karve, Settler Crew, Provisioner |
| LH 20 | Hammerschmiede (river) boosts lake ore | elite units: Berserker, Catapult, Longship |

So the lake tile and the lake-ore building are needed by about LH 6, not
as a late add-on. The unit costs and unlock levels get reworked together
with them so the levels match: today every unit costs iron (Thrall 15 …
Catapult 250), and the unit Longhouse gates still follow the old ladder
(the Spearman at LH 1, while the Barracks now opens at LH 5).

## 9. Open questions

- ~~Fishing Hut and Fisher Hut~~: decided, merge them into one coastal
  building. A lakeshore version comes with the lake work: the same building,
  with its own art.
- The profile parameters (online hours, share spent on troops) are
  assumptions; real telemetry should replace them once players exist.
