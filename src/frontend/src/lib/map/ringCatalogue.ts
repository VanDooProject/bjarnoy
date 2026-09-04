// Small formatting helpers shared by the ring menu's hover card. The numbers
// themselves are server-authoritative and come from the building catalogue
// (`GET /api/v1/buildings`, or its bundled snapshot in demo mode via
// stores/buildingCatalogue.ts) — nothing here re-derives a game rule, it only
// renders one.

/**
 * `buildSeconds` as the card shows it: "4:00", "12:00", "1:30:00". Mirrors
 * BuildQueuePanel's own countdown formatting so a queued build reads the same
 * before and after it's queued.
 */
export function formatBuildTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/**
 * The reason a building can't be placed yet, or undefined when it can. Only
 * the longhouse gate is checked here: terrain is already filtered by which
 * categories the tile offers, and affordability is shown as a red cost chip
 * rather than a hard lock (the player can still queue and let it fill).
 */
export function longhouseLock(requiredLevel: number | undefined, currentLevel: number): string | undefined {
  if (requiredLevel === undefined || requiredLevel <= currentLevel) return undefined;
  return `Requires longhouse ${requiredLevel}`;
}

/**
 * The reason a Sawmill can't be placed on this specific Grass hex, or
 * undefined when it can — the same `lock` mechanism `longhouseLock` feeds, so
 * it shows as the same disabled-bubble/tooltip the ring already has. A
 * Sawmill is built directly on a river tile (`WorldModel.placeBuilding`
 * mirrors `BuildingDefinition.RequiresRiverShape`), and only a
 * `straight`/`bend` shaped one has matching art — `hasRiverShape` is whether
 * this hex's own river tile (if any) is one of those two shapes. Every other
 * buildable type has no such requirement, so this is a no-op for it (Fisher
 * Hut moved to the water category instead — see `RingMenu`'s `WATER_CATEGORY` —
 * since it's now built on coastal water itself, exactly like Fishing
 * Hut/Dockyard, with no separate lock needed).
 */
export function riverShapeLock(type: string, hasRiverShape: boolean): string | undefined {
  if (type === 'sawmill' && !hasRiverShape) return 'Needs to stand on a river';
  return undefined;
}
