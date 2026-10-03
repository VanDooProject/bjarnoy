# Settlement expansion — settlers and colonisation

> **Status: implemented.** This issue (#55) was designed and built directly from its issue body in [PR #72](https://github.com/VanDooProject/bjarnoy/pull/72) before this doc's branch was merged, so the two were written independently. They landed on the same shape — Settler Crew as a Civilian unit, 3-crew founding, overland A* vs. sea-convoy routes, an escalating (`×2^n`) settler cost, and a never-decaying account-level Renown stat gating settlement count only — which is a good sign the design was sound. The tables below have been corrected to PR #72's actual shipped numbers where they differ from this doc's original proposal; the reasoning and prior-art sections are unchanged and still apply. Treat this file as the historical rationale, and `Bjarnoy.Domain.Settlers.Founding`/`Renown`/`RenownThresholds` as the source of truth for exact figures going forward.

Extends §3 of MECHANICS.md ("New settlements are founded by loading a settler crew on a longship…"). That sentence stays true; this doc defines the unit, both founding routes, the cap that stops sprawl, and the edge cases.

---

## 1. The Settler Crew

One new `UnitDefinition`, **Settler Crew**, in the existing **Civilian** class alongside the Provisioner. No new class: settlers fight like civilians (barely), move like civilians, and die like civilians. What makes them special is a single flag — *can found a settlement* — not a new taxonomy.

| Stat | Value (as shipped, `UnitCatalogue`) | Note |
| --- | --- | --- |
| Class | Civilian | Same as Provisioner |
| Attack / Defence | 0 / 3 | They run, they don't fight |
| Speed | 4 hex/h | Same pace as Spearman/Axeman/Bowman/Provisioner, so an overland escort neither bottlenecks nor outruns the crews; a sea convoy travels at the (faster) carrying ship's speed instead |
| Upkeep | 1 food/h each | |
| Food carry | 40 | Range is upkeep-gated like every unit |
| Training cost | See §3 — scales with settlement count | |
| Required Longhouse level | 4 | Trained at the **Longhouse**, not the barracks; expansion is a decision of the hall |
| To found | **3 crews on the same hex** | |

**Why three, not one.** Three crews is the Travian pattern and it earns its place here: it triples the raidable investment in transit, it forces a real convoy (one Karve can't carry all three — see §2), and it makes losing *part* of an expedition a meaningful partial failure instead of all-or-nothing. A single-unit colonist (the Die Stämme noble shape) fits conquest, not colonisation — if we later add settlement capture, that's where a solo unit belongs.

Settlers move as an ordinary stack under the planned Movement model: path frozen at dispatch, position by interpolation, stack speed = slowest unit. Escorts are allowed and encouraged — a settler convoy with Axemen moves at 3 hex/h either way, since the settlers are already the slowest thing in it.

## 2. Two founding paths

Both paths end the same way: 3 Settler Crews standing on an unclaimed, buildable land hex. How they get there is the existing movement model, not a parallel system.

### 2a. Overland — same landmass

March the crews as a normal land stack to any unclaimed hex reachable by land pathing.

- A* over land hexes with the standard terrain costs (grass 1.0, forest 1.3, sand 1.1, mountain 2.0/impassable). Sea is impassable; "same island" is not a special-cased check, it simply falls out of whether a land path exists.
- Range is food-gated as usual. At 3 hex/h and 3 food/h upkeep per crew, an unescorted overland founding has a natural radius — inland expansion near home is cheap, trans-island treks cost provisioning (Provisioners in the convoy extend range; that unit finally gets its headline job).
- The target hex may be inland. Overland is the only way to found a non-coastal settlement, which is its structural advantage over the sea path.

### 2b. By sea — any island

Load the crews on ships and sail.

- **Karve**: carries 1 Settler Crew. **Longship**: carries 2. A minimum expedition is therefore Longship + Karve, or three Karves — a small fleet, visible on the map as such. No dedicated colony ship for now; the Ikariam-style special vessel adds a build-tree stop without adding a decision (see §6).
- Ships path over sea hexes at fleet speed (slowest ship). Landfall only on a **shoreline hex** — the existing rule, unchanged. The settlers disembark and the founding resolves on that hex, or they continue overland under 2a rules if the target is a few hexes in.
- Embark/disembark at the home end requires a **Harbour**; at the far end, any shoreline hex works — that's the point of being vikings.
- The whole journey is one frozen path (sea leg + land leg), same shape as `CartMovement`: waypoints with cumulative hours, position interpolated at read time, ETA visible to everyone with vision — including the defender of the island you're sailing at.

## 3. Prerequisites and limits

### Renown

New account-level stat: **Renown** — the culture-points equivalent, and the only new number this doc introduces.

- **Accrues** per hour, across all settlements: each building contributes its level in Renown/h (a Lv 6 Longhouse gives 6/h, a Lv 3 quarry 3/h). Building tall and building wide both count; doing nothing counts for nothing.
- **Never decays, never spent.** It's a threshold stat, not a currency. Spending it (Travian celebrations) is deferred — see open questions.
- **Gates settlement slots only.** Claim radius stays gated by Longhouse level; keeping the two growth axes on separate stats means "wide" and "tall" remain distinct strategies instead of one number ruling both.

| Settlement # | Renown required (as shipped, `RenownThresholds`) |
| --- | --- |
| 2nd | 500 |
| 3rd | 1 000 |
| 4th | 2 000 |
| 5th | 4 000 |
| n-th | `500 × 2^(n-2)` — doubles each step |

### Scaling settler cost

Each Settler Crew's training cost scales with settlements **already held**:

| Founding your… | Cost per crew (wood/stone/food/iron) | ×3 crews |
| --- | --- | --- |
| 2nd settlement | 1 500 / 1 200 / 2 000 / 800 | ~16.5k total |
| 3rd | ×2 | ~33k |
| 4th | ×4 | ~66k |
| n-th | ×2 per settlement | |

Cost is fixed at training time. Distance costs nothing extra in resources — it already costs time, food upkeep, and exposure, which is the honest hex-map version of Tribal Wars' distance pricing.

### Other prerequisites

- Longhouse **Lv 4** in the training settlement to train Settler Crews at all (as shipped — the design doc originally proposed Lv 6; the shipped value matches the existing minimum-required-Longhouse-level pattern used by other high-tier units).
- Target hex must be unclaimed, buildable land, and clear the world's minimum-spacing rule against **every** already-claimed settlement's own claim border (not just its centre) — the same `SettlementService.MinimumSpacing` rule founding already enforces (widened by #110 to `2 × MaxClaimRadius + 1`, so two fully-leveled neighbours' claim discs can never end up touching).
- No per-island settlement quota. Islands crowd naturally; contested islands are content, not a bug. Clans holding islands jointly (§8 of MECHANICS.md) is the intended counterplay.

## 4. What happens on founding

When 3 Settler Crews stand on a valid hex:

- The crews are **consumed** — they become the population.
- **Longhouse Lv 1** appears on the target hex; claim radius starts at the standard Lv 1 value from `Settlement.ClaimRadius` (`1 + level / 2`, i.e. 1 hex — MECHANICS.md's illustrative "Lv 4 = 12 hexes" figure was aspirational flavour text, not the shipped formula).
- Starting stocks: a nominal boot-strap (200 of each resource) plus **whatever unspent food the convoy still carried** — provisioning well for the journey is provisioning the colony.
- No garrison, no wall. The settlement starts **undefended**; escort units that travelled with the convoy remain as its first garrison, which makes escorting a real choice rather than paranoia.
- The founding player's border, banner and name render on the island immediately. Everyone with vision of that island sees a new neighbour.

## 5. Failure and edge cases

| Case | Resolution |
| --- | --- |
| Target hex claimed while convoy in transit | Founding fails on arrival. Convoy holds position; owner may retarget any valid hex (new frozen path from current position) or recall. Settlers are not lost — arriving second costs time, not the expedition. |
| Target hex still unclaimed but now within the minimum-spacing rule of a new claim | Same as above: fail, hold, retarget or recall. |
| Convoy attacked in transit | Settlers fight (badly) with whatever escort they have. Dead crews are dead — replacements must be trained at current (scaled) cost and sail out to join survivors, or the survivors recalled. 1–2 surviving crews on the target hex just stand there; founding requires 3. |
| Ships sunk at sea | Crews aboard are lost with the ship. Splitting three crews across three Karves is diversification; two-on-a-Longship is efficiency. Player's choice. |
| Recall mid-journey | Allowed any time. Path re-freezes from the interpolated current position back home; sea recall requires the fleet, land units walk. Food-gating still applies — a convoy recalled at the edge of its provisioning can starve on the way back. Recall is safe-ish, not free. |
| Renown threshold met at dispatch, but a settlement is lost in transit | Founding still resolves — the slot check runs at **dispatch**, not arrival. One check, one moment, no re-litigating mid-flight. |

## 6. Prior art

| Game | Mechanic | Verdict |
| --- | --- | --- |
| Travian | 3 settlers + culture points | **Adopt.** Both halves fit directly; Renown is CP with viking paint and no decay. |
| Travian | CP celebrations (spend resources for CP) | **Defer.** Renown-as-threshold first; a spend-sink can bolt on later if pacing needs it. |
| Die Stämme | Noble (conquest) vs. colonist split | **Adapt later.** The split is right — colonisation here, and a separate capture unit if/when settlement conquest (§8 sieges) gets its own doc. Don't fuse them. |
| Ikariam | Dedicated colony ship | **Reject.** Karve/Longship cargo already makes sea founding a fleet decision; a special hull is a tech-tree toll booth. |
| Ikariam | Max colonies by empire tech | **Reject** as a separate tech; Renown already is the empire-wide gate, earned by playing rather than researched. |
| Forge of Empires | No cap, diminishing returns | **Reject.** A real-time raiding map needs sprawl limits; unlimited settlements turns the sea into suburbs. |
| Tribal Wars | Distance-scaled founding cost | **Adapt.** Don't price distance in resources — the hex model already prices it in travel time, food upkeep and days of exposure. |

## 7. Open questions

Resolved by PR #72's v1, listed here for the record: escorting is allowed (falls out of ordinary stacking, no special-casing needed); the dispatch-time renown/spacing check is never re-invalidated for an in-flight convoy; the spacing rule is checked against **every** claimed settlement in the world, yours included, so it also applies to your own borders.

Still open, not addressed by the shipped v1:

- All numbers above (Renown curve, cost doubling) are explicitly documented in `RenownThresholds`/`Founding` as "a reasonable v1 curve, not a tuned economy figure" — still need real balancing.
- Convoy-attacked-in-transit combat is a documented TODO in PR #72 — there's no existing "attack an in-transit army" mechanism yet for it to reuse.
- Can clan-mates contribute — carry another player's settlers on their ships, or gift an unclaimed hex reservation inside clan-held territory? Not addressed.
- Does razing your own settlement refund Renown standing (does settlement #4 become #3 again for cost purposes)? Renown itself never decays and the settlement-count check only reads current holdings at dispatch time, but whether cost-scaling should treat count as concurrent-vs-lifetime is still a real question.
- Do surviving partial convoys (fewer than 3 crews on target) time out and desert, or wait indefinitely until starvation resolves it? Still to confirm against the shipped upkeep numbers (1 food/h/crew, 40 food carry).
- Renown visibility: public on profile (rank ladder pressure) or private?
- Renown/settlement cap are scoped **per-world**, not summed across every world a player plays in — a deliberate v1 choice documented in `RenownService`, worth revisiting if cross-world accounts become a thing.
