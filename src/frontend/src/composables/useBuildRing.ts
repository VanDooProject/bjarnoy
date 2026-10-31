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
  type BuildingModifier,
  type BuildingOutput,
  SHRINE_BUILDING_TYPES,
} from '../lib/map/buildingEconomy';
import {
  cropAllowedHere,
  formatBuildTime,
  isWallBuilding,
  longhouseLock,
  palisadeLock,
  bridgeLock,
  riverBuildingAllowedHere,
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
import type { RingBuilding, RingCard, RingCategory } from '../components/hud/RingMenu.vue';
import type { Resources, Tile } from '../lib/map/types';
import type { RiverVariant } from '../lib/map/worldGenerator';
import { towerThreatAt } from '../lib/map/campRules';

export type BuildableType =
  | 'reindeerherder'
  | 'farm'
  | 'tower'
  | 'fishinghut'
  | 'pumpkinfarm'
  | 'shrineofthor'
  | 'shrineoffreyja'
  | 'shrineofullr'
  | 'shrineofnjord'
  | 'odinstatue'
  | 'lumberjack'
  | 'quarry'
  | 'storagehouse'
  | 'archeryrange'
  | 'dockyard'
  | 'greatstorehouse'
  | 'fishinghut'
  | 'barracks'
  | 'sawmill'
  | 'meadery'
  | 'townsquare'
  | 'cropmill'
  | 'smithy'
  | 'druidhut'
  | 'cartworkshop'
  | 'claybrickworks'
  | 'bogoreworks'
  | 'hammerschmiede'
  | 'palisade'
  | 'palisadegate'
  | 'bridge'
  | 'siegeworkshop';

export interface BuildCategory {
  id: string;
  buildings: { type: BuildableType }[];
}
// Mirrors BuildingCatalogue.cs's per-type AllowedTerrain: Farm/PumpkinFarm/
// Shrine is Grass-only, Lumberjack is Forest-only, Quarry is
// Mountain-only, and Tower/ArcheryRange are SandOrGrass. Offering a building
// the backend's own AllowedTerrain would reject is what "messed up
// categories" on a shore (sand) tile meant — sand used to fall into the same
// flat bucket as forest/mountain and offer Farm/Lumberjack/Quarry, none of
// which the backend would ever accept there.
// FishingHut, Dockyard and ShrineOfNjord aren't land-terrain buildings at all
// (RequiresCoastalWater, on a Sea hex) — WATER_CATEGORY below is the ring
// path to them, offered only on a coastal-water sea tile (see
// categoriesFor), not through this land-terrain table.
const SHRINE_CATEGORY: BuildCategory = {
  id: 'religion',
  buildings: [
    { type: 'shrineofthor' },
    { type: 'shrineoffreyja' },
    { type: 'shrineofullr' },
    { type: 'odinstatue' },
  ],
};
// The Shrine of Njörd (a shrine on a skerry) is built
// directly on a coastal-water hex, exactly like Fishing Hut/Dockyard
// (BuildingDefinition.RequiresCoastalWater) — not on Grass, so they live in
// the water category rather than the grass one below.
const WATER_CATEGORY: BuildCategory = {
  id: 'water',
  buildings: [{ type: 'fishinghut' }, { type: 'dockyard' }, { type: 'shrineofnjord' }],
};
// The wall (docs/design/economy.md section 5): a palisade hex, or a gate on a hex that is a straight, on grass, forest, sand or plain bog moss. A wall
// also ends on a coastal-water hex (BuildingDefinition.AlsoOnCoastalWater), the sea end, which is never a gate. Whether this particular hex
// takes one is the wall rules' (WorldModel.palisadePlacement), shown as a lock on the bubble.
// The bridge (same section) (`bridge`) sits in this category too: it stands on a river hex's own ground, so it is listed on every grass, forest and sand hex and
// filtered back out per hex unless that hex is a straight or bending river (riverBuildingAllowedHere); a river that is not wide shows it
// locked (WorldModel.bridgePlacement).
const DEFENSE_CATEGORY: BuildCategory = {
  id: 'defense',
  buildings: [{ type: 'palisade' }, { type: 'palisadegate' }, { type: 'bridge' }],
};
const DEFENSE_SEA_CATEGORY: BuildCategory = { id: 'defense', buildings: [{ type: 'palisade' }] };
// Bog ground offers what stands on its own bog kind (BuildingDefinition.RequiresBogKind / LakeShoreKinds, mirrored by
// ringCatalogue.ts's buildingAllowedOnHex): plain moss takes the Clay Brickworks and the bog-ore works, a creek the
// Hammer Forge (with the river hammer-mill art for now: TODO(art) bog-creek Hammer Forge) and a lake's half shore the
// Fishing Hut with its lake art. Shores, mouths and springs take nothing.
const BOG_CATEGORIES: Record<string, BuildCategory[]> = {
  bog: [{ id: 'resource', buildings: [{ type: 'claybrickworks' }, { type: 'bogoreworks' }] }, DEFENSE_CATEGORY],
  creek: [{ id: 'resource', buildings: [{ type: 'hammerschmiede' }] }],
  half: [{ id: 'water', buildings: [{ type: 'fishinghut' }] }],
};
const BUILD_CATEGORIES: Record<'grass' | 'sand' | 'forest' | 'mountain', BuildCategory[]> = {
  grass: [
    {
      id: 'resource',
      buildings: [
        { type: 'reindeerherder' },
        { type: 'farm' },
        { type: 'pumpkinfarm' },
        // Sawmill and Crop Mill are only actually buildable on a Grass hex
        // that is itself a river tile of the right shape
        // (BuildingDefinition.RequiresRiverShape) — still listed here (this
        // bucket is terrain-keyed, not hex-specific) but filtered back out
        // per-hex when that isn't the case, rather than offered locked (see
        // ringCategories' riverBuildingAllowedHere filter).
        { type: 'sawmill' },
        { type: 'cropmill' },
        { type: 'meadery' },
      ],
    },
    {
      id: 'military',
      buildings: [
        { type: 'tower' },
        { type: 'archeryrange' },
        { type: 'siegeworkshop' },
        { type: 'barracks' },
        { type: 'smithy' },
      ],
    },
    {
      id: 'logistics',
      buildings: [
        { type: 'storagehouse' },
        { type: 'greatstorehouse' },
        { type: 'townsquare' },
        { type: 'cartworkshop' },
        { type: 'druidhut' },
      ],
    },
    DEFENSE_CATEGORY,
    SHRINE_CATEGORY,
  ],
  sand: [{ id: 'military', buildings: [{ type: 'tower' }, { type: 'smithy' }] }, DEFENSE_CATEGORY],
  forest: [{ id: 'resource', buildings: [{ type: 'lumberjack' }] }, DEFENSE_CATEGORY],
  // No new quarries can be built for now (BuildingCatalogue.NewPlacementDisabled); mountains offer nothing to build.
  mountain: [],
};

export function categoriesFor(tile: Tile): BuildCategory[] {
  if (tile.terrain === 'sea') return tile.isCoastalWater ? [WATER_CATEGORY, DEFENSE_SEA_CATEGORY] : [];
  // A bog lake is water nothing is built on (the lake Fishing Hut stands on its half shore, a bog hex).
  if (tile.terrain === 'lake') return [];
  if (tile.terrain === 'bog') return (tile.bog && BOG_CATEGORIES[tile.bog.kind]) || [];
  return BUILD_CATEGORIES[tile.terrain];
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

  // Standing towers plus still-queued new-tower orders (live mode only — demo
  // mode places instantly), counted by distinct hex like Settlement.PlanBuild
  // does, so a queued tower already uses up its slot.
  function towersHeld(): number {
    const id = world.selectedSettlementId;
    if (!id) return 0;
    const hexes = new Set(world.model.towerCoords(id).map((c) => `${c.q},${c.r}`));
    for (const order of world.hud.queue) {
      if (order.building === 'tower') hexes.add(`${order.q},${order.r}`);
    }
    return hexes.size;
  }

  // Shrines held by the selected settlement (standing plus queued new-shrine
  // orders, by distinct hex): a settlement raises one shrine in total.
  function shrinesHeld(): number {
    const id = world.selectedSettlementId;
    if (!id) return 0;
    const hexes = new Set(world.model.shrineCoords(id).map((c) => `${c.q},${c.r}`));
    for (const order of world.hud.queue) {
      if (SHRINE_BUILDING_TYPES.has(order.building)) hexes.add(`${order.q},${order.r}`);
    }
    return hexes.size;
  }

  // Storage houses held (standing plus queued, distinct hexes like
  // Settlement.PlanBuild counts them) and the best standing level, for the
  // additional-storage-house lock.
  function storageHouseLockFor(): string | undefined {
    const id = world.selectedSettlementId;
    if (!id) return undefined;
    const standing = world.model.storageHouses(id);
    const hexes = new Set(standing.map((h) => `${h.q},${h.r}`));
    for (const order of world.hud.queue) {
      if (order.building === 'storagehouse') hexes.add(`${order.q},${order.r}`);
    }
    return storageHouseLock(hexes.size, standing.map((h) => h.level));
  }

  // Wall orders still in the queue (live mode only; demo places instantly): the server counts them as wall hexes when it judges the next one.
  function queuedWalls(): { q: number; r: number; gate: boolean }[] {
    return world.hud.queue
      .filter((order) => isWallBuilding(order.building))
      .map((order) => ({ q: order.q, r: order.r, gate: order.building === 'palisadegate' }));
  }

  // Odin's Wisdom for the selected settlement: the multiplier on build times shown on the ring cards.
  function wisdomFactor(): number {
    const id = world.selectedSettlementId;
    return id ? world.model.wisdomFactor(id) : 1;
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
    if (DEMO_MODE) {
      const id = world.selectedSettlementId;
      return id ? world.model.highestBuildingLevels(id) : {};
    }
    const levels: Record<string, number> = {};
    for (const b of world.hud.buildings) levels[b.type] = Math.max(levels[b.type] ?? 0, b.level);
    return levels;
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
    definition: { slotCost?: number; occupiesAllSlots?: boolean } | undefined,
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
      type === 'tower' ? towerLimitLock(towersHeld(), world.hud.level) : undefined,
      SHRINE_BUILDING_TYPES.has(type) ? shrineLimitLock(shrinesHeld()) : undefined,
      type === 'storagehouse' ? storageHouseLockFor() : undefined,
      isWallBuilding(type) ? palisadeLock(world.model.palisadePlacement(coord, type === 'palisadegate', queuedWalls())) : undefined,
      type === 'bridge' ? bridgeLock(world.model.bridgePlacement(coord)) : undefined,
      ...prerequisiteLocks(definition?.prerequisites, levels),
    ].filter((lock): lock is string => !!lock);
    return {
      id: type,
      label: buildingName(type),
      level: 1,
      cost,
      // Odin's Wisdom shortens every build in the settlement (`wisdomFactor`).
      time: definition ? formatBuildTime(definition.buildSeconds * wisdomFactor()) : undefined,
      gives: stats.output ? formatOutput(stats.output) : stats.modifier ? formatModifier(stats.modifier) : undefined,
      locks,
      warning: type === 'tower' ? towerCampWarning(coord) : undefined,
      art: buildingArt(type, 1),
      availability: availabilityFor(cost, definition, locks.length > 0),
    };
  }


  /** The raw placement filter for the clicked hex: category ids and building types, before locks or river/soil refinement. */
  const placementCategories = computed<BuildCategory[]>(() => (tile.value ? categoriesFor(tile.value) : []));
  /** Build is offered only on a hex whose terrain takes at least one category (docs/design/ui-guidelines.md, rule 1). */
  const canBuildHere = computed(() => placementCategories.value.length > 0);

  /** The ring's categories for the clicked hex: the placement filter, narrowed by river shape and island soil, each building with its card. */
  const categories = computed<RingCategory[]>(() => {
    const hex = coord.value;
    if (!tile.value || !hex) return [];
    const levels = builtLevels();
    return categoriesFor(tile.value).map((category) => ({
      id: category.id,
      label: t(`hud.ringMenu.categories.${category.id}`),
      color: CATEGORY_COLORS[category.id] ?? 'var(--gold)',
      buildings: category.buildings
        .filter((b) => riverBuildingAllowedHere(b.type, riverShapeAt(hex), riverVariantAt(hex), riverWidthAt(hex)))
        .filter((b) => cropAllowedHere(b.type, currentIslandSoil()))
        .map((b) => ringBuildingFor(b.type, hex, levels)),
    }));
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
    offersBuilding,
    placeBuildingDemo,
    // Shared with the map's Upgrade bubble, which judges the next level against the same locks, stock and slots.
    builtLevels,
    prerequisiteLocks,
    availabilityFor,
    wisdomFactor,
    formatOutput,
    formatModifier,
    tileAt,
  };
}
