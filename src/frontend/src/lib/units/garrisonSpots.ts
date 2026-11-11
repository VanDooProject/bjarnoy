// Pure helpers behind sending an army from a settlement whose garrison stands at several spots (docs/design/garrison.md): the one
// allocation rule (nearest spot to the target first) every dispatch surface and the store's request builder share.
import { hexDistance, type AxialCoord } from '../hex/coords';
import type { GarrisonSpotKind, GarrisonSpotResponse, HexPoint, UnitCountRequest } from '../../api/types';

/** The units of one dispatch that leave from one garrison spot. */
export interface SpotGroup {
  spot: HexPoint;
  kind: GarrisonSpotKind;
  units: UnitCountRequest[];
}

/** Spots nearest to `target` first (hex distance); ties by q, then r. Without a target every spot is equally near. */
export function spotsNearestFirst<T extends { q: number; r: number }>(spots: ReadonlyArray<T>, target: AxialCoord | null): T[] {
  return [...spots].sort(
    (a, b) => (target ? hexDistance(a, target) - hexDistance(b, target) : 0) || a.q - b.q || a.r - b.r,
  );
}

/**
 * Splits the units a player picked over the garrison spots: each unit type is taken from the spot nearest the target first, and
 * from the next-nearest when that one has too few. Returns the groups in that order of nearness, each with only the units it
 * gives; a spot that gives nothing is left out. A unit type asked for beyond what all spots hold is capped at what stands there
 * (the caller validates the totals).
 */
export function allocateFromSpots(
  spots: ReadonlyArray<Pick<GarrisonSpotResponse, 'kind' | 'q' | 'r' | 'stacks'>>,
  unitCounts: Readonly<Record<string, number>>,
  target: AxialCoord | null,
): SpotGroup[] {
  const ordered = spotsNearestFirst(spots, target);
  const groups = new Map<number, SpotGroup>();
  for (const [unit, wanted] of Object.entries(unitCounts)) {
    let remaining = Math.floor(wanted);
    if (!(remaining > 0)) continue;
    ordered.forEach((spot, index) => {
      if (remaining <= 0) return;
      const standing = spot.stacks.filter((s) => s.unit === unit).reduce((sum, s) => sum + Math.max(0, s.count), 0);
      const take = Math.min(standing, remaining);
      if (take <= 0) return;
      remaining -= take;
      let group = groups.get(index);
      if (!group) {
        group = { spot: { q: spot.q, r: spot.r }, kind: spot.kind, units: [] };
        groups.set(index, group);
      }
      group.units.push({ unit, count: take });
    });
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}

/** The groups in the shape of `DispatchArmyRequest.from` (no spot kind). */
export function toDispatchFrom(groups: ReadonlyArray<SpotGroup>): { spot: HexPoint; units: UnitCountRequest[] }[] {
  return groups.map((g) => ({ spot: { q: g.spot.q, r: g.spot.r }, units: g.units.map((u) => ({ unit: u.unit, count: u.count })) }));
}

/** Whether a tile of a settlement is one of its garrison spots: the centre hex (the longhouse), or a hex carrying a tower or a dockyard. */
export function isGarrisonSpotTile(tile: { q: number; r: number; buildingType?: string }, centre: { q: number; r: number } | undefined): boolean {
  if (centre && tile.q === centre.q && tile.r === centre.r) return true;
  return tile.buildingType === 'tower' || tile.buildingType === 'dockyard';
}

/** The distinct spot kinds one unit type is taken from, in the order of the allocation. */
export function spotKindsForUnit(groups: ReadonlyArray<SpotGroup>, unit: string): GarrisonSpotKind[] {
  const kinds: GarrisonSpotKind[] = [];
  for (const g of groups) if (g.units.some((u) => u.unit === unit) && !kinds.includes(g.kind)) kinds.push(g.kind);
  return kinds;
}
