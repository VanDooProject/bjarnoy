# Ship movement, multiple home ports, and the ship marker

Background: fleets already exist as unit stacks (`UnitCatalogue.Karve`/`Longship`,
`UnitClass.Ship`) with water-only A* pathing (`HexPathfinder`) and the same
provisions-based round-trip range rule as land armies (see
`docs/design/troop-movement-range.md`). This document covers what's still missing:
letting a fleet make a *different* owned settlement its home port, and the
flag-marker-vs-ship-marker rendering question.

## 1. A dock is the existing Dockyard, not a new entity

There is no new `Dock` building or table. `BuildingType.Dockyard` (coastal-water,
already required to train `Karve`/`Longship`) *is* the dock. Any settlement with a
Dockyard is a valid port for that owner's fleets. This removes an entire layer of
planned work (no new entity, no new migration, no new `GET /worlds/{id}/docks`
endpoint, no bespoke visibility logic) — a Dockyard settlement is exposed exactly
like every other settlement, so it rides whatever the general settlement-visibility
fix in [#214](https://github.com/VanDooProject/bjarnoy/issues/214) provides, with
nothing dock-specific to add on top.

## 2. Home = last owned Dockyard settlement docked at

Today, `ArmyService.FoldHome` dissolves an army back into its **origin**
settlement's garrison when it returns (the army row is deleted, its stacks merge
into `Settlement`'s garrison — there is no persisted "at home" army state to update
in place). Land armies only ever fold back into the settlement they departed from.

The one genuinely new behaviour this design needs: **a fleet that reaches a
different settlement it owns — as long as that settlement has a Dockyard — folds
into that settlement's garrison the same way**, not just its settlement of origin.
From that point on, that settlement is the fleet's home: future dispatches for
those units originate from there, using the existing settlement-dispatch path
unchanged (`Settlement.PlanDispatch`). No new "home" field is needed on the army —
folding into a settlement's garrison already *is* changing its home, exactly as it
does today for a returning army, just generalized to any owned Dockyard settlement
instead of only the original one.

Arrival at a Dockyard settlement **not** owned by the fleet's player resolves
through the existing attack/support mission handling for settlement targets —
the same path used when any army's destination is an enemy or allied settlement.
A fleet cannot use a foreign dock as a passive waypoint; reaching it always means
attack or support, never a free stop.

## 3. Refuel is not a separate mechanic

There is no refuel event, no per-dock stockpile, and no special-case code path.
Provisions are charged once, as they already are for every dispatch, from the
launching settlement's food storage (`Settlement.PlanDispatch`). A fleet that has
folded into a new home settlement simply dispatches from there next time, exactly
like a land army — the existing charge-at-dispatch model already covers this with
no changes.

If a settlement is short on food at dispatch time, nothing is rejected outright:
the existing round-trip provisions rule already reduces effective range in that
case (`TurnAroundAt` is derived from however much food is actually loaded), so a
poorer settlement simply produces shorter-ranged fleets. This is current behaviour,
not new work — the "what if the settlement can't afford full refuel" open question
from the previous draft is already answered by the existing rule.

## 4. Ship marker vs. flag pole

The marker currently drawn for every dispatched army (land **and** fleet alike) is
`flag.svg` (`src/frontend/src/assets/icons/flag.svg`), loaded via `markerIcons.ts`
and drawn in `HexMapRenderer.ts`. That flag is the land-army marker; a Dockyard
already renders as its own building tile and needs no change.

Plan: add a new `ship.svg` marker (same 64×64, right-facing, white-fill convention
as the existing icon set — see `src/frontend/src/assets/icons/README.md`), selected
per-army by unit class (`classifyUnitSelection` in `lib/units/armyDispatch.ts`
already does this classification for dispatch gating and can be reused). Land
armies keep the flag; fleets get the ship. The currently-dead `Fleet`/`addFleet`
model in `WorldModel`/`HexMapRenderer` (no callers anywhere in `src/` or `e2e/`)
is removed in favour of fleets riding the existing, backend-fed army overlay.

## 5. Open implementation details (non-blocking)

- Whether a fleet requires an explicit player order to fold into a non-origin
  Dockyard settlement on arrival, or does so automatically whenever its
  destination is an owned Dockyard settlement — needs settling during
  implementation, doesn't change the design above either way.
- World-zoom and settlement-zoom fleet orders are **both** supported, with an
  auto zoom-switch between them (exact trigger — selecting a fleet, issuing an
  order, or docking — to be settled alongside the UI work). World mode currently
  draws no buildings and skips sea tiles, so this needs its own pass regardless
  of the docking work.

## 6. Suggested task breakdown

1. `feat(map): add a ship marker icon` — new `ship.svg`, register in
   `MARKER_ICON_NAMES`.
2. `feat(map): draw fleets with the ship marker instead of the army banner` —
   `isFleet` on `ArmyOverlayMarker`, ship-appropriate anchor/wake.
3. `refactor(map): drop the uncalled Fleet model from WorldModel/HexMapRenderer`.
4. `feat(armies): allow a fleet to fold into any owned Dockyard settlement's
   garrison on arrival`, not only its settlement of origin — generalizing the
   existing `FoldHome` path; domain + integration tests covering dispatch from
   the new home settlement afterward.
5. `feat(armies): route fleet arrival at a foreign Dockyard settlement through
   the existing attack/support mission handling` — verify/close the gap where a
   `Move`/field-order destination on a settlement hex isn't already treated as an
   attack when the settlement isn't owned by the dispatching player.
6. `feat(map): world-zoom fleet orders with auto zoom-switch` (UI/UX spec needed
   first — see §5).
