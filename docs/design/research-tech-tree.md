# Research / tech tree

**Status:** design proposal, nothing implemented. Answers [#115](https://github.com/VanDooProject/bjarnoy/issues/115).
**Scope:** the persistent world (Bjarnoy), not the 3–20 minute round game (Fjørdhold) — see §11.
**Related:** [#117](https://github.com/VanDooProject/bjarnoy/issues/117) forge/smith · [#53](https://github.com/VanDooProject/bjarnoy/issues/53) shrines & runes (PR [#57](https://github.com/VanDooProject/bjarnoy/pull/57)) · [#55](https://github.com/VanDooProject/bjarnoy/issues/55) settlers & Renown (PR [#72](https://github.com/VanDooProject/bjarnoy/pull/72)) · [#127](https://github.com/VanDooProject/bjarnoy/issues/127) quests · [#129](https://github.com/VanDooProject/bjarnoy/issues/129) premium · [#123](https://github.com/VanDooProject/bjarnoy/issues/123) conquest

---

## 1. Where the code actually stands

Verified against `main` at the time of writing, not assumed:

- **There is no research system.** Nothing in `src/backend/src/Bjarnoy.Domain` mentions research, tech, or knowledge.
- **There are exactly two gates on progression today**, and both are level-shaped rather than choice-shaped:
  - `BuildingDefinition.RequiredLonghouseLevel` (`Buildings/BuildingDefinition.cs:64`), checked in `Settlement.PlanBuild` (`Buildings/Settlement.cs:528`) → `BuildRejection.LonghouseTooLow`.
  - `UnitDefinition.RequiredLonghouseLevel` + `UnitDefinition.RequiredUnitType` (`Units/UnitDefinition.cs:59,66`), resolved recursively by `UnitCatalogue.IsAvailable(type, longhouseLevel)` (`Units/UnitCatalogue.cs:175`) → `TrainRejection.UnitNotAvailable`.
  - Plus terrain (`BuildingDefinition.AllowsTerrain`), claim (`Settlement.Claims`), and queue length. None of those are progression.
- **`BuildingCatalogue.MaxLevel = 10`** (`Buildings/BuildingCatalogue.cs:19`) is a hard, global ceiling. A settlement that has every building at 10 has nothing left to spend on.
- **Both catalogues are already static data tables**, deliberately (`BuildingCatalogue`'s own remarks: "This is data, not code. The legacy tech tree was one C# class per building"), served read-only at `GET /api/v1/buildings` and `GET /api/v1/units` (`Api/Endpoints/SettlementEndpoints.cs:71,77`) and snapshotted into `src/frontend/src/data/*.json` as an offline fallback. **A research catalogue must follow exactly this shape.**
- **`TechTreeView.vue` is not a tech tree.** It is a 386-line illustrated reference page for the *building* catalogue (art, lore text, per-level costs). It is misnamed, which is most of why #115 had to spell out that it isn't the mechanic. See §9.4 for what to do about the name.
- **Two systems that research must not collide with are in flight, unmerged:**
  - **Renown** (PR #72) — account-level, ~1 point per building level per hour, summed across settlements, settled lazily on read, **never decays and is never spent**. It gates settlement *count* via a threshold curve (500 / 1000 / 2000 / 4000 …).
  - **Shrines & runes** (PR #57) — the codebase's **first modifier system**: percentage bonuses over `BuildingCatalogue.Totals`, stacked additively then capped at `Settlement.MaxEffectBonus = 0.5`, folded in through a shared `BoostedTotals` helper.

Two consequences fall straight out of that list, and they constrain every option below:

1. **Do not invent a second boost-stacking model.** #53's additive-then-cap is the house rule; #117 (forge) will want it too. Research is the third customer, not a third system.
2. **Do not invent a second culture-points number.** #115 says so explicitly, and Renown already exists as an account-wide, never-spent pacing stat. Research should *read* Renown, not compete with it.

---

## 2. What research has to earn its place doing

`prototypes/MECHANICS.md` sets constraints that rule several genre-standard answers out:

- **§7 — buildings occupy a hex, and there are more useful hexes than build slots.** Any new building is a real cost, paid in territory. That is a feature (it makes a Lore-hall a decision), but it means "just add five research buildings" is not free.
- **§3 — "Each settlement has its own resource stores, build queue and garrison. Nothing is pooled."** This is the sharpest constraint. It is also the one place a research system has a genuine argument for an exception: *knowledge is not cargo*. A caravan cannot carry an idea. See §5.2.
- **§2 — territory expands via the Longhouse and border buildings.** Research must not become a second claim-radius axis, or borders stop being about buildings.
- **§5 — everything runs on wall-clock timers.** Research is a timer, like builds and training. It must survive being offline and it must settle lazily on read, the way `ResourcePool`, `Settlement.SettleTo` and PR #72's `RenownAccount` already do. **No new ticking background worker** — the codebase has deliberately avoided those (battles resolve on read; founding resolves on arrival-read).

And one product constraint: the world runs **6 months to 2 years**. A flat unlock list is consumed in week two. Whatever ships has to still be generating decisions in month five.

---

## 3. Five candidate designs

Five, evaluated honestly, including the two I do not recommend. A comparison table is in §4 and the recommendation in §5.

### Idea A — "Lore-hall": Travian's Academy, ported straight

A new `BuildingType.LoreHall`. Every unit above tier 1, and a handful of buildings, requires a per-unit research done in *that settlement's* Lore-hall. Cost is resources + time; the unlock is permanent for that settlement.

- **Mechanically:** one more predicate in `PlanTrain`/`PlanBuild`. The cheapest option on this page by a wide margin — it reuses `BuildOrder`'s queue machinery almost verbatim.
- **Why it is tempting:** it is a known-good shape, and Travian ships it for a reason: it slows the rush to elite units without touching the economy.
- **Why it is weak here:** it is a *tax, not a choice*. Every player researches the same list in the same order, and a three-settlement player researches it three times. It also duplicates `RequiredLonghouseLevel` — two gates, same shape, same answer. And it is not a tree; it is a checklist with a building attached. The user's framing ("something like a (tech)tree") asks for more.

### Idea B — "Saga tree": an account-wide branching DAG, researched at a Lore-hall ⭐

A real directed graph of **topics** grouped into three branches, with prerequisites, tiers, and a few **mutually exclusive capstones**. Researching happens at a Lore-hall building in one settlement (paying that settlement's resources, on that settlement's hex — nothing pooled), but **what is learned is known account-wide, forever**.

Tier access is gated by Renown thresholds (reusing PR #72's stat rather than inventing one) and by Lore-hall level. One research runs at a time per account; the Lore-hall's level shortens its duration.

- **Why it works here:** the exclusive capstones are the part that makes it a tree instead of a ladder — two players who both "finished research" have different armies. It gives the late game (`MaxLevel = 10` exhausted) somewhere to go by letting research raise per-building level ceilings. It gives Renown a second job without spending it. And it is the natural owner of the "which kind of jarl are you" identity the game currently has no expression for.
- **Cost:** the largest of the five. New domain namespace, new entity + migrations on both providers, new endpoints, and a real DAG-layout UI.

### Idea C — "Ages": world-level era gating, Forge of Empires style

The world advances through named ages (Landnám → Víking → Jarl → Ríki). An age unlocks a whole generation of buildings and units at once; a player advances their own age by completing a small required set.

- **Why it is attractive:** it is the best *pacing* answer of the five, and it is the only one that gives `WorldService.TriggerDueEndbossesAsync` — currently a timestamp marker that fires nothing — a story to sit in. It also solves the level-10 ceiling cleanly (each age raises it). For a 6–24 month world, ages give the server a shape.
- **Why not as the core:** ages are coarse. Within an age there is nothing to decide, so it is a ladder, not a tree — the same criticism as A, at a bigger granularity. It also makes balance brittle: an age boundary is a cliff, and a player who trails one age is not behind, they are excluded.
- **Verdict:** wrong as the primary mechanic, **right as a later wrapper around Idea B** (tiers → ages) once the world lifecycle exists. Kept as a documented extension in §9.5, not v1.

### Idea D — "Emergent lore": no research action at all; knowledge is derived from what you already built

No new currency, no new building, no research order. A topic unlocks *automatically* the moment its precondition is met across the account — e.g. `Lumberjack ≥ 5 && Quarry ≥ 5` unlocks *Master Carpentry* (−10% build time), `Tower ≥ 3 && any settlement ≥ 2` unlocks *Marchwardens* (+1 vision).

- **Why it is genuinely good:** near-zero new machinery (a pure function over the buildings that already exist), no UI beyond a read-only tree page — and `TechTreeView.vue` is *already* a read-only page rendering exactly that data. It makes the existing build decisions richer rather than bolting a parallel grind next to them. It is the only option here that could ship in a single PR.
- **Why not on its own:** there is no agency at the moment of unlock. Nothing is chosen, nothing is paid, nothing is given up — so it reads as an achievement system, and it overlaps hard with quests (#127), which will want that exact space. It also cannot express exclusivity, which is where the interesting decisions live.
- **Verdict:** not the answer, but a **strong cheap first slice** if the recommendation below is judged too big to start. See §8, Option "small".

### Idea E — "Doctrines": each settlement irrevocably picks one of N specialisations

At Longhouse 5 a settlement declares a doctrine — *Timberhold*, *Ironhold*, *Seahold*, *Warhold* — gaining a large standing bonus and locking the others out permanently.

- **Why it is attractive:** very cheap (one enum column + one modifier), enormous flavour, and it fits §3's per-settlement philosophy perfectly. It also makes multi-settlement play *structurally* interesting (#131's overview UI suddenly has something to show), which nothing else on this list does.
- **Why not as "research":** it is one decision, not a tree, and it is per-settlement rather than progression. It answers "what is this settlement for", not "what has this player learned".
- **Verdict:** a good idea that is **not this feature**. Worth its own issue; noted in §9.5 as complementary, and deliberately kept out of v1 so the two don't fight over the same modifier budget.

---

## 4. Comparison

| | A · Lore-hall list | B · Saga tree ⭐ | C · Ages | D · Emergent | E · Doctrines |
| --- | --- | --- | --- | --- | --- |
| Is it a *tree*? | no (checklist) | **yes (DAG + exclusivity)** | no (ladder) | yes, but unchosen | no (one pick) |
| Real player choice | none | **high** | low | none | one-shot, high |
| New currency needed | no | **no** (resources + Renown gate) | no | no | no |
| Breaks "nothing pooled" (§3) | no | **partially — see §5.2** | no | yes (account-wide by nature) | no |
| Costs a hex (§7) | yes | **yes** | no | no | no |
| Answers the level-10 ceiling | no | **yes** | yes | partly | no |
| Late-game longevity (month 5+) | poor | **good** | good | poor | poor |
| Implementation size | S | **L** | M | XS | S |
| Can ship incrementally | yes | **yes — §8** | no (cliff) | yes | yes |

---

## 5. Recommendation — Idea B, with A's plumbing and D's cheap first slice

Ship the **Saga tree**, built so that its first phase is indistinguishable in cost from Idea A, and so that Idea D's derived unlocks can be expressed as tree nodes with a zero resource cost if we ever want them.

### 5.1 The answers #115 asked for

| Question from #115 | Answer | Why |
| --- | --- | --- |
| What does research unlock? | **All three** — unit types, per-building level ceilings above 10, and passive settlement-wide percentages. | Only unlocking units makes it a training tax (Idea A's flaw). The level ceiling is the one lever that gives an established player something to want. |
| Where is it done? | **A new `LoreHall` building.** Not the Longhouse. | Folding it into the Longhouse makes research free (no hex, no build slot), which contradicts §7 and makes the Longhouse level a third time the answer to everything. #115 itself flags the "Longhouse = territory anchor only" conflict; a dedicated hex is the honest cost. |
| Currency? | **The four existing resources + time.** No new currency. Renown gates *tier access* as a threshold, and is never spent. | #115 explicitly warns against a second culture-points number. Renown (PR #72) is already an account-wide, never-spent, always-accruing stat — a threshold read is exactly what it is shaped for. |
| Per-settlement or account-wide? | **Cost is per-settlement, the unlock is account-wide.** | See §5.2. |
| Interaction with shrines (#53)? | **Orthogonal effects, shared stacking model.** Research percentages join the same additive-then-cap pool as shrine favour and rune effects, under one cap. Shrine *domains* are not research-gated. | Three independent boost systems each with their own cap is how balance becomes unfixable. One pool, one cap, one place to reason about it. |
| Tree or flat list? | **Tree**, with tiers, prerequisites, and a small number of mutually exclusive capstones. | The exclusivity is the entire point; without it a "tree" is a ladder drawn sideways. |

### 5.2 The "nothing pooled" question, answered properly

§3 says nothing is pooled. Research is account-wide. That looks like a violation, so it should be argued rather than waved through:

- **What §3 is actually protecting** is the logistics game: resources, garrisons and queues are local, so caravans and reinforcement runs are meaningful and a distant settlement is genuinely exposed. That is a statement about *matter*.
- **Knowledge is not matter.** A caravan cannot carry the knowledge of how to build a catapult, and a raid cannot plunder it. Making a player re-research the same topic in every settlement does not add a logistics decision — it adds typing.
- **The split that keeps both true:** the *cost* stays local. A research is started at one settlement's Lore-hall, paid from that settlement's stores, occupying that settlement's hex, and blocked while that settlement's research slot is busy. The *result* is account-wide. Matter is local; ideas travel free.
- **Practical corollary:** a player will naturally build one strong Lore-hall in their safest settlement. That is fine, and it is interesting — that settlement becomes a target worth raiding, and per §9.3 losing it should cost the *ability to research*, never the knowledge already held.

This is also the answer to the same question in #117 (forge scope), and the two should agree: **the forge is matter (it upgrades physical gear → per-settlement), research is knowledge (→ account-wide).** That gives the two systems a principled boundary instead of an arbitrary one.

---

## 6. The recommended design in detail

### 6.1 Domain shape

A new namespace `Bjarnoy.Domain.Research`, mirroring `Bjarnoy.Domain.Units`' catalogue-as-data convention exactly:

```
Research/
  ResearchBranch.cs      enum: Craft, War, Sea
  ResearchTopic.cs       enum + ToWireName(), exactly like UnitType/BuildingType
  ResearchDefinition.cs  record: the data for one node
  ResearchCatalogue.cs   static table; TryGet/Get/AllTopics/IsAvailable
  ResearchOrder.cs       an in-progress research + ResearchRejection enum + ResearchDecision
  ResearchState.cs       account-level: known topics + current order; SettleTo(now)
  ResearchEffect.cs      percentage bundle (or reuse Shrines.ShrineEffect — see §7)
```

```csharp
public sealed record ResearchDefinition
{
    public required ResearchTopic Topic { get; init; }
    public required ResearchBranch Branch { get; init; }

    /// <summary>1–4. Tier gates Renown and Lore-hall level; see ResearchCatalogue.</summary>
    public required int Tier { get; init; }

    public required ResourceAmounts Cost { get; init; }
    public required TimeSpan Duration { get; init; }

    /// <summary>Every one of these must be known first. Empty = a root topic.</summary>
    public IReadOnlySet<ResearchTopic> Requires { get; init; } = new HashSet<ResearchTopic>();

    /// <summary>Knowing any of these permanently forecloses this one (capstones).</summary>
    public IReadOnlySet<ResearchTopic> ExcludedBy { get; init; } = new HashSet<ResearchTopic>();

    public int RequiredLoreHallLevel { get; init; } = 1;

    /// <summary>Account Renown floor. Reads PR #72's RenownAccount; never spends it.</summary>
    public double RequiredRenown { get; init; }

    // --- what it grants ---
    public UnitType? UnlocksUnit { get; init; }
    public BuildingType? UnlocksBuilding { get; init; }

    /// <summary>Raises BuildingCatalogue's level ceiling for one type. See §6.4.</summary>
    public (BuildingType Type, int MaxLevel)? RaisesLevelCap { get; init; }

    /// <summary>Percentage effects, joining the shrine/rune stacking pool (§7).</summary>
    public ResearchEffect Effect { get; init; } = ResearchEffect.None;
}
```

`ResearchState` is the account-level aggregate and follows `RenownAccount`'s lazy-settle shape — no background worker:

```csharp
public sealed record ResearchState
{
    public IReadOnlySet<ResearchTopic> Known { get; init; }
    public ResearchOrder? Current { get; init; }

    /// <summary>Folds a completed order into Known. Called on every read, like ResourcePool.</summary>
    public ResearchState SettleTo(DateTimeOffset now);

    public ResearchDecision PlanResearch(
        ResearchTopic topic, Guid settlementId, int loreHallLevel,
        double renown, ResourcePool stores, DateTimeOffset now,
        Guid orderId, double speedFactor = 1.0);
}
```

`ResearchRejection` mirrors `BuildRejection`/`TrainRejection` (`Buildings/BuildOrder.cs:40`, `Buildings/TrainingOrder.cs:71`):

```
None, UnknownTopic, AlreadyKnown, AlreadyResearching, PrerequisiteMissing,
Foreclosed, NoLoreHall, LoreHallTooLow, RenownTooLow, NotEnoughResources
```

### 6.2 The three branches

Names are Old Norse to match the shrine/settlement flavour; they are placeholders for a naming pass, not final copy.

**Bein (Craft)** — the economy branch.

| Tier | Topic | Grants |
| --- | --- | --- |
| 1 | Timberwright | +5% Wood production |
| 1 | Stonewright | +5% Stone production |
| 2 | Deep Cellars | +15% storage capacity |
| 2 | Scaffolding | −10% build duration |
| 3 | Master Carpentry | Lumberjack/Farm level cap 10 → 12 |
| 3 | Quarrymaster | Quarry/StorageHouse level cap 10 → 12 |
| 4 ✦ | **Hall of the Thing** *(capstone)* | +1 build queue slot (`MaxQueueLength` 3 → 4) |
| 4 ✦ | **Great Works** *(capstone)* | Longhouse level cap 10 → 12 (claim radius follows) |

**Blóð (War)** — the military branch. Hands over to the forge (#117) rather than duplicating it.

| Tier | Topic | Grants |
| --- | --- | --- |
| 1 | Shieldwall | +5% garrison defence |
| 1 | Raiding Parties | +10% unit carry capacity |
| 2 | Berserkergang | unlocks `Berserker` (replaces its Longhouse-level gate) |
| 2 | Ironworking | unlocks the Forge building (#117's prerequisite) |
| 3 | Siegecraft | unlocks `Catapult` |
| 4 ✦ | **Úlfhéðnar** *(capstone)* | +10% attack, −10% defence |
| 4 ✦ | **Skjaldborg** *(capstone)* | +15% defence, −5% travel speed |

**Vindr (Sea & lore)** — expansion, logistics, intelligence.

| Tier | Topic | Grants |
| --- | --- | --- |
| 1 | Wayfinding | +10% army travel speed |
| 1 | Saltcuring | +25% food carry capacity |
| 2 | Shipwrightry | unlocks `Longship` (replaces its unit prerequisite) |
| 2 | Farsight | +1 vision radius (`FogVisionRadii`) |
| 3 | Landnám | −25% settler crew cost (interacts with PR #72's `2^(n-1)` curve) |
| 4 ✦ | **Kaupmenn** *(capstone)* | +1 trade ratio tier, +50% trade range (#46) |
| 4 ✦ | **Landvættir** *(capstone)* | −1 Renown threshold step for the next settlement |

✦ = the two capstones of a branch exclude each other. A player finishes with **at most three capstones out of six**, which is the identity axis the game currently lacks.

### 6.3 Pacing: Renown gates tiers, the Lore-hall gates rate

| Tier | Renown floor | Lore-hall level | Cost band | Duration band (speed ×1) |
| --- | --- | --- | --- | --- |
| 1 | 0 | 1 | ~600 total | 1–2 h |
| 2 | 400 | 3 | ~2 500 total | 4–8 h |
| 3 | 1 500 | 5 | ~9 000 total | 12–24 h |
| 4 (capstone) | 5 000 | 8 | ~30 000 total | 2–4 d |

- Renown floors sit *between* PR #72's settlement thresholds (500 / 1000 / 2000 / 4000) so the two curves interleave rather than gate on the same beats.
- Duration is divided by the world's `speedFactor`, exactly as `Settlement.PlanBuild` already does for build duration (`Settlement.cs:539`).
- The Lore-hall's own level additionally shortens research: `duration × (1 − 0.03 × (loreHallLevel − requiredLevel))`, floored at 0.5×. Levelling the Lore-hall past the gate is therefore useful but never mandatory.
- **One research at a time, account-wide.** Not per settlement — otherwise a five-settlement player researches five times as fast, and the whole tree collapses in a fortnight. This is the single most important balance decision on this page.

### 6.4 Integration points, precisely

Each of these is a small, additive change to code that already exists:

| Where | Change |
| --- | --- |
| `Settlement.PlanBuild` (`Buildings/Settlement.cs:467`) | New optional `IReadOnlySet<ResearchTopic>? known = null` parameter, in the style of the existing optional `speedFactor`/`isCoastalWater`. Rejects with a new `BuildRejection.ResearchMissing` for a research-gated building. |
| `BuildingCatalogue.MaxLevel` (`:19`) | Stays as the base const. A new `MaxLevelFor(type, known)` returns the raised ceiling; `PlanBuild`'s `targetLevel > MaxLevel` check calls it. Every existing caller keeps working against the const. |
| `UnitCatalogue.IsAvailable` (`Units/UnitCatalogue.cs:175`) | Overload taking `known`; `UnitDefinition` gains `RequiredResearch`. For `Berserker`/`Catapult`/`Longship` the research replaces the current gate rather than stacking on it — two gates for the same unit is the Idea-A tax we are avoiding. |
| `Settlement.PlanTrain` (`:916`) | Passes `known` through; new `TrainRejection.ResearchMissing`. |
| `Settlement.CurrentTotals` (`:884`) | Research production/storage percentages fold in via the *same* helper shrines use (PR #57's `BoostedTotals`), under the same `MaxEffectBonus` cap. |
| `FogVisionRadii`, `TradeRange`, `Army` speed/carry | Read their research modifier from one shared `ResearchEffect` lookup rather than each growing its own. |

### 6.5 Persistence

- `ResearchStateEntity` — `(UserId, WorldId)` unique, holding the current order's columns (`Topic`, `SettlementId`, `StartedAt`, `CompletesAt`) plus `SettledAt`.
- `KnownResearchEntity` — one row per learned topic, FK to the state. A row-per-topic table rather than a bitmask column: it keeps the topic enum free to be renumbered and makes admin edits and analytics trivial.
- Migrations for **both** providers (`Bjarnoy.Migrations.Sqlite`, `Bjarnoy.Migrations.PostgreSql`), and `dotnet ef migrations has-pending-model-changes` must come back clean for both — the bar PR #72 set.
- **Scoping caveat, stated up front:** research is per `(user, world)`, not global across worlds, matching the caveat `RenownService` already documents for Renown. Two worlds means two trees.

### 6.6 API

Following the existing split between static catalogue and per-player state:

| Endpoint | Notes |
| --- | --- |
| `GET /api/v1/research` | The static catalogue, unauthenticated, exactly like `/api/v1/buildings` and `/api/v1/units` (`SettlementEndpoints.cs:71,77`). Snapshot it into `src/frontend/src/data/research-catalogue.json` with the same generator. |
| `GET /api/v1/worlds/{worldId}/research` | The caller's known topics, current order, and per-topic availability with a rejection reason for anything unavailable — so the UI never re-derives the rules. |
| `POST /api/v1/settlements/{id}/research` | `{ "topic": "berserkergang" }`. Must carry `SettlementOwnershipEndpointFilter`, like every other mutating settlement endpoint (`Api/Auth/OwnershipEndpointFilters.cs`). |
| `DELETE /api/v1/settlements/{id}/research/{orderId}` | Cancel. Refund policy in §9.2. |
| `POST /api/v1/admin/users/{id}/research` | Admin grant/revoke, for testing and support — the same shape PR #57 uses for granting runes, and the hook #105's admin-UI gap will want. |

### 6.7 Frontend

- **New `ResearchView.vue` at `/research`**, plus a HUD entry point in `SettlementView.vue` next to the build/training panels. The DAG renders as three vertical branch columns with tier rows and prerequisite edges — a full free-form graph layout is not needed and not worth the dependency.
- A node shows: state (known / researching with countdown / available / locked), cost, duration, effect, and *why* it is locked, taken from the API's rejection reason rather than re-implemented client-side.
- New `stores/research.ts`, mirroring `stores/buildingCatalogue.ts` — session cache, live-or-fallback source flag, offline JSON snapshot.
- Demo mode needs a seeded fake state so the landing flow and e2e specs work without a backend, the way the other stores do.

---

## 7. Interaction with the systems already in flight

| System | Relationship | Decision |
| --- | --- | --- |
| **Shrines & runes** (#53 / PR #57) | Both apply percentages over `BuildingCatalogue.Totals`. | **Share the stacking model and the cap.** Research effects join the same additive-then-cap pool (`MaxEffectBonus = 0.5`). Reuse `ShrineEffect` outright if #57 lands first, generalising its name; otherwise define `ResearchEffect` with the same algebra and merge later. Shrine domains are **not** research-gated — orthogonal systems, one modifier pool. |
| **Forge / smith** (#117) | Adjacent, easily confused. | **Split by the matter/knowledge line from §5.2**: the forge upgrades physical gear, so it is per-settlement and retroactive to that garrison; research is knowledge, so it is account-wide. Research *unlocks* the Forge building via `Ironworking`; it does not set unit stats. This split should be written into #117's doc too. |
| **Renown / settlers** (#55 / PR #72) | Research reads Renown. | **Read-only.** Renown is never spent — it stays a monotonic threshold stat. `Landnám` and the `Landvættir` capstone touch settler *cost* and *threshold step*, not the Renown value. Blocked on #72 merging; §8 phase 2 can stub the read behind an interface until it does. |
| **Quests** (#127) | Overlaps Idea D's territory. | Quests should **reward** research progress (resources, a free tier-1 topic) and teach the tree in the beginner chain. Quests do not unlock topics directly, or the tree stops being a choice. |
| **Premium** (#129) | Instant-finish is the obvious gold sink. | **Decide before shipping, not after.** Recommendation: gold may finish a running research early, and may not skip a Renown or prerequisite gate. Pay-to-hurry, not pay-to-win. |
| **Conquest** (#123) | What happens to research on capture? | Knowledge is never captured or lost (§9.3). Capturing a settlement takes its Lore-hall *building*, i.e. the loser's ability to research further; the topics they already know are theirs forever. |
| **Multi-village UI** (#131) | Needs to show research. | The overview table wants one research row (topic + countdown), account-wide rather than per settlement. |
| **Leaderboards** (#43) | Research is a natural score axis. | Optional follow-up: a "lore" board over known-topic count. Not v1. |

---

## 8. Implementation plan

Six PRs, each independently buildable and testable, following the repo's convention of one PR per phase with conventional-commit titles. The first three carry the risk; the rest are mechanical.

| # | PR | Contents | Depends on |
| --- | --- | --- | --- |
| 0 | `docs: research / tech tree design (#115)` | **This document.** Review gate — §10's open questions get answered before phase 1 starts. | — |
| 1 | `feat(research): domain model and catalogue` | The whole `Bjarnoy.Domain.Research` namespace, the three branches as data, `ResearchState.PlanResearch`/`SettleTo`, and `Bjarnoy.Domain.Tests` coverage: prerequisite chains, exclusivity, tier gates, insufficient resources, lazy settle across a completion boundary, and a **catalogue integrity test** (no cycles, every `Requires` target exists, every unlocked unit/building exists, exclusivity is symmetric). No persistence, no API. | — |
| 2 | `feat(research): gate buildings, units and totals on known topics` | The §6.4 integration points. Additive optional parameters, so nothing existing changes behaviour when no research is known. Tests assert exactly that: an account with no research behaves identically to today. | 1 |
| 3 | `feat(research): persistence and migrations` | Both entities, `ToDomain`/`ApplyDomain` round-trip, SQLite + PostgreSQL migrations, `has-pending-model-changes` clean on both. | 1 |
| 4 | `feat(research): API endpoints` | The five endpoints from §6.6 with ownership filters, plus `Bjarnoy.Api.IntegrationTests` covering the full path: build a Lore-hall → start a research → skip the clock → assert the unit is trainable. Ownership-refusal tests included — the gap analysis calls out that missing-authz is invisible to the suite by omission, so this one is not repeated. | 2, 3 |
| 5 | `feat(research): research view and HUD panel` | `ResearchView.vue`, `stores/research.ts`, the offline snapshot, demo-mode seed, HUD entry, and an e2e spec. Screenshots in the PR per `AGENTS.MD`. | 4 |
| 6 | `chore(research): balance pass` | Replace §6.3's placeholder numbers with figures checked against a simulated 6-month curve. Explicitly a separate PR — every catalogue number in this repo is currently placeholder, and stacking research on top compounds that. | 5 |

**A smaller opening move, if phase 1 is judged too large:** ship Idea D first — a `ResearchCatalogue` whose nodes have zero cost and unlock automatically from building levels, rendered read-only in the existing tech-tree page. That is roughly one PR, delivers a visible tree, and every node definition it writes is reused verbatim by phase 1 when costs and the Lore-hall are added on top. Nothing is thrown away.

---

## 9. Details that are easy to get wrong

### 9.1 Losing the Lore-hall mid-research

A razed or captured Lore-hall while a research is running: the order is **cancelled and fully refunded** to the settlement that paid, not silently completed and not lost. Anything else makes a well-timed raid a way to burn a day of someone's progress with no counterplay.

### 9.2 Cancellation refund

Refund **50%** of the resources, forfeit the elapsed time. A 100% refund makes starting a research free optionality (queue the expensive one, cancel it when raided); 0% is a trap for a misclick. The build queue's own `CancelBuild` (`Settlement.cs:603`) should be checked when implementing, and the two should agree — divergent refund rules across two queues is a support burden.

### 9.3 Knowledge is never lost

No decay, no unlearning, no plunder. A topic learned is known for the life of the world. This is what lets research be the *stable* progression axis while territory and armies swing — and it is why an exclusive capstone is a genuinely permanent decision rather than a rentable one.

### 9.4 The `TechTreeView.vue` naming collision

`TechTreeView.vue` is the building codex (#101). Once a real research tree exists, two pages will claim the name. **Rename the existing page's route and title to "Building codex"** in phase 5 — file rename optional, but the user-visible label must move. Leaving both called "tech tree" guarantees a bug report.

### 9.5 Deliberately deferred

- **Ages** (Idea C) — revisit once a world lifecycle exists; tiers map onto ages without a data-model change.
- **Doctrines** (Idea E) — worth its own issue; kept out so it doesn't compete for the same modifier cap.
- **Guild-shared research** (#124) — an alliance researching together is a good idea and a large one; not v1.
- **A second concurrent research slot as a premium perk** — plausible, but it halves the tree's length for payers, so it needs the §7 premium decision first.
- **Per-branch specialisation costs** (researching wide costs more than deep) — an extra dial; not needed until the balance pass shows the tree finishing too early.

---

## 10. Open questions — need a decision before phase 1

1. **Capstone exclusivity: permanent, or buyable-out?** This doc assumes permanent (§9.3), which is the whole source of identity. A "reforge your saga" gold option would be a strong premium item — but it converts the one real decision in the tree into a rental. **Recommend: permanent, and never sell it.**
2. **Is one concurrent research account-wide correct?** §6.3 argues yes. The alternative — one per settlement — makes the tree scale with settlement count and finish far too early. Confirm before the numbers are tuned, because everything in §6.3 hangs off it.
3. **Should research raise `MaxLevel` at all, or is level 10 sacred?** Raising it is the strongest late-game answer here, but it touches the economy curve everywhere and interacts with `Settlement.MaxClaimRadius` via the Longhouse capstone. If this is a no, `Great Works` and both tier-3 Craft nodes need replacing.
4. **Three branches, or four?** Three keeps it legible; a fourth (faith/lore) would give shrines (#53) a home in the tree — at the price of coupling two systems this doc deliberately keeps orthogonal.
5. **Does Fjørdhold (the 3–20 minute round game) get research at all?** A 20-minute round cannot host a multi-day tree. Options: no research at all; or a single tier-1 pick as an opening-move choice. **Recommend: none in v1**, and say so explicitly so nobody builds toward it.
6. **Blocking dependency:** phase 2 reads Renown, which lives in unmerged PR #72. Either #72 merges first, or phase 2 reads through a small interface with a constant-zero implementation until it does. **Recommend: wait for #72** rather than carry a shim.

---

## 11. Prior art, evaluated

| Game | Model | Worth stealing? |
| --- | --- | --- |
| **Travian** | Academy; per-unit research, per-village, cost scales with how many unit types that village already has; tribe-specific trees. | The Academy-as-a-building shape, yes. Per-village repetition, no (§5.2). The scaling-with-count cost is clever and worth revisiting in the balance pass. |
| **Die Stämme / Tribal Wars** | No research system; the smithy covers unit upgrades and general tech is flat. | Its absence is the evidence for keeping the forge (#117) and research strictly separate — that game merges them and the result is that "research" means nothing. |
| **Forge of Empires** | Age-based tree; ages unlock whole generations; a genuine graph with branch choices. | The age wrapper (Idea C) and the graph-with-choices shape. Its research-points-per-hour currency is exactly the second culture-points number #115 warns against. |
| **Ikariam** | Four research branches (seafaring, economy, science, military) with per-branch accumulating points; wide-vs-deep tension. | The **branch structure** — this is the closest prior art to §6.2, and its wide-vs-deep tension is the dial noted in §9.5. |
| **OGame** | Deep linear research with steep exponential costs; research is the whole mid-game. | The exponential cost curve as a long-game sink. Its near-total lack of exclusivity is what makes every OGame account converge on the same build. |
| **Grepolis** | Per-city research points from an academy, redistributable, with per-city caps forcing specialisation. | The **redistributable** points are a good idea we are deliberately not taking: it turns a permanent decision into a reversible one, which is exactly the property §9.3 is protecting. |
