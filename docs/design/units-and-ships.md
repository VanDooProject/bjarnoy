# Units and ships: roster, unlocks, training and the volley

The unit roster, where each unit is trained, at which building level, and the rules for training, cancelling and the
ranged volley. Numbers are starting values, to be tuned. Settled in the unit training UX study (2026-11). Related:
[economy.md](economy.md) (costs, iron, training queues), [skirmish/conquest.md](skirmish/conquest.md) (fleet attacks),
[garrison.md](garrison.md), [ship-movement.md](ship-movement.md).

## 1. Unlocks: the training building's level

- Every unit needs a minimum level of the building that trains it, checked against **the building the order is placed
  in**. A distributed order only goes to buildings of that type that have the level.
- A unit can also have its own Longhouse gate. A building can never be above the Longhouse level, so the earliest
  Longhouse for a unit is the highest of: the building's unlock, the building level it needs, and its own gate.
- A unit no longer needs another unit of the same building as a prerequisite: the building level already orders them.
  The only unit prerequisite left is across buildings: the Ram and the Catapult need the Berserker to be unlocked.
  Because the Berserker needs Longhouse 20, the Ram and the Catapult are in practice Longhouse 20 units too.

### Land units

| Building (opens at) | Unit | Building level | Own Longhouse gate | Needs unit |
|---|---|---|---|---|
| Barracks (LH 5, Tower 3) | Thrall | 1 | – | – |
| | Spearman | 3 | – | – |
| | Axeman | 6 | 6 | – |
| | Berserker | 10 | 20 | – |
| Archery Range (LH 9, Barracks 5) | Bowman | 1 | – | – |
| | Skirmisher | 1 | – | – |
| Cart Workshop (LH 10, Town Square 3) | Provisioner | 1 | – | – |
| | Settler | 5 | – | – |
| | Camp Builder | 10 | – | – |
| Siege Workshop (LH 18, Archery Range 3) | Ram | 10 | – | Berserker |
| | Catapult | 10 | – | Berserker |

### Ships: Harbour and Shipyard

The Dockyard is split in two buildings. Both stand in shallow coastal water like the Dockyard did, and both are garrison
spots for every ship (a fleet lies at whichever one it was trained in or sent home to).

| Building (opens at) | Group | Ship | Building level | Own Longhouse gate |
|---|---|---|---|---|
| Harbour (LH 5, Fishing Hut 3) | Scouts | Færing | 1 | – |
| | Cargo | Byrding | 1 | – |
| | Cargo | Knarr | 3 | – |
| | Transport | Karve | 5 | – |
| Shipyard (LH 10, Harbour 5) | Warships | Snekkja (was the Longship) | 1 | – |
| | Warships | Skeid | 10 | 20 |
| | Fire craft | Fire Raft | 1 | – |
| | Fire craft | Fire Hulk (was the Fire Ship) | 5 | 12 |

- The Harbour takes the Dockyard's place everywhere the Dockyard is a feeder (the Shrine of Njörd needs Harbour 10).
- "Longship" stays the word for the class of long, oared warships; the Snekkja and the Skeid are both longships.
- Running worlds stay on the release they started with, so no Dockyard is converted.

## 2. Unit stats

Land units (cost: wood / brick / food / iron):

| Unit | Atk / Def | Speed | Loot | Provisions | Upkeep / h | Ship slots | Ranged | Cost | Time |
|---|---|---|---|---|---|---|---|---|---|
| Thrall | 0 / 2 | 5 | 60 | 20 | 0.25 | 1 | | 60 / 30 / 25 / 0 | 10 min |
| Spearman | 15 / 35 | 4 | 20 | 24 | 0.25 | 1 | | 80 / 40 / 20 / 40 | 15 min |
| Axeman | 40 / 15 | 4 | 40 | 40 | 0.5 | 2 | | 100 / 30 / 20 / 60 | 20 min |
| Berserker | 70 / 20 | 5 | 15 | 64 | 1 | 3 | | 140 / 60 / 30 / 90 | 30 min |
| Bowman | 20 / 12 | 4 | 2 | 40 | 0.5 | 2 | yes | 80 / 50 / 20 / 35 | 15 min |
| Skirmisher | 10 / 3 | 6 | 2 | 30 | 0.25 | 1 | yes | 60 / 25 / 20 / 15 | 8 min |

Provisioner, Settler, Camp Builder, Ram and Catapult keep their stats. Archers carry almost no loot: their arrows and
spears fill their hands. The Skirmisher has vision 2 like the other foot units.

Every fighter is best at something per resource (iron counted 4×): Spearman defence, Axeman loot among fighters,
Berserker attack and attack per ship slot, Bowman the volley, Skirmisher speed and reach. The Thrall is the hauler.

Ships:

| Ship | Atk / Def | Speed | Vision | Troop slots | Loot | Provisions | Upkeep / h | Cost | Time |
|---|---|---|---|---|---|---|---|---|---|
| Færing | 0 / 3 | 8 | 7 | 0 | 0 | 40 | 0.25 | 40 / 10 / 10 / 0 | 6 min |
| Byrding | 0 / 10 | 6 | 5 | 0 | 160 | 150 | 0.5 | 120 / 50 / 20 / 20 | 20 min |
| Knarr | 0 / 20 | 4 | 5 | 0 | 600 | 1 200 | 1 | 300 / 120 / 40 / 135 | 50 min |
| Karve | 5 / 30 | 8 | 6 | 10 | 200 | 600 | 1.5 | 250 / 100 / 40 / 100 | 45 min |
| Snekkja | 60 / 40 | 10 | 4 | 20 | 80 | 320 | 2 | 400 / 200 / 60 / 220 | 1 h 30 min |
| Skeid | 90 / 60 | 11 | 4 | 30 | 120 | 480 | 3 | 550 / 250 / 80 / 300 | 2 h |
| Fire Raft | 0 / 3 | 5 | 2 | 0 | 0 | 30 | 1 | 50 / 10 / 10 / 10 | 10 min |
| Fire Hulk | 0 / 25 | 8 | 6 | 0 | 0 | 200 | 5 | 300 / 60 / 40 / 80 | 40 min |

- The Byrding and the Knarr carry cargo only, no troops. The Karve is the troop transport.
- Cargo ships are slow; long, slender warships with many rowers are the fastest (historical order).
- Fire craft: both are single use and work like the Fire Ship did ([skirmish/conquest.md](skirmish/conquest.md)): they burn
  buildings in the water, carry nothing and add no attack. 10 Fire Hulks or 50 Fire Rafts take one level off a building.

## 3. Training

- A training window lists the units of its building, grouped by job for ships (Scouts, Cargo, Transport, Warships, Fire
  craft). Each available unit has a quantity stepper with a Max button (largest affordable count); one Train button places
  one order per picked unit type. The window stays open after Train.
- The window shows the orders this building is training (running and waiting, used slots of 5), the building's unlock
  ladder, and for each locked unit exactly which requirement is missing.
- **Cancelling:** any order in a building's queue can be cancelled. The units not trained yet are refunded at 50 % of their
  cost; units of the running order that are already trained stay.

## 4. The volley

- Before the main fight of a land fight, the ranged units (Bowman, Skirmisher) of **both** sides strike once.
- Each side loses `min(1/3, ranged attack of the other side ÷ its own total defence)` of every unit type. The defender's
  total defence includes the tower bonus. Both volleys use the armies as they arrive and are taken at the same time.
- Then the main fight runs as before on what is left; the ranged units fight again with their normal stats.
- It applies to every land fight: attacks, raids, field battles, camp fights and endgame fights. Ship fights have no volley.
- The battle report shows each side's volley power and splits each unit line's losses into volley and fight.

## 5. Docs

- The player docs' Training troops page shows the unlocks as a dependency graph (one lane per training building, units at
  their building level, arrows for unit prerequisites); on phones it is a list per building ordered by level.
- Historical background of units and buildings goes into history notes on the docs pages, behind a second admin switch
  "Show history" next to "Show admin notes".
