import type { BuildingDefinitionResponse, BuildingPrerequisiteResponse, ResourceLine } from '../../api/types';

// Deterministic minute-step pacing model of ONE settlement, generic over
// whatever building catalogue it is handed (live or bundled snapshot). It is
// a design tool, not a mirror of the server: no terrain boosts, no raids, one
// storage house, and a simple greedy player.

export type Resource = 'wood' | 'stone' | 'food' | 'iron';
export const RESOURCES: readonly Resource[] = ['wood', 'stone', 'food', 'iron'];
export type Profile = 'always' | 'casual';

/** BuildingCatalogue.BaseStorageCapacity (ResourceAmounts.Uniform(500)). */
export const BASE_STORAGE_CAPACITY = 500;
/** BuildingCatalogue.FoundingStock: what a new settlement starts with. */
export const FOUNDING_STOCK: ResourceLine = { wood: 300, stone: 300, food: 200, iron: 0 };
/** Fallback for 3 x SettlerCrew.trainingCost when the unit catalogue has no settlercrew row. */
export const FALLBACK_SETTLER_COST: ResourceLine = { wood: 600, stone: 450, food: 300, iron: 300 };
export const DEFAULT_PRODUCER_COUNTS: Record<string, number> = { lumberjack: 3, quarry: 3, farm: 3 };
/** Hours of the day (0-23) the `casual` profile is online, for every minute of that hour. */
export const CASUAL_HOURS: readonly number[] = [7, 12, 18, 19, 20, 21, 22];

const LONGHOUSE = 'longhouse';
const STORAGE = 'storagehouse';
const STORAGE_FULL_FRACTION = 0.85;

export interface PacingParams {
  startStock: ResourceLine;
  horizonDays: number;
  /** Owned producers per building type (each starts at level 1). */
  producerCounts: Record<string, number>;
  settlerCost: ResourceLine;
  /** Settlers count as affordable once this type's level-1 definition is placeable and stock covers settlerCost. */
  settleType: string;
  profile: Profile;
}

export interface PacingSeries {
  /** Minute of each sample (every 60 min). */
  minute: number[];
  lh: number[];
  rate: Record<Resource, number[]>;
}

export interface PacingResult {
  /** Minute a Longhouse level finished; level 1 is 0. Levels never reached are absent. */
  lhReachedAt: Record<number, number>;
  settlersReadyAt: number | null;
  series: PacingSeries;
}

/** Construction slots — mirrors Settlement.ConstructionSlotsFor in the backend: 2 + max(0, (lh - 5) / 5). */
export function constructionSlotsFor(longhouseLevel: number): number {
  return 2 + Math.max(0, Math.floor((longhouseLevel - 5) / 5));
}

export function isOnline(profile: Profile, minute: number): boolean {
  if (profile === 'always') return true;
  return CASUAL_HOURS.includes(Math.floor(minute / 60) % 24);
}

/** Default settler cost: 3 x the SettlerCrew training cost, or the fallback when unavailable. */
export function settlerCostFrom(trainingCost: ResourceLine | null | undefined): ResourceLine {
  if (!trainingCost) return { ...FALLBACK_SETTLER_COST };
  return {
    wood: trainingCost.wood * 3,
    stone: trainingCost.stone * 3,
    food: trainingCost.food * 3,
    iron: trainingCost.iron * 3,
  };
}

interface Compiled {
  cost: Float64Array;
  total: number;
  prod: Float64Array;
  prodTotal: number;
  storage: Float64Array;
  buildMinutes: number;
  reqLh: number;
  prereqs: BuildingPrerequisiteResponse[];
  slotCost: number;
  occupiesAll: boolean;
}

function line(l: ResourceLine): Float64Array {
  return Float64Array.of(l.wood, l.stone, l.food, l.iron);
}

function compile(defs: BuildingDefinitionResponse[] | undefined): Compiled[] {
  if (!defs) return [];
  const out: Compiled[] = [];
  for (const d of [...defs].sort((a, b) => a.level - b.level)) {
    const cost = line(d.cost);
    const prod = line(d.productionPerHour);
    out[d.level - 1] = {
      cost,
      total: cost[0] + cost[1] + cost[2] + cost[3],
      prod,
      prodTotal: prod[0] + prod[1] + prod[2] + prod[3],
      storage: line(d.storageCapacity),
      buildMinutes: d.buildSeconds / 60,
      reqLh: d.requiredLonghouseLevel,
      prereqs: d.prerequisites,
      slotCost: d.slotCost,
      occupiesAll: d.occupiesAllSlots,
    };
  }
  return out;
}

interface Job {
  kind: 'lh' | 'storage' | 'producer';
  /** Producer instance index (unused for lh/storage). */
  index: number;
  finishMinute: number;
  slotCost: number;
}

export function simulatePacing(byType: Record<string, BuildingDefinitionResponse[]>, params: PacingParams): PacingResult {
  const compiled = new Map<string, Compiled[]>();
  const defsOf = (type: string): Compiled[] => {
    let c = compiled.get(type);
    if (!c) compiled.set(type, (c = compile(byType[type])));
    return c;
  };
  const lhDefs = defsOf(LONGHOUSE);
  const storageDefs = defsOf(STORAGE);
  const lhMax = lhDefs.length;
  const storageMax = storageDefs.length;

  // Owned producers, flat. Only types present in the catalogue with a positive count.
  const pType: string[] = [];
  const pDefs: Compiled[][] = [];
  const pLevel: number[] = [];
  const pBusy: boolean[] = [];
  const pResource: number[] = [];
  for (const type of Object.keys(params.producerCounts)) {
    const defs = defsOf(type);
    if (defs.length === 0 || type === LONGHOUSE || type === STORAGE) continue;
    const primary = primaryResource(defs[0].prod);
    for (let i = 0; i < Math.floor(params.producerCounts[type]); i++) {
      pType.push(type);
      pDefs.push(defs);
      pLevel.push(1);
      pBusy.push(false);
      pResource.push(primary);
    }
  }
  const standingBest = new Map<string, number>();

  let lh = lhMax > 0 ? 1 : 0;
  let storageLevel = storageMax > 0 ? 1 : 0;
  let storageBusy = false;
  let lhBusy = false;

  const stock = Float64Array.of(
    params.startStock.wood,
    params.startStock.stone,
    params.startStock.food,
    params.startStock.iron,
  );
  const rate = new Float64Array(4);
  const capacity = new Float64Array(4);

  const jobs: Job[] = [];
  let usedSlots = 0;

  function refresh() {
    rate.fill(0);
    capacity.fill(BASE_STORAGE_CAPACITY);
    if (lh > 0) addDef(lhDefs[lh - 1]);
    if (storageLevel > 0) addDef(storageDefs[storageLevel - 1]);
    standingBest.clear();
    for (let i = 0; i < pLevel.length; i++) {
      addDef(pDefs[i][pLevel[i] - 1]);
      if ((standingBest.get(pType[i]) ?? 0) < pLevel[i]) standingBest.set(pType[i], pLevel[i]);
    }
    if (lh > 0) standingBest.set(LONGHOUSE, lh);
    if (storageLevel > 0) standingBest.set(STORAGE, storageLevel);
  }
  function addDef(d: Compiled) {
    for (let r = 0; r < 4; r++) {
      rate[r] += d.prod[r];
      capacity[r] += d.storage[r];
    }
  }
  refresh();

  /** `strict`: a prerequisite on a type the sim never builds counts as unmet. Lenient: it is assumed built on demand. */
  function placeable(d: Compiled | undefined, strict: boolean): boolean {
    if (!d || d.reqLh > lh) return false;
    for (const p of d.prereqs) {
      const have = standingBest.get(p.type);
      if (have === undefined) {
        if (strict) return false;
        continue;
      }
      if (have < p.level) return false;
    }
    return true;
  }
  function affordable(d: Compiled): boolean {
    return stock[0] >= d.cost[0] && stock[1] >= d.cost[1] && stock[2] >= d.cost[2] && stock[3] >= d.cost[3];
  }
  function spend(d: Compiled) {
    for (let r = 0; r < 4; r++) stock[r] -= d.cost[r];
  }

  const settleDef = defsOf(params.settleType)[0];
  const sc = line(params.settlerCost);

  const horizon = Math.max(0, Math.floor(params.horizonDays * 1440));
  const lhReachedAt: Record<number, number> = {};
  if (lh > 0) lhReachedAt[lh] = 0;
  let settlersReadyAt: number | null = null;
  const series: PacingSeries = {
    minute: [],
    lh: [],
    rate: { wood: [], stone: [], food: [], iron: [] },
  };

  for (let minute = 0; minute <= horizon; minute++) {
    // 1. complete finished jobs
    let changed = false;
    for (let j = jobs.length - 1; j >= 0; j--) {
      const job = jobs[j];
      if (job.finishMinute > minute) continue;
      if (job.kind === 'lh') {
        lh++;
        lhBusy = false;
        lhReachedAt[lh] = minute;
      } else if (job.kind === 'storage') {
        storageLevel++;
        storageBusy = false;
      } else {
        pLevel[job.index]++;
        pBusy[job.index] = false;
      }
      usedSlots -= job.slotCost;
      jobs.splice(j, 1);
      changed = true;
    }
    if (changed) refresh();

    // 2. the player acts: at most one start per minute
    const slots = constructionSlotsFor(lh);
    if (!lhBusy && usedSlots < slots && isOnline(params.profile, minute)) {
      startOne(minute, slots);
    }

    // 3. settlers
    if (settlersReadyAt === null && settleDef && placeable(settleDef, false)) {
      if (stock[0] >= sc[0] && stock[1] >= sc[1] && stock[2] >= sc[2] && stock[3] >= sc[3]) settlersReadyAt = minute;
    }

    // 4. sample, then accrue one minute of production
    if (minute % 60 === 0) {
      series.minute.push(minute);
      series.lh.push(lh);
      series.rate.wood.push(rate[0]);
      series.rate.stone.push(rate[1]);
      series.rate.food.push(rate[2]);
      series.rate.iron.push(rate[3]);
    }
    for (let r = 0; r < 4; r++) stock[r] = Math.min(capacity[r], stock[r] + rate[r] / 60);
  }

  function startOne(minute: number, slots: number) {
    // (a) Longhouse: only when nothing is building and producers keep up.
    if (jobs.length === 0 && lh > 0 && lh < lhMax) {
      const next = lhDefs[lh];
      let keepingUp = true;
      for (let i = 0; i < pLevel.length; i++) {
        if (pLevel[i] < Math.min(lh, pDefs[i].length)) {
          keepingUp = false;
          break;
        }
      }
      if (keepingUp && placeable(next, true) && affordable(next)) {
        spend(next);
        jobs.push({ kind: 'lh', index: 0, finishMinute: minute + Math.ceil(next.buildMinutes), slotCost: slots });
        usedSlots += slots;
        lhBusy = true;
        return;
      }
    }

    // (b) storage house
    if (!storageBusy && storageLevel > 0 && storageLevel < storageMax) {
      let full = false;
      for (let r = 0; r < 4; r++) if (stock[r] > STORAGE_FULL_FRACTION * capacity[r]) full = true;
      if (!full && lh > 0 && lh < lhMax) {
        const nextLh = lhDefs[lh];
        for (let r = 0; r < 4; r++) if (nextLh.cost[r] > capacity[r]) full = true;
      }
      const next = storageDefs[storageLevel];
      if (full && placeable(next, true) && affordable(next) && usedSlots + next.slotCost <= slots) {
        spend(next);
        jobs.push({ kind: 'storage', index: 0, finishMinute: minute + Math.ceil(next.buildMinutes), slotCost: next.slotCost });
        usedSlots += next.slotCost;
        storageBusy = true;
        return;
      }
    }

    // (c) best producer upgrade: lowest scarcity-weighted payback
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < pLevel.length; i++) {
      if (pBusy[i]) continue;
      const defs = pDefs[i];
      const level = pLevel[i];
      if (level >= defs.length) continue;
      const next = defs[level];
      const gain = next.prodTotal - defs[level - 1].prodTotal;
      if (gain <= 0 || !placeable(next, true) || !affordable(next) || usedSlots + next.slotCost > slots) continue;
      const weight = 1 + 1 / (1 + rate[pResource[i]] / 50);
      const score = next.total / gain / weight;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best >= 0) {
      const next = pDefs[best][pLevel[best]];
      spend(next);
      jobs.push({ kind: 'producer', index: best, finishMinute: minute + Math.ceil(next.buildMinutes), slotCost: next.slotCost });
      usedSlots += next.slotCost;
      pBusy[best] = true;
    }
  }

  return { lhReachedAt, settlersReadyAt, series };
}

function primaryResource(prod: Float64Array): number {
  let best = 0;
  for (let r = 1; r < 4; r++) if (prod[r] > prod[best]) best = r;
  return best;
}
