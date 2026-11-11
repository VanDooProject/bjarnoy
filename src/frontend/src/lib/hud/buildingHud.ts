// The building HUD's logic: what a marker over one own building shows. Pure — plain inputs in, a view model out — so the
// Vue layer only renders it. Rules come from the same helpers the ring menu uses (`upgradeRules`, `computeAvailability`,
// `buildingStatsFor`, `maxLevelFor`), see docs on `resolveUpgradeTarget`.
import type { AxialCoord } from '../hex/coords';
import type { BuildingDefinitionResponse, BuildOrderResponse, TrainingOrderResponse, UnitStackResponse } from '../../api/types';
import { DIAL_LABEL_BASE_PX, DIAL_MIN_LABEL_PX } from '../map/constructionDial';
import { buildingStatsFor, maxLevelFor, scaleOutput, type BuildingKind, type BuildingOutput } from '../map/buildingEconomy';
import {
  RING_RESOURCE_KEYS,
  computeAvailability,
  slotsNeeded,
  type RingConstruction,
  type RingResourceKey,
  type RingStock,
} from '../map/ringAvailability';
import { isWallBuilding } from '../map/ringCatalogue';
import { resolveUpgradeTarget, upgradeBlockers } from './upgradeRules';

// ---- zoom tiers -------------------------------------------------------------------------------------------------------

/**
 * far: the dial's ring only (the progress dial would hide its label too); dial: level or time inside, no box yet; mid: the
 * compact box; near: the full box.
 */
export type HudTier = 'near' | 'mid' | 'dial' | 'far';

/** Smallest text of the box at zs = 1, in px; the box shows once this would be `DIAL_MIN_LABEL_PX` on screen. */
export const HUD_BOX_FONT_PX = 11;

/** The marker's tiers are measured on `zs`, the progress dial's own size factor (`dialScale`), so both change at the same zoom. */
export const HUD_TIER = {
  /** Below this zs the dial's label would be under `DIAL_MIN_LABEL_PX` on screen: far, ring only (the progress dial's rule). */
  labelBelow: DIAL_MIN_LABEL_PX / DIAL_LABEL_BASE_PX,
  /** Below this zs the box text would be under `DIAL_MIN_LABEL_PX` on screen: the dial alone. */
  boxBelow: DIAL_MIN_LABEL_PX / HUD_BOX_FONT_PX,
  /** At or above this zs the full box shows. */
  nearAt: 1.3,
  /** A tier is only left once zs is this far past its threshold, so it does not flicker. */
  hysteresis: 0.03,
} as const;

/** The tier at size factor `zs`; `previous` (the marker's current tier) adds the hysteresis. */
export function tierFor(zs: number, previous: HudTier | null = null): HudTier {
  const { labelBelow, boxBelow, nearAt, hysteresis } = HUD_TIER;
  // A threshold the marker is already past stays crossed until zs is `hysteresis` back.
  const atLeast = (threshold: number, held: HudTier[]) => zs >= threshold - (previous !== null && held.includes(previous) ? hysteresis : 0);
  if (!atLeast(labelBelow, ['dial', 'mid', 'near'])) return 'far';
  if (!atLeast(boxBelow, ['mid', 'near'])) return 'dial';
  return atLeast(nearAt, ['near']) ? 'near' : 'mid';
}

// ---- stacking ---------------------------------------------------------------------------------------------------------

/** Markers bottom to top: ascending screen x (right-most on top), the hovered/tapped one last. Stable, input untouched. */
export function stackOrder<T extends { x: number; hovered?: boolean }>(markers: readonly T[]): T[] {
  return [...markers].sort((a, b) => Number(!!a.hovered) - Number(!!b.hovered) || a.x - b.x);
}

// ---- view model -------------------------------------------------------------------------------------------------------

export const TRAINING_SLOTS = 5;

export type HudUpgradeState = 'ready' | 'short' | 'longhouse' | 'prereq' | 'storage' | 'upgrading' | 'queued' | 'max';
export type HudRing = 'ready' | 'blocked' | 'upgrading' | 'max';

/** One thing the upgrade still needs. The view renders it through i18n (building name + level), never as an English string. */
export type HudRequirement = { kind: 'longhouse'; level: number } | { kind: 'building'; type: string; level: number };

export interface BuildingHudViewModel {
  coord: AxialCoord;
  type: string;
  level: number;
  maxLevel: number;
  dial: {
    kind: 'state' | 'upgrading';
    ring: HudRing;
    /** Elapsed fraction 0..1 of a running upgrade (the max ring reads as full). */
    progress?: number;
    secondsLeft?: number;
    targetLevel?: number;
  };
  upgrade: {
    state: HudUpgradeState;
    /** What is missing against the spendable stock (state 'short'). */
    missing?: { resource: RingResourceKey; amount: number }[];
    /** Seconds until production covers every missing resource; null when a missing resource has no income. */
    affordableInSeconds?: number | null;
    /** Longhouse requirement first, then prerequisite buildings (states 'longhouse' and 'prereq'). */
    requirements?: HudRequirement[];
    targetLevel?: number;
    /** Only a maxed Longhouse wears the crown. */
    crown: boolean;
  };
  production?: { resource: RingResourceKey; perHour: number }[];
  /** Capacity per resource of a storage building. */
  storage?: number;
  feast?: { secondsLeft: number; total: number; renownGain: number };
  garrison?: { unit: string; count: number }[];
  training?: {
    slotsUsed: number;
    slotsMax: number;
    current?: { unit: string; count: number; secondsLeft: number; progress: number };
  };
}

export interface BuildingHudInput {
  coord: AxialCoord;
  type: string;
  level: number;
  /** Catalogue entries of this building type (all levels); undefined while the catalogue has none. */
  definitions: readonly BuildingDefinitionResponse[] | undefined;
  /** The settlement's build queue (orders of every hex). */
  queue: readonly BuildOrderResponse[];
  longhouseLevel: number;
  /** Highest standing level per building type. */
  builtLevels: Readonly<Record<string, number | undefined>>;
  /** Spendable stock (`hud.available`). */
  available: RingStock;
  storageCap: RingStock;
  /** Income per hour of the whole settlement. */
  rates: RingStock;
  construction: RingConstruction;
  worldSpeedFactor: number;
  /** For `buildingStatsFor`. */
  matchingNeighbours?: number;
  onLake?: boolean;
  feast?: { secondsLeft: number | null; totalSeconds: number; renownGain: number } | null;
  /** Settlement-wide garrison; only the Longhouse shows it for now. */
  garrison?: readonly UnitStackResponse[];
  /** Training orders of the whole settlement; the ones on this hex are picked here. */
  trainingQueue?: readonly TrainingOrderResponse[];
}

/** Seconds until `rates` cover every `missing` line: the slowest one counts. Null when a missing resource has no income. */
export function affordableInSeconds(
  missing: readonly { resource: RingResourceKey; amount: number }[],
  rates: Readonly<Record<RingResourceKey, number>>,
): number | null {
  let seconds = 0;
  for (const { resource, amount } of missing) {
    const rate = rates[resource];
    if (!(rate > 0)) return null;
    seconds = Math.max(seconds, (amount / rate) * 3600);
  }
  return seconds;
}

function sameHex(o: AxialCoord, c: AxialCoord): boolean {
  return o.q === c.q && o.r === c.r;
}

function productionOf(output: BuildingOutput | undefined, speedFactor: number): BuildingHudViewModel['production'] {
  if (output?.kind !== 'resourceRate') return undefined;
  const scaled = scaleOutput(output, speedFactor);
  return scaled.kind === 'resourceRate' ? [{ resource: scaled.resource, perHour: Math.round(scaled.amount) }] : undefined;
}

export function buildingHudViewModel(input: BuildingHudInput): BuildingHudViewModel {
  const { coord, type, level } = input;
  const maxLevel = maxLevelFor(type as BuildingKind);
  const isLonghouse = type === 'longhouse';
  const crown = false;
  const stats = buildingStatsFor(type as BuildingKind, level, input.matchingNeighbours ?? 0, input.onLake ?? false);

  const vm: BuildingHudViewModel = {
    coord,
    type,
    level,
    maxLevel,
    dial: { kind: 'state', ring: 'ready' },
    upgrade: { state: 'ready', crown },
  };

  const production = productionOf(stats.output, input.worldSpeedFactor);
  if (production) vm.production = production;
  if (stats.output?.kind === 'storageCapacity') vm.storage = Math.round(scaleOutput(stats.output, input.worldSpeedFactor).amount);
  if (type === 'townsquare' && input.feast && input.feast.secondsLeft !== null) {
    vm.feast = { secondsLeft: input.feast.secondsLeft, total: input.feast.totalSeconds, renownGain: input.feast.renownGain };
  }
  if (isLonghouse && input.garrison?.some((g) => g.count > 0)) {
    vm.garrison = input.garrison.filter((g) => g.count > 0).map((g) => ({ unit: g.unit, count: g.count }));
  }

  const orders = (input.trainingQueue ?? []).filter((o) => sameHex(o, coord));
  const trains = stats.modifier?.kind === 'trainsLandTroops' || stats.modifier?.kind === 'trainsShips' || stats.modifier?.kind === 'trainsCivilians';
  if (trains || orders.length > 0) {
    const first = orders[0];
    vm.training = {
      slotsUsed: Math.min(orders.length, TRAINING_SLOTS),
      slotsMax: TRAINING_SLOTS,
      current:
        first && first.completesInSeconds !== null
          ? {
              unit: first.unit,
              count: first.count,
              secondsLeft: first.completesInSeconds,
              progress: first.totalSeconds > 0 ? clamp01(1 - first.completesInSeconds / first.totalSeconds) : 1,
            }
          : undefined,
    };
  }

  // A running upgrade of this building wins over every other state.
  const running = input.queue.find((o) => sameHex(o, coord) && (o.kind ?? 'build') === 'build' && o.state === 'building' && o.targetLevel > level);
  if (running) {
    const left = running.completesInSeconds ?? undefined;
    vm.upgrade = { state: 'upgrading', targetLevel: running.targetLevel, crown };
    vm.dial = {
      kind: 'upgrading',
      ring: 'upgrading',
      targetLevel: running.targetLevel,
      secondsLeft: left,
      progress: left !== undefined && running.totalSeconds > 0 ? clamp01(1 - left / running.totalSeconds) : 0,
    };
    return vm;
  }

  // Max and the crown are about the level the building stands at: an order already waiting for the last level does not make it so.
  const catalogueTop = input.definitions?.length ? Math.max(...input.definitions.map((d) => d.level)) : undefined;
  if (level >= maxLevel || (catalogueTop !== undefined && level >= catalogueTop)) {
    vm.upgrade = { state: 'max', crown: isLonghouse };
    vm.dial = { kind: 'state', ring: 'max', progress: 1 };
    return vm;
  }

  const target = resolveUpgradeTarget(level, input.queue, coord, input.definitions);
  if (target.maxed) {
    // Below the last level, yet the catalogue has nothing after the level an order already waits for: nothing more to queue.
    vm.upgrade = { state: 'queued', targetLevel: target.level, crown };
    vm.dial = { kind: 'state', ring: 'upgrading' };
    return vm;
  }

  const definition = target.definition;
  const blockers = upgradeBlockers(definition, input.longhouseLevel, input.builtLevels);
  const requirements: HudRequirement[] = [
    ...(blockers.longhouse !== undefined ? [{ kind: 'longhouse', level: blockers.longhouse } as const] : []),
    ...blockers.prerequisites.map((p) => ({ kind: 'building', type: p.type, level: p.level }) as const),
  ];
  const cost = definition?.cost;
  const hexBusy = input.queue.some((o) => sameHex(o, coord));
  const availability = computeAvailability({
    cost,
    available: input.available,
    slotsNeeded: slotsNeeded(definition, input.construction.slots),
    construction: input.construction,
    queue: input.queue,
    locked: requirements.length > 0,
    hexBusy,
  });
  const base = { targetLevel: target.nextLevel, crown };

  if (requirements.length > 0) {
    vm.upgrade = { ...base, state: blockers.longhouse !== undefined ? 'longhouse' : 'prereq', requirements };
  } else if (cost && RING_RESOURCE_KEYS.some((key) => (cost[key] ?? 0) > input.storageCap[key])) {
    // The stores cannot hold the next level's price, so waiting would never get there.
    vm.upgrade = { ...base, state: 'storage' };
  } else if (Object.keys(availability.shortfall).length > 0) {
    const missing = RING_RESOURCE_KEYS.filter((key) => availability.shortfall[key] !== undefined).map((key) => ({
      resource: key,
      amount: availability.shortfall[key]!,
    }));
    vm.upgrade = { ...base, state: 'short', missing, affordableInSeconds: affordableInSeconds(missing, input.rates) };
  } else {
    // Affordable but maybe unable to start right now (slots busy, hex waits behind an order): still "ready" — it queues.
    vm.upgrade = { ...base, state: 'ready' };
  }
  vm.dial = { kind: 'state', ring: vm.upgrade.state === 'ready' ? 'ready' : 'blocked' };
  return vm;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// ---- rows -------------------------------------------------------------------------------------------------------------

export type HudRow =
  | {
      kind: 'upgrade';
      state: HudUpgradeState;
      crown: boolean;
      targetLevel?: number;
      /** The listed requirements; the rest is folded into `moreCount`. */
      requirements: HudRequirement[];
      moreCount: number;
      missing?: { resource: RingResourceKey; amount: number }[];
      /** Premium only: time until production covers the missing resources (null: never). */
      affordableInSeconds?: number | null;
      /** Free account short of resources: the dimmed premium marker instead of a time. */
      premiumHint: boolean;
    }
  | { kind: 'production'; production: { resource: RingResourceKey; perHour: number }[] }
  | { kind: 'storage'; capacity: number }
  | { kind: 'feast'; secondsLeft: number; total: number; renownGain: number }
  | { kind: 'garrison'; /** Two per line, two lines. */ entries: { unit: string; count: number }[] }
  | { kind: 'training'; slotsUsed: number; slotsMax: number; current?: NonNullable<BuildingHudViewModel['training']>['current'] }
  /** Mid's second row: the numbers side by side. */
  | {
      kind: 'compact';
      production?: { resource: RingResourceKey; perHour: number }[];
      storage?: number;
      feastSecondsLeft?: number;
      garrisonTotal?: number;
      queue?: { slotsUsed: number; slotsMax: number };
    };

/** How many requirement lines each tier lists before folding the rest into "+n more". */
function listRequirements(all: readonly HudRequirement[], tier: 'near' | 'mid'): { shown: HudRequirement[]; more: number } {
  if (tier === 'near') {
    if (all.length <= 3) return { shown: [...all], more: 0 };
    return { shown: all.slice(0, 2), more: all.length - 2 };
  }
  if (all.length <= 2) return { shown: [...all], more: 0 };
  return { shown: all.slice(0, 1), more: all.length - 1 };
}

function upgradeRow(vm: BuildingHudViewModel, tier: 'near' | 'mid', premium: boolean): HudRow {
  const u = vm.upgrade;
  const { shown, more } = listRequirements(u.requirements ?? [], tier);
  return {
    kind: 'upgrade',
    state: u.state,
    crown: u.crown,
    targetLevel: u.targetLevel,
    requirements: shown,
    moreCount: more,
    missing: u.missing,
    affordableInSeconds: u.state === 'short' && premium ? (u.affordableInSeconds ?? null) : undefined,
    premiumHint: u.state === 'short' && !premium,
  };
}

/** The rows a marker shows at `tier` (none without a box: far and dial). Near takes up to three rows, mid two. */
export function rowsFor(vm: BuildingHudViewModel, tier: HudTier, opts: { premium: boolean }): HudRow[] {
  if (tier === 'far' || tier === 'dial') return [];
  const upgrade = upgradeRow(vm, tier, opts.premium);
  // The Longhouse with a garrison shows the garrison instead of its production.
  const showProduction = !vm.garrison;

  if (tier === 'mid') {
    const compact: HudRow = {
      kind: 'compact',
      production: showProduction ? vm.production : undefined,
      storage: showProduction ? vm.storage : undefined,
      feastSecondsLeft: vm.feast?.secondsLeft,
      garrisonTotal: vm.garrison?.reduce((sum, g) => sum + g.count, 0),
      queue: vm.training ? { slotsUsed: vm.training.slotsUsed, slotsMax: vm.training.slotsMax } : undefined,
    };
    const hasNumbers = compact.production || compact.storage !== undefined || compact.feastSecondsLeft !== undefined || compact.garrisonTotal !== undefined || compact.queue;
    return hasNumbers ? [upgrade, compact] : [upgrade];
  }

  const rows: HudRow[] = [upgrade];
  if (vm.feast) rows.push({ kind: 'feast', ...vm.feast });
  else if (showProduction && vm.production) rows.push({ kind: 'production', production: vm.production });
  else if (showProduction && vm.storage !== undefined) rows.push({ kind: 'storage', capacity: vm.storage });
  if (vm.garrison) rows.push({ kind: 'garrison', entries: vm.garrison.slice(0, 4) });
  if (vm.training) rows.push({ kind: 'training', ...vm.training });
  return rows.slice(0, 3);
}

// ---- hand-over of the upgrade dial ------------------------------------------------------------------------------------

/**
 * Hex keys (`q,r`) whose running upgrade the HUD marker's dial shows: a 'build' order in state 'building' on a hex that has a
 * standing building of level 1 or more and gets a marker (no walls). The canvas progress dial skips these
 * (`skipHudOwnedDials`); a new build (level-0 site), a queued, pending or razing order stays the canvas dial's.
 */
export function hudOwnedUpgradeKeys(
  queue: readonly Pick<BuildOrderResponse, 'q' | 'r' | 'kind' | 'state'>[],
  buildings: readonly { q: number; r: number; type: string; level: number }[],
): Set<string> {
  const standing = new Set<string>();
  for (const b of buildings) if (b.level >= 1 && !isWallBuilding(b.type)) standing.add(`${b.q},${b.r}`);
  const keys = new Set<string>();
  for (const o of queue) {
    const key = `${o.q},${o.r}`;
    if (o.kind === 'build' && o.state === 'building' && standing.has(key)) keys.add(key);
  }
  return keys;
}

// ---- structure of a marker's box ---------------------------------------------------------------------------------------

/**
 * What a box is made of, without the text that ticks: the same string = the same layout, so no resize. A countdown or a
 * resource amount changing is not a change; another row, another state chip, a training order starting is.
 */
export function rowsSignature(tier: HudTier, rows: readonly HudRow[]): string {
  const part = (row: HudRow): string => {
    switch (row.kind) {
      case 'upgrade':
        return `upgrade:${row.state}:${row.crown ? 1 : 0}:${row.requirements.length}:${row.moreCount}:${row.premiumHint ? 1 : 0}`;
      case 'production':
        return `production:${row.production.map((p) => p.resource).join('+')}`;
      case 'storage':
        return 'storage';
      case 'feast':
        return 'feast';
      case 'garrison':
        return `garrison:${row.entries.map((e) => e.unit).join('+')}`;
      case 'training':
        return `training:${row.slotsMax}:${row.current ? row.current.unit : '-'}`;
      case 'compact':
        return `compact:${row.production?.length ?? '-'}:${row.storage !== undefined ? 1 : 0}:${row.feastSecondsLeft !== undefined ? 1 : 0}:${row.garrisonTotal !== undefined ? 1 : 0}:${row.queue ? 1 : 0}`;
    }
  };
  return `${tier}|${rows.map(part).join('|')}`;
}
