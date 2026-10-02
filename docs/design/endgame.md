# Endgame: the Jötnar, their watchtowers and Utgard

Status: **spec, not built yet**. Owner decisions from the camp-fights follow-up; numbers are tuning
defaults (`EndgameRules` in C#, mirrored in `endgameRules.ts` where the client shows them). Lore and art:
the Wasted Lands docs page (`WastedLandsView.vue`, `docs.wastedLands`). Builds on wildlife camps
(`wildlife-camps.md`), palisades (`economy.md` §5) and the endboss trigger (`WorldService.TriggerDueEndbossesAsync`).

## The shape of it

When a world's endboss fires (`EndbossTriggeredAt`), the wasted islands appear. Each wasted island that has
Utgard (one per wasted island of 150+ tiles, `GiantGenerator`) is defended by:

- **Jötun watchtowers** spread over the island, each with a jötunn garrison.
- **One or two rings of Utgard walls** around the fortress, which block land armies until siege breaks them.
- **Utgard** itself, with a big garrison.

Guilds wear the garrisons down together (losses stay), hold them down with armies standing on them (siege),
breach the walls with catapults and rams, take every watchtower, and then storm Utgard. The army that clears
Utgard wins the age for its player and guild.

**Every endgame fight is a full battle**: the loser loses everything, the winner `(loser/winner)^1.5` of its
units (`BattleResolver` maths, no raid cap). That holds for attacks on towers and Utgard, for siege ticks and
for the jötnar's own attacks. (Wildlife camps keep their raid-capped attacks.)

## Map: watchtowers and wall rings (world generation)

Generated with the world, per wasted island with Utgard, after giants and camps, deterministic and bit-identical
in C# (`EndgameGenerator`) and TS (`endgamePlacement.ts`), pinned by `src/shared/endgame-placement-golden.json`.
Stored per island (`islands.JotunTowers`, `islands.UtgardWalls`, token converters like `CampListConverter`).
Existing worlds get them on their next reseed.

### Wall rings

- Two candidate rings around Utgard's anchor: **inner** at hex distance `InnerRingRadius` = 3 (two hexes clear of
  the 7-hex fortress), **outer** at `OuterRingRadius` = 6.
- A ring hex takes a wall when its terrain could take a palisade (wasteland, dead forest, black sand; not a
  river, lava, mountain or a giant footprint). Where a ring reaches the sea, the last land wall ends as an
  `end_coast` piece on the shore, like a palisade's sea end; mountains and wide rivers close a ring by
  themselves (they already stop land armies).
- **One or two rings, depending on space**: the inner ring is always built if at least `MinRingLandShare` = 60%
  of its hexes can take a wall; the outer ring only if that is also true for it. A small island gets one ring
  (or none, in which case Utgard stands open).
- **Levels**: inner ring walls stand at **level 2**, outer ring walls at **level 1** (`utgardwall_*_level002` /
  `_level001` art; `level000` is the breached rubble).
- **Gates**: `GatesPerRing` = 2 per ring, on straight pieces as far apart as the ring allows. Jötnar gates
  are never friendly to players; for players a gate is a wall like any other (it can be breached).
- Pieces and rotations come from the palisade rules (`PalisadeRules.TileFor`, same six pieces as `utgardwall_*`),
  so one code path picks pieces for both.

### Watchtowers

- Count per island: `clamp(round(land / TilesPerTower), MinTowers, MaxTowers)` with `TilesPerTower` = 120,
  3 to 6.
- **Spread over the island, not a ring**: farthest-point sampling (like camp placement) over land hexes that
  could take a building, outside the outer ring's interior, at least `MinTowerSpacing` = 5 from each other and
  from Utgard's footprint, not on a camp or giant hex.
- Art: `jotunwatchtower_*` (three stages: `level002` garrisoned, `level001` damaged, `level000` taken/empty).

### Movement

Utgard walls feed the same `PalisadeIndex` the pathfinder already uses, under a fixed jötnar owner key: a
standing wall hex (level ≥ 1) blocks land armies, gates are never friendly to players, half-open land ends cost
3 like palisade ends. A breached wall hex (level 0) is passable.

## Siege engines

- **Catapult**: unchanged (siege power 40).
- **Ram** (new `UnitType.Ram`, class Siege): the same siege pattern as the catapult (siege power 40, the same
  `SiegeResolver.LevelsDestroyed`), more staying power, slower. Attack 10, **defense 30** (catapult 10),
  **speed 1.0** (catapult 1.5), carry 0, upkeep 3, cost wood 400 / stone 100 / food 40 / iron 150, 1 h,
  Longhouse 20, after the Berserker, trained at the Archery Range like the catapult. Siege power sums over
  every siege unit in an army (catapults and rams).

### Breaching walls

New army mission **`siege`** against a wall hex: a player's **palisade** (any other player's, never your own or a
friend's) or an **Utgard wall**.

- Needs at least one catapult or ram; the army marches to a passable hex next to the wall and strikes on arrival.
- Levels destroyed = `LevelsDestroyed(total siege power of surviving siege units)`; a wall hex at level 0 is
  **breached** (a palisade hex is removed; an Utgard wall becomes rubble).
- **Utgard walls lose at most 1 level per `WallBreachInterval` = 24 h** per wall hex, matching the repair pace:
  a siege strike takes 1 level whatever its siege power, and a strike on a hex that already lost a level in
  the last 24 h fights its battle but takes no level (the report says when the next strike can land). So the
  inner ring (level 2) needs two strikes a day apart, with an army kept next to it in between so it does not
  repair.
- Before the siege strike a full battle is fought against the wall's defenders: for a palisade, the owner's
  armies standing on or next to it; for an Utgard wall, nothing: walls and gates hold **no garrison**, they are
  pure siege targets (but towers and Utgard ambush armies that come into their range, see below).
- **Utgard walls repair**: a breached or damaged Utgard wall regains 1 level every `WallRepairInterval` = 24 h,
  up to its ring level, while no player army stands on or next to it. Player palisades are rebuilt by their
  owner as usual.
- Report: a battle-style report with the siege line (wall hex, level before/after, breached).

## Jötunn garrisons

Garrisons sit at every watchtower and at Utgard. Jötnar are a second garrison family, built on the camp system
(`CampGarrison`, `CampState`, `CampBattleResolver`), generalised from beast tiers to garrison tiers:

| Tier | Name (en / de) | Attack / Defense |
|---|---|---|
| Thrall | Rime thrall / Reifknecht | 20 / 40 |
| Warrior | Jötunn / Jötunn | 120 / 150 |
| Chieftain | Jötunn chieftain / Jötunnfürst | 300 / 400 |

| Site | Thralls | Warriors | Chieftains | Defense power | Guard range | Full regrowth |
|---|---|---|---|---|---|---|
| Watchtower | 40 | 15 | 2 | 4 650 | 5 | 24 h |
| Utgard | 300 | 120 | 20 | 38 000 | 8 | 48 h |

- **Attack**: new mission **`assault`** against a watchtower or Utgard (land units; Utgard's hex is reached
  through a breach or an open ring). A full battle: army attack vs garrison defense. Losses stay with the
  garrison; it regrows linearly per tier over the full-regrowth time (`CampState.GarrisonAt` pattern).
  A watchtower with no jötnar left is **taken** (empty art, no longer attacks). A taken site stays empty for a
  **grace period** of `TakenGrace` = 1 h, then starts to regrow (unless an army holds it, see siege).
- **Siege (holding a site)**: an army **standing on a site's hex** (arrived, not turned around) besieges it.
  Every `SiegeTick` = 1 h the jötnar that regrew during that hour come out and fight it in a **full battle**.
  If the army wins they are dead and the garrison does not recover; if it loses, the army is gone and regrowth
  goes on. An army standing on a taken tower keeps it taken.
- **Siege loot**: each siege tick the army takes `SiegeLootPerHour` (watchtower 300, Utgard 1 000; split
  iron 40% / food 30% / stone 30%) into its carried loot until its carry capacity is full; the rest is lost.
- **Aggression** (like strong camps, but full battles): a site with jötnar ambushes armies that enter its guard
  range (`CampAmbush`), and burns player towers inside it unless defended (`CampTowerThreat`). After a fight
  it is calm for `EndgameCalm` = 1 h.
- Garrisons and sites only exist once the endboss has triggered; before that the wasted islands are hidden.

## Utgard and the end of the age

- **Gate rule**: Utgard can be assaulted only while **every watchtower on its island is taken** (no jötnar) at
  the moment the assault arrives. The dispatch is refused otherwise (`TowersStillStand`), and an army arriving
  while a tower has regrown turns home without a fight. Holding the towers means keeping armies besieging them.
- **Winning**: the army whose assault leaves Utgard with no jötnar **wins the age**: its player and the player's
  guild (if any) are recorded on the world (`AgeEndedAt`, `WinnerUserId`, `WinnerGuildId`,
  `WinnerSettlementId`).
- **Hall of fame**: both are credited. The winning player gets the age win as the one whose army threw down
  Utgard; every member of the winning guild at the moment of the win gets a guild age win (stored per user,
  `AgeWins` with a `Kind` of `Conqueror` or `Guild`, so the leaderboard can show both).
- **Age-end mode** (new world setting, admin world settings next to "endboss at"):
  - **`ReadOnly`** (default): the world goes to `WorldRunState.Locked` (time runs, no new commands), every
    page shows a banner "The age has ended. <guild/player> threw down Utgard's gate.", leaderboards are
    finalised.
  - **`KeepRunning`**: the winner is recorded and announced in the same banner, and play goes on; Utgard stays
    empty and cannot be won again.

## Reports and UI

- New report kinds on the camp report (`CampReportKind`): `Assault`, `SiegeTick`, `EndgameAmbush`,
  `EndgameTower`; wall sieges use the battle report with its siege line.
- **Bundled siege reports**: siege ticks are folded into one report per (army, site), updated in place each
  tick (ticks fought, jötnar killed, units lost, loot taken, last tick). The inbox groups reports by target
  and collapses a group to one row with a count; expanding shows every report.
- Map: watchtower and wall art per state, Utgard and tower tooltips with the garrison like camps, `Assault`
  and `Siege` actions in the ring menu (siege only with siege units at home), the guard ranges on hover.
- Docs: the Wasted Lands page gains a "How the endgame plays" section with these rules.

## Delivery (PRs)

1. **This spec.**
2. In parallel (separate worktrees, no shared files):
   - **2a Map**: wall rings and watchtowers in world generation (C#, TS, golden), storage, rendering with the
     existing art, walls blocking land armies.
   - **2b Siege engines**: the Ram unit and the `siege` mission with breaching against **palisades** (Utgard walls
     plug in through the same wall-target interface in step 3).
3. **Jötunn garrisons**: garrisons, `assault`, siege ticks with loot, aggression, Utgard wall state and repair,
   sieging Utgard walls, bundled reports and the inbox grouping.
4. **Utgard**: gate rule, winning, the age-end world setting and banner.

## Open questions

None open. (Player palisades take the full `LevelsDestroyed` per siege; only Utgard walls are capped at 1 level per 24 h.)
