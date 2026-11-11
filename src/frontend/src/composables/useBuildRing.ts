// The one build-ring model: which buildings a hex's ring offers (the placement filter), and each building's
// cost, build time, output, locks, art and availability. MapView's settlement ring and LandingView's onboarding
// ring both read it, so what the onboarding offers on a hex can never differ from what the map offers there.
import { computed, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { buildingName } from '../i18n/catalogueNames';
import { useWorldStore } from '../stores/world';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { DEMO_MODE } from '../config';
import type { AxialCoord } from '../lib/hex/coords';
import { buildingArt } from '../lib/map/buildingArt';
import { formatBuildingModifier, formatBuildingOutput } from '../lib/map/buildingStatsText';
import {
  buildingStatsAt,
  buildingUpgradeCost,
  scaleOutput,
  type BuildingModifier,
  type BuildingOutput,
  maxTowers,
  SHRINE_BUILDING_TYPES,
} from '../lib/map/buildingEconomy';
import { allPlacementRules } from '../lib/map/placementRules';
import {
  buildingAllowedOnHex,
  cropAllowedHere,
  formatBuildTime,
  hexOccupantLock,
  scaledBuildSeconds,
  isWallBuilding,
  longhouseLock,
  palisadeLock,
  bridgeLock,
  riverBuildingAllowedHere,
  riverFitLock,
  shrineLimitLock,
  storageHouseLock,
  towerLimitLock,
} from '../lib/map/ringCatalogue';
import {
  computeAvailability,
  missingPrerequisites,
  slotsNeeded,
  type RingAvailability,
} from '../lib/map/ringAvailability';
import type { RingAction, RingBuilding, RingCard, RingCategory } from '../components/hud/RingMenu.vue';
import type { Resources, Tile } from '../lib/map/types';
import type { RiverVariant } from '../lib/map/worldGenerator';
import { towerThreatAt } from '../lib/map/campRules';

/** A building type id (`Tile['buildingType']`). The catalogue serves the same ids as plain strings; `categoriesFor` narrows them here. */
export type BuildableType = NonNullable<Tile['buildingType']>;

export interface BuildCategory {
  id: string;
  buildings: { type: BuildableType }[];
}

/** The ring's category order: the water buildings first (a coastal-water hex offers them before its wall end), then the land groups. */
const CATEGORY_ORDER = ['water', 'resource', 'military', 'logistics', 'defense', 'religion'];

/**
 * The ring's categories for a hex, before locks or river and soil refinement: every building the catalogue lists in a ring category
 * (`ringCategory`, in its `ringOrder`) that may stand on this hex (`buildingAllowedOnHex`: terrain, coastal water, bog kind), minus the
 * ones switched off for new placement. Nothing here repeats `BuildingCatalogue.cs`: a new building, terrain or bog rule arrives with the
 * catalogue. The river shape and curve, island soil, wall and bridge rules are per hex and filtered by `useBuildRing`.
 */
export function categoriesFor(tile: Tile): BuildCategory[] {
  const byCategory = new Map<string, { type: string; order: number }[]>();
  for (const rule of allPlacementRules()) {
    if (rule.category === null || rule.newPlacementDisabled || !buildingAllowedOnHex(rule.type, tile)) continue;
    const list = byCategory.get(rule.category) ?? [];
    list.push({ type: rule.type, order: rule.order });
    byCategory.set(rule.category, list);
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b))
    .map(([id, list]) => ({ id, buildings: list.sort((x, y) => x.order - y.order).map(({ type }) => ({ type: type as BuildableType })) }));
}

// Category tints, carried into each category's own buildings so a building
// bubble reads as belonging to the category it fanned out of.
export const CATEGORY_COLORS: Record<string, string> = {
  resource: 'var(--food)',
  military: 'var(--iron)',
  defense: 'var(--stone)',
  religion: 'var(--shrine)',
  logistics: 'var(--stone)',
  water: 'var(--water)',
};

const RESOURCE_KINDS: (keyof Resources)[] = ['wood', 'stone', 'food', 'iron'];

type WorldStore = ReturnType<typeof useWorldStore>;

/**
 * The highest level of each building type the selected settlement has — what a building's `prerequisites` are judged
 * against (like Settlement.HighestLevelOf on the server). Live mode reads the polled building list (reactive), demo the
 * local model.
 */
export function builtBuildingLevels(world: WorldStore): Record<string, number> {
  if (DEMO_MODE) {
    const id = world.selectedSettlementId;
    return id ? world.model.highestBuildingLevels(id) : {};
  }
  const levels: Record<string, number> = {};
  for (const b of world.hud.buildings) levels[b.type] = Math.max(levels[b.type] ?? 0, b.level);
  return levels;
}

/** Every building the selected settlement has: the polled list live, the local model in the demo (`hud.buildings` is empty there). */
export function ownBuildings(world: WorldStore): { q: number; r: number; type: string; level: number }[] {
  if (!DEMO_MODE) return world.hud.buildings;
  const id = world.selectedSettlementId;
  return id ? world.model.listBuildings(id) : [];
}

export function useBuildRing(tile: Ref<Tile | null | undefined>, coord: Ref<AxialCoord | null | undefined>) {
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
  const world = useWorldStore();
  const buildingCatalogue = useBuildingCatalogueStore();
  function tileAt(q: number, r: number): Tile {
    return world.model.getTile(q, r);
  }

  // The ring's building-preview card describes the same stats as the hover tooltip and the building window,
  // so all of them use the one shared formatter (lib/map/buildingStatsText.ts).
  const formatOutput = (output: BuildingOutput): string => formatBuildingOutput(output, t);
  const formatModifier = (modifier: BuildingModifier): string => formatBuildingModifier(modifier, t);

  // Cost, build time and the longhouse gate all come from the building
  // catalogue store, which serves the backend's own numbers (GET
  // /api/v1/buildings, or its bundled snapshot in demo mode) — so the card
  // can't drift from BuildingCatalogue.cs. "hut" is demo-only and has no
  // catalogue entry, hence the client-side cost fallback and no time/lock.

  // Sawmill and Crop Mill are built directly on a river tile, and only some
  // shapes have matching art — mirrors WorldModel.placeBuilding's own check.
  // This is a fixed property of the hex (see riverBuildingAllowedHere), so
  // ringCategories below filters the bubble out entirely on a hex that will
  // never qualify, rather than rendering it locked.
  function riverShapeAt(coord: AxialCoord): string | undefined {
    return world.model.getRiverTile(coord.q, coord.r)?.shape;
  }

  function riverWidthAt(coord: AxialCoord): string | undefined {
    return world.model.getRiverTile(coord.q, coord.r)?.width;
  }

  // Only meaningful once riverShapeAt(coord) has a shape at all — see
  // riverBuildingAllowedHere's own riverVariant parameter.
  function riverVariantAt(coord: AxialCoord): RiverVariant | undefined {
    const river = world.model.getRiverTile(coord.q, coord.r);
    return river ? world.model.riverVariantAt(coord, river.shape) : undefined;
  }

  // PumpkinFarm is only offered on a Pumpkin-soil island — mirrors
  // WorldModel.placeBuilding's own check, same "filter out of the category
  // rather than render locked" reasoning riverShapeAt above uses, since this
  // too is a fixed property of the settlement rather than a progression gate.
  function currentIslandSoil(): 'wheat' | 'pumpkin' | undefined {
    return world.selectedSettlementId ? world.model.soilForSettlement(world.selectedSettlementId) : undefined;
  }

  const STORAGE_HOUSE_TYPES: ReadonlySet<string> = new Set(['storagehouse']);

  // Towers counting against the limit. Live mode reads the server's numbers for the whole (linked) realm
  // (`construction.towersHeld` / `towerLimit`: connected standing plus queued towers, the members' limits added up), the same
  // ones Settlement.PlanBuild compares; demo mode counts its local model (WorldModel.connectedTowerCount, instant placement,
  // no queue) against the Longhouse level's limit.
  function towersHeld(): number {
    if (!DEMO_MODE) return world.hud.construction.towersHeld;
    const id = world.selectedSettlementId;
    return id ? world.model.connectedTowerCount(id, []) : 0;
  }

  function towerLimit(): number {
    return DEMO_MODE ? maxTowers(world.hud.level) : world.hud.construction.towerLimit;
  }

  // Standing and queued buildings of the given types, by distinct hex, with the best standing level per hex. Live mode reads the
  // polled lists, which for a linked realm are the whole realm's (the oldest member's read: the union of the members'
  // buildings, the merged queue) like Settlement.PlanBuild counts them; demo mode reads the local model.
  function heldHexes(types: ReadonlySet<string>, standing: { q: number; r: number; level: number }[]): Map<string, number> {
    const held = new Map<string, number>();
    for (const b of standing) held.set(`${b.q},${b.r}`, Math.max(held.get(`${b.q},${b.r}`) ?? 0, b.level));
    for (const order of world.hud.queue) {
      if (types.has(order.building)) held.set(`${order.q},${order.r}`, held.get(`${order.q},${order.r}`) ?? 0);
    }
    return held;
  }

  // Shrines held (standing plus queued new-shrine orders, by distinct hex): a settlement, or a whole linked realm, raises one
  // shrine in total.
  function shrinesHeld(): number {
    const id = world.selectedSettlementId;
    if (!id) return 0;
    const standing = DEMO_MODE
      ? world.model.shrineCoords(id).map((c) => ({ ...c, level: 1 }))
      : world.hud.buildings.filter((b) => SHRINE_BUILDING_TYPES.has(b.type));
    return heldHexes(SHRINE_BUILDING_TYPES, standing).size;
  }

  // Storage houses held (standing plus queued, distinct hexes like Settlement.PlanBuild counts them; a linked realm's
  // whole set) and the standing levels, for the additional-storage-house lock.
  function storageHouseLockFor(): string | undefined {
    const id = world.selectedSettlementId;
    if (!id) return undefined;
    const standing = DEMO_MODE
      ? world.model.storageHouses(id)
      : world.hud.buildings.filter((b) => b.type === 'storagehouse');
    const held = heldHexes(STORAGE_HOUSE_TYPES, standing);
    return storageHouseLock(held.size, standing.map((h) => h.level));
  }

  // Wall orders still in the queue (live mode only; demo places instantly): the server counts them as wall hexes when it judges the next one.
  function queuedWalls(): { q: number; r: number; gate: boolean }[] {
    return world.hud.queue
      .filter((order) => order.kind !== 'raze' && isWallBuilding(order.building))
      .map((order) => ({ q: order.q, r: order.r, gate: order.building === 'palisadegate' }));
  }

  // A catalogue build time as the selected settlement runs it: Odin's Wisdom and the world's speed (`scaledBuildSeconds`).
  function buildSeconds(baseSeconds: number): number {
    const id = world.selectedSettlementId;
    return scaledBuildSeconds(baseSeconds, id ? world.model.wisdomFactor(id) : 1, world.worldSpeedFactor);
  }

  // Building a tower inside a strong, aggressive camp's guard range is allowed but the beasts will
  // burn it unless an army stands guard on it — a warning, not a lock (docs/design/wildlife-camps.md).
  // Live: the camp's server-side `aggressive` flag; demo (no camp state): any strong camp.
  function towerCampWarning(coord: AxialCoord): string | undefined {
    return towerThreatAt(world.model.camps(), coord) ? t('hud.ringMenu.towerCampWarning') : undefined;
  }

  // The highest level of each building type the selected settlement has — what a
  // building's `prerequisites` are judged against (like Settlement.HighestLevelOf
  // on the server). Live mode reads the polled building list (reactive), demo the
  // local model.
  function builtLevels(): Record<string, number> {
    return builtBuildingLevels(world);
  }

  /** One sentence per prerequisite building still missing (all of them are required). */
  function prerequisiteLocks(
    prerequisites: readonly { type: string; level: number }[] | undefined,
    levels: Record<string, number>,
  ): string[] {
    return missingPrerequisites(prerequisites, levels).map((p) =>
      t('hud.ringMenu.card.requiresBuilding', { building: buildingName(p.type), level: p.level }),
    );
  }

  /** Availability against what is actually spendable: `hud.available` (stock minus the waiting queue's reservation). */
  function availabilityFor(
    cost: RingCard['cost'],
    definition: { slotCost?: number; occupiesMostSlots?: boolean } | undefined,
    locked: boolean,
    hexBusy = false,
  ): RingAvailability {
    const construction = world.hud.construction;
    return computeAvailability({
      cost,
      available: world.hud.available,
      slotsNeeded: slotsNeeded(definition, construction.slots),
      construction,
      queue: world.hud.queue,
      locked,
      hexBusy,
    });
  }

  function ringBuildingFor(type: BuildableType, coord: AxialCoord, levels: Record<string, number>): RingBuilding {
    const definition = buildingCatalogue.byType[type]?.find((d) => d.level === 1);
    const stats = buildingStatsAt(type, 1, tileAt(coord.q, coord.r), tileAt);
    const cost = definition?.cost ?? buildingUpgradeCost(type, 1);
    const locks = [
      longhouseLock(definition?.requiredLonghouseLevel, world.hud.level),
      type === 'tower' ? towerLimitLock(towersHeld(), towerLimit()) : undefined,
      SHRINE_BUILDING_TYPES.has(type) ? shrineLimitLock(shrinesHeld()) : undefined,
      type === 'storagehouse' ? storageHouseLockFor() : undefined,
      isWallBuilding(type) ? palisadeLock(world.model.palisadePlacement(coord, type === 'palisadegate', queuedWalls())) : undefined,
      type === 'bridge' ? bridgeLock(world.model.bridgePlacement(coord)) : undefined,
      riverFitLock(type, riverShapeAt(coord), riverVariantAt(coord), riverWidthAt(coord)),
      ...prerequisiteLocks(definition?.prerequisites, levels),
    ].filter((lock): lock is string => !!lock);
    return {
      id: type,
      label: buildingName(type),
      level: 1,
      cost,
      time: definition ? formatBuildTime(buildSeconds(definition.buildSeconds)) : undefined,
      gives: stats.output ? formatOutput(scaleOutput(stats.output, world.worldSpeedFactor)) : stats.modifier ? formatModifier(stats.modifier) : undefined,
      locks,
      warning: type === 'tower' ? towerCampWarning(coord) : undefined,
      art: buildingArt(type, 1),
      availability: availabilityFor(cost, definition, locks.length > 0),
    };
  }


  /** The raw placement filter for the clicked hex: category ids and building types, before locks or river/soil refinement. */
  const placementCategories = computed<BuildCategory[]>(() => {
    // The placement rules arrive with the catalogue: reading its (reactive) definitions makes the ring rebuild once they have loaded.
    void buildingCatalogue.definitions;
    return tile.value ? categoriesFor(tile.value) : [];
  });
  /** Build is offered only on a hex that takes at least one building (docs/design/ui-guidelines.md, rule 1). */
  const canBuildHere = computed(() => categories.value.length > 0);

  /**
   * The ring's Build bubble for the clicked hex, or `undefined` where the ground takes nothing. A hex held by a giant, a guarded
   * camp or an endgame site keeps Build, locked with the reason (`hexOccupantLock`), so the map and the onboarding never offer
   * buildings there that the placement would refuse.
   */
  const buildAction = computed<RingAction | undefined>(() => {
    if (!tile.value || !canBuildHere.value) return undefined;
    const lock = tile.value.buildingType ? undefined : hexOccupantLock(tile.value);
    return { id: 'build', label: t('hud.ringMenu.actions.build'), disabled: !!lock, hint: lock };
  });

  /** The ring's categories for the clicked hex: the placement filter, narrowed by river shape and island soil, each building with its card. */
  const categories = computed<RingCategory[]>(() => {
    const hex = coord.value;
    if (!tile.value || !hex) return [];
    const levels = builtLevels();
    return placementCategories.value
      .map((category) => ({
        id: category.id,
        label: t(`hud.ringMenu.categories.${category.id}`),
        color: CATEGORY_COLORS[category.id] ?? 'var(--gold)',
        buildings: category.buildings
          // A river building whose art doesn't fit this stretch's curve stays as an explained, disabled bubble (`riverFitLock`).
          .filter(
            (b) =>
              riverBuildingAllowedHere(b.type, riverShapeAt(hex), riverVariantAt(hex), riverWidthAt(hex)) ||
              riverFitLock(b.type, riverShapeAt(hex), riverVariantAt(hex), riverWidthAt(hex)) !== undefined,
          )
          .filter((b) => cropAllowedHere(b.type, currentIslandSoil()))
          .map((b) => ringBuildingFor(b.type, hex, levels)),
      }))
      // A category the hex's river or soil filtered empty is not offered (a stream hex has nothing to build at all).
      .filter((category) => category.buildings.length > 0);
  });

  /** Whether `id` is one of the placement filter's buildings for this hex (a ring select of it is a build, not a root action). */
  function offersBuilding(id: string): boolean {
    return placementCategories.value.some((c) => c.buildings.some((b) => b.type === id));
  }

  /**
   * Demo mode places instantly: the shared place path for the map and the onboarding. Returns whether the
   * building was placed, and ticks the resource bar down by exactly what placing took out of the stock (X8).
   */
  function placeBuildingDemo(type: BuildableType, at: AxialCoord): boolean {
    const id = world.selectedSettlementId;
    if (!id) return false;
    const settlement = world.model.getSettlement(id);
    const before = settlement ? { ...settlement.resources } : null;
    if (!world.model.placeBuilding(id, at, type)) return false;
    if (settlement && before) {
      const spent: Partial<Resources> = {};
      for (const kind of RESOURCE_KINDS) {
        if (settlement.resources[kind] < before[kind]) spent[kind] = before[kind] - settlement.resources[kind];
      }
      world.syncHud();
      world.recordSpend(spent);
    }
    return true;
  }

  return {
    categories,
    canBuildHere,
    buildAction,
    offersBuilding,
    placeBuildingDemo,
    // Shared with the map's Upgrade bubble, which judges the next level against the same locks, stock and slots.
    builtLevels,
    prerequisiteLocks,
    availabilityFor,
    buildSeconds,
    formatOutput,
    formatModifier,
    tileAt,
  };
}
