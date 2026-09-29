# Economy & tech tree

Status: **proposal** — the formulas and targets below are agreed in
direction; numbers are tuned against the pacing simulator (the admin
*Economy lab* page, `/admin/economy`) and change only together with it.

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
| T6 | Troops and sea access come before settling | Cart Workshop (settlers) needs Dockyard; LH 10 |

## 2. Resources

Wood, Stone, Food, Iron.

- **Wood** — Lumberjack (forest).
- **Stone** — Quarry (mountain) *or* Clay Brickworks (grass). Both at LH 1:
  world generation does not guarantee a mountain near a start, so Clay is
  the no-mountain stone source, not an upgrade.
- **Food** — Reindeer Herder (the default, any grass), later Farm / Pumpkin
  Farm by island soil (one tech-tree card), Fishing Hut on coastal water.
- **Iron** — needs its own producer (open: §8). Until it exists, buildings
  cost no iron; iron is a military resource (units, Tower).

The Magic Tower is removed for now. The Smithy produces nothing: it is a
troop-upgrade building only.

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
| Military and civic buildings (Barracks, Archery Range, Dockyard, Town Square, Cart Workshop, Druid Hut, Smithy, Meadery) | 20 |
| Mills (Sawmill, Crop Mill) | 20 |
| Tower | 10 |
| Great Storehouse | 10 |
| Shrines | 5 (one per settlement) |
| Palisade | 3 |

Construction slots: `2 + ⌊(LH − 5) / 5⌋` → 2 at LH 1–9, 7 at LH 30.

## 5. Unlock ladder

Each building needs a Longhouse level, and at most one feeder building.

| LH | Unlocks | Also needs |
|---|---|---|
| 1 | Lumberjack, Quarry, Clay Brickworks, Reindeer Herder, Storage House | — |
| 2 | Fishing Hut | — |
| 3 | Tower | — |
| 4 | Farm / Pumpkin Farm (by soil) | Reindeer Herder 3 |
| 5 | Barracks | Tower 3 |
| 6 | Town Square (feasts, §6) | — |
| 7 | Palisade | Tower 5 |
| 8 | Dockyard | Fishing Hut 5 |
| 9 | Archery Range | Barracks 5 |
| 10 | Cart Workshop (settlers) | Dockyard 1 |
| 11 | Meadery | Farm 5 |
| 12 | *Iron producer (open, §8)* | — |
| 13 | Druid Hut | Town Square 5 |
| 14 | Sawmill | Lumberjack 10 |
| 15 | Crop Mill | Farm 10 |
| 16 | Smithy (troop upgrades) | Barracks 10 |
| 18 | Great Storehouse | Storage House 15 |
| 25 | Shrine of Ullr | Sawmill 5 |
| 25 | Shrine of Freyja | Crop Mill 5 |
| 25 | Shrine of Njörd | Dockyard 10 |
| 25 | Shrine of Thor | Smithy 5 |
| 25 | Odin Statue | any other shrine 5 |

The shrines all open at LH 25, but each also needs its own feeder, so in
practice they still arrive one at a time.

### Space and limits

- Producers are limited only by territory: every matching hex inside the
  claim can hold one. The claim grows with the Longhouse (`2 + LH/2` rings).
- **Towers are limited per Longhouse level:** one at LH 3, then one more at
  LH 10, 15, 20, 25 and 30. A tower extends the claim, so an uncapped count
  would make territory, and with it producer count, unbounded.
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
| Thor | + land unit attack |
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

1. a Cart Workshop (LH 10, Dockyard 1), so troops and sea access come first (T6);
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

## 7. First 10 minutes (T1)

- Founding stock: 600 wood / 500 stone / 400 food.
- Level-1 producers cost 50 / 40 / 15 and build in 3 min; the Longhouse is
  +15 / 12 / 15 per level.
- **Onboarding quests pay resources** (Travian's task list), so the first
  hour keeps moving:

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

## 8. Open questions

- **Iron producer.** Historically, Norse iron was almost all *bog iron*
  (myrmalm): ore dug from peat bogs and wet ground, smelted on site in a
  small clay bloomery furnace with charcoal. That fits better than a
  mountain mine. Suggestion: a **Bog Iron Pit** on grass that must touch
  water (a river or the coast), art built with the Clay Brickworks'
  "hole in the ground" template. Its boost building would be a
  **Charcoal Kiln** in the forest (charcoal fed the bloomeries), boosting
  pits within range the way the mills do. A river mill for iron (a
  water-powered trip hammer) is later than the Viking age.
- The profile parameters (online hours, share spent on troops) are
  assumptions; real telemetry should replace them once players exist.
