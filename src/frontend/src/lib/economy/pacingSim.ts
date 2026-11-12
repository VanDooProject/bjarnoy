import { FEAST_HOURS, RENOWN_BASE_THRESHOLD, feastCost, feastRenown } from './feasts';
import type { BuildingDefinitionResponse, BuildingPrerequisiteResponse, ResourceLine } from '../../api/types';
import { SETTLERS_PER_FOUNDING } from '../founding';

// Deterministic minute-step pacing model of ONE settlement, generic over
// whatever building catalogue it is handed (live or bundled snapshot). It is
// a design tool, not a mirror of the server: no terrain boosts, no raids, and a
// simple greedy player.

export type Resource = 'wood' | 'stone' | 'food' | 'iron';
export const RESOURCES: readonly Resource[] = ['wood', 'stone', 'food', 'iron'];

/** One daily online window: it starts at `start` ('HH:MM') and lasts `minutes` (may run past midnight). */
export interface Session {
  start: string;
  minutes: number;
}
export type ProfileId = 'active' | 'checkins4' | 'checkins2' | 'always24';

/** BuildingCatalogue.BaseStorageCapacity (ResourceAmounts.Uniform(500)). */
export const BASE_STORAGE_CAPACITY = 500;
/** BuildingCatalogue.FoundingStock: what a new settlement starts with. */
export const FOUNDING_STOCK: ResourceLine = { wood: 700, stone: 700, food: 700, iron: 0 };
/** Fallback for 5 x Settler.trainingCost when the unit catalogue has no settler row. */
export const FALLBACK_SETTLER_COST: ResourceLine = { wood: 600, stone: 450, food: 300, iron: 300 };
export const DEFAULT_PRODUCER_COUNTS: Record<string, number> = { lumberjack: 3, quarry: 3, reindeerherder: 3 };

const check = (start: string): Session => ({ start, minutes: 10 });
/** Daily schedules (design §9). `always24` is a reference line, not a realistic player. */
export const PROFILE_PRESETS: Record<ProfileId, Session[]> = {
  active: [{ start: '07:00', minutes: 960 }],
  checkins4: [check('08:00'), check('12:00'), check('17:00'), check('21:00')],
  checkins2: [check('08:00'), check('20:00')],
  always24: [{ start: '00:00', minutes: 1440 }],
};
export const DEFAULT_JOIN_TIME = '09:00';
export const DEFAULT_PRODUCERS_AHEAD = 3;
export const DEFAULT_RENOWN_THRESHOLD = RENOWN_BASE_THRESHOLD;
export const DEFAULT_RENOWN_PER_LEVEL_HOUR = 1.0;
export { FEAST_HOURS, feastCost, feastRenown };
/** Growth counts as flat when a day adds less than this share of the previous day's production. */
export const GROWTH_FLAT_FRACTION = 0.05;

const LONGHOUSE = 'longhouse';
const TOWN_SQUARE = 'townsquare';
const TOWN_SQUARE_MAX_LEVEL = 10;
const STORAGE = 'storagehouse';
const GREAT_STOREHOUSE = 'greatstorehouse';

export interface PacingParams {
  startStock: ResourceLine;
  horizonDays: number;
  /**
   * Owned producers per building type. Each starts at level 1, except one whose level-1 gate is above Longhouse 1 (the
   * bog-ore works, LH 3): those are not built yet at the start and are placed, one per count, as soon as the Longhouse,
   * their prerequisites, a free slot and the stock allow.
   */
  producerCounts: Record<string, number>;
  settlerCost: ResourceLine;
  /** Settlers count as affordable once this type's level-1 definition is placeable and stock covers settlerCost. */
  settleType: string;
  /** Daily online windows; outside them nothing starts. */
  sessions: Session[];
  /** Time of day ('HH:MM') the player founds the settlement, on day 0. Default 09:00. */
  joinTime?: string;
  /**
   * How many levels producers may run ahead of the Longhouse. 0 keeps them
   * level with it; Infinity limits them by storage alone. Default 3.
   */
  producersAhead?: number;
  /** Renown needed for the second settlement. Default 80 000 (RENOWN_BASE_THRESHOLD). */
  renownThreshold?: number;
  /** Renown per standing building level per hour. Default 1. */
  renownPerLevelHour?: number;
  /** Run Town Square feasts (needs the Town Square's unlock level in the catalogue). */
  feasts?: boolean;
  /** Renown a feast grants at a Town Square level. Default `feastRenown` (feasts.ts). */
  feastGain?: (townSquare: number) => number;
  /**
   * Producers of each type added per tower the Longhouse allows (`BuildingCatalogue.MaxTowers`: from Longhouse 3, then one
   * more every second level). They start at level 0 and are placed when affordable. Unlike the starting set they do not
   * hold the Longhouse back. Default 1.
   */
  producersPerTower?: number;
}

export interface PacingSeries {
  /** Minute of each sample (every 60 min). */
  minute: number[];
  lh: number[];
  rate: Record<Resource, number[]>;
  /** Stock of each resource at each sample: the sim never spends on units, so this is what the settlement has banked (capped by storage). */
  stock: Record<Resource, number[]>;
}

export interface PacingResult {
  /** Minute a Longhouse level finished; level 1 is 0. Levels never reached are absent. */
  lhReachedAt: Record<number, number>;
  /** Minute the second settlement is possible: Cart Workshop placeable, renown reached, settlers affordable. */
  secondSettlementAt: number | null;
  /** First day (>= 3) whose production grew less than 5% over the previous 24 h; null if it never does. */
  growthFlattensAt: number | null;
  /** Minute renown first reached the threshold; null if it never did. */
  renownReachedAt: number | null;
  /** Renown at the end of the horizon. */
  renown: number;
  feastsHeld: number;
  series: PacingSeries;
}

/** Construction slots — mirrors Settlement.ConstructionSlotsFor in the backend: max(2, lh). */
export function constructionSlotsFor(longhouseLevel: number): number {
  return Math.max(2, longhouseLevel);
}

/** Slots a Longhouse upgrade occupies — mirrors Settlement.LonghouseSlotCost: 90 % rounded down, min 1. */
export function longhouseSlotCost(slots: number): number {
  return Math.max(1, Math.floor(slots * 0.9));
}

/** 'HH:MM' -> minutes since midnight. Unparseable input gives 0. */
export function parseClock(text: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return 0;
  return (Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]))) % 1440;
}

/** For each minute of the day, whether any session covers it (sessions may wrap past midnight). */
export function onlineMask(sessions: Session[]): Uint8Array {
  const mask = new Uint8Array(1440);
  for (const s of sessions) {
    const start = parseClock(s.start);
    const len = Math.min(1440, Math.max(0, Math.floor(s.minutes)));
    for (let i = 0; i < len; i++) mask[(start + i) % 1440] = 1;
  }
  return mask;
}

/** Is the player online at this minute of the day? */
export function isOnline(sessions: Session[], minuteOfDay: number): boolean {
  return onlineMask(sessions)[((Math.floor(minuteOfDay) % 1440) + 1440) % 1440] === 1;
}

/** Total production per hour (wood + stone + food) in the series on the given day (0-based, from joining). */
export function productionOnDay(result: PacingResult, day: number): number | null {
  const i = day * 24;
  if (i >= result.series.minute.length) return null;
  return result.series.rate.wood[i] + result.series.rate.stone[i] + result.series.rate.food[i];
}

/** Default settler cost: 5 x the Settler training cost, or the fallback when unavailable. */
export function settlerCostFrom(trainingCost: ResourceLine | null | undefined): ResourceLine {
  if (!trainingCost) return { ...FALLBACK_SETTLER_COST };
  return {
    wood: trainingCost.wood * SETTLERS_PER_FOUNDING,
    stone: trainingCost.stone * SETTLERS_PER_FOUNDING,
    food: trainingCost.food * SETTLERS_PER_FOUNDING,
    iron: trainingCost.iron * SETTLERS_PER_FOUNDING,
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
      occupiesAll: d.occupiesMostSlots,
    };
  }
  return out;
}

interface Job {
  kind: 'lh' | 'storage' | 'producer' | 'civic';
  civicType?: string;
  /** Producer or storage-house instance index (unused for lh). */
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
  const gsDefs = defsOf(GREAT_STOREHOUSE);
  // One entry per Great Storehouse placed; the level it stands at.
  const gsLevels: number[] = [];

  // Owned producers, flat. Only types present in the catalogue with a positive count.
  const pType: string[] = [];
  const pDefs: Compiled[][] = [];
  const pLevel: number[] = [];
  const pBusy: boolean[] = [];
  const pResource: number[] = [];
  /** Whether the producer is one of the starting set (those hold the Longhouse back and are upgraded first). */
  const pStarting: boolean[] = [];
  for (const type of Object.keys(params.producerCounts)) {
    const defs = defsOf(type);
    if (defs.length === 0 || type === LONGHOUSE || type === STORAGE) continue;
    const primary = primaryResource(defs[0].prod);
    for (let i = 0; i < Math.floor(params.producerCounts[type]); i++) {
      pType.push(type);
      pDefs.push(defs);
      pLevel.push(defs[0].reqLh > 1 ? 0 : 1);
      pBusy.push(false);
      pResource.push(primary);
      pStarting.push(true);
    }
  }
  const towerTypes = Object.keys(params.producerCounts).filter((t) => params.producerCounts[t] > 0 && defsOf(t).length > 0 && t !== LONGHOUSE && t !== STORAGE);
  const perTower = Math.max(0, Math.floor(params.producersPerTower ?? 1));
  let towersCounted = 0;
  /** Mirrors BuildingCatalogue.MaxTowers. */
  const maxTowers = (l: number) => (l < 3 ? 0 : 1 + Math.max(0, Math.floor((l - 5) / 2)));
  function addTowerProducers(l: number) {
    const towers = maxTowers(l);
    while (towersCounted < towers) {
      towersCounted++;
      for (const type of towerTypes) {
        const defs = defsOf(type);
        for (let k = 0; k < perTower; k++) {
          pType.push(type); pDefs.push(defs); pLevel.push(0); pBusy.push(false);
          pResource.push(primaryResource(defs[0].prod)); pStarting.push(false);
        }
      }
    }
  }
  const standingBest = new Map<string, number>();
  const mask = onlineMask(params.sessions);
  const joinMinute = parseClock(params.joinTime ?? DEFAULT_JOIN_TIME);
  const ahead = params.producersAhead ?? DEFAULT_PRODUCERS_AHEAD;
  const renownThreshold = params.renownThreshold ?? DEFAULT_RENOWN_THRESHOLD;
  const renownPerLevelHour = params.renownPerLevelHour ?? DEFAULT_RENOWN_PER_LEVEL_HOUR;
  // Feasts need a Town Square; the sim never builds one but assumes it stands, at
  // level min(10, lh - unlock + 1), from the Longhouse level its level 1 unlocks at.
  const tsUnlock = defsOf(TOWN_SQUARE)[0]?.reqLh;
  const feastsOn = !!params.feasts && tsUnlock !== undefined;
  let renown = 0;
  let sumLevels = 0;
  let feastEndsAt = -1;
  let feastGrant = 0;
  let feastsHeld = 0;
  let renownReachedAt: number | null = null;
  const feastGain = params.feastGain ?? feastRenown;

  let lh = lhMax > 0 ? 1 : 0;
  // One entry per owned Storage House: the first stands at level 1 from the start, more are placed when storage runs short.
  const storageLevels: number[] = storageMax > 0 ? [1] : [];
  let storageBusy = false;
  const civicLevels = new Map<string, number>();
  let civicBusy = false;
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
    standingBest.clear();
    sumLevels = lh;
    if (lh > 0) addDef(lhDefs[lh - 1]);
    let storageBest = 0;
    for (const level of storageLevels) {
      if (level > 0) addDef(storageDefs[level - 1]);
      storageBest = Math.max(storageBest, level);
      sumLevels += level;
    }
    for (const g of gsLevels) {
      if (g > 0) addDef(gsDefs[g - 1]);
      sumLevels += g;
    }
    for (const [t, l] of civicLevels) {
      sumLevels += l;
      if (l > 0) standingBest.set(t, l);
    }
    for (let i = 0; i < pLevel.length; i++) {
      if (pLevel[i] === 0) continue; // not built yet
      addDef(pDefs[i][pLevel[i] - 1]);
      sumLevels += pLevel[i];
      if ((standingBest.get(pType[i]) ?? 0) < pLevel[i]) standingBest.set(pType[i], pLevel[i]);
    }
    if (lh > 0) standingBest.set(LONGHOUSE, lh);
    if (storageBest > 0) standingBest.set(STORAGE, storageBest);
    const gsBest = Math.max(0, ...gsLevels);
    if (gsBest > 0) standingBest.set(GREAT_STOREHOUSE, gsBest);
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
  let secondSettlementAt: number | null = null;
  const series: PacingSeries = {
    minute: [],
    lh: [],
    rate: { wood: [], stone: [], food: [], iron: [] },
    stock: { wood: [], stone: [], food: [], iron: [] },
  };

  for (let minute = 0; minute <= horizon; minute++) {
    // 1. complete finished jobs and feasts
    if (feastEndsAt >= 0 && feastEndsAt <= minute) {
      renown += feastGrant;
      feastEndsAt = -1;
    }
    let changed = false;
    for (let j = jobs.length - 1; j >= 0; j--) {
      const job = jobs[j];
      if (job.finishMinute > minute) continue;
      if (job.kind === 'lh') {
        lh++;
        lhBusy = false;
        lhReachedAt[lh] = minute;
        addTowerProducers(lh);
      } else if (job.kind === 'civic') {
        civicLevels.set(job.civicType!, (civicLevels.get(job.civicType!) ?? 0) + 1);
        civicBusy = false;
      } else if (job.kind === 'storage') {
        if (job.index < 0) gsLevels[-job.index - 2]++;
        else storageLevels[job.index]++;
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
    const online = mask[(joinMinute + minute) % 1440] === 1;
    if (online) {
      if (!lhBusy && usedSlots < slots) startOne(minute, slots);
      if (feastsOn && feastEndsAt < 0 && lh >= tsUnlock!) startFeast(minute);
    }

    // 3. second settlement: Cart Workshop placeable, renown reached, settlers affordable
    if (secondSettlementAt === null && renown >= renownThreshold && settleDef && (civicLevels.get(params.settleType) ?? 0) >= 1) {
      if (stock[0] >= sc[0] && stock[1] >= sc[1] && stock[2] >= sc[2] && stock[3] >= sc[3]) secondSettlementAt = minute;
    }

    // 4. sample, then accrue one minute of production
    if (minute % 60 === 0) {
      series.minute.push(minute);
      series.lh.push(lh);
      series.rate.wood.push(rate[0]);
      series.rate.stone.push(rate[1]);
      series.rate.food.push(rate[2]);
      series.rate.iron.push(rate[3]);
      series.stock.wood.push(stock[0]);
      series.stock.stone.push(stock[1]);
      series.stock.food.push(stock[2]);
      series.stock.iron.push(stock[3]);
    }
    for (let r = 0; r < 4; r++) stock[r] = Math.min(capacity[r], stock[r] + rate[r] / 60);
    renown += (sumLevels * renownPerLevelHour) / 60;
    if (renownReachedAt === null && renown >= renownThreshold) renownReachedAt = minute;
  }

  function startFeast(minute: number) {
    const ts = Math.max(1, Math.min(TOWN_SQUARE_MAX_LEVEL, lh - tsUnlock! + 1));
    const cost = feastCost(ts);
    if (stock[0] < cost || stock[1] < cost || stock[2] < cost) return;
    stock[0] -= cost;
    stock[1] -= cost;
    stock[2] -= cost;
    feastEndsAt = minute + FEAST_HOURS * 60;
    feastGrant = feastGain(ts);
    feastsHeld++;
  }

  function startOne(minute: number, slots: number) {
    // (a) Longhouse: wanted once every producer has caught up with it. It
    // can only start with 90 % of the slots free, but while it is wanted the
    // player saves for it — producer upgrades (c) are skipped — otherwise a
    // player who is online every minute keeps spending the stock the
    // Longhouse needs and levels it *later* than one who checks in rarely.
    let lhWanted = false;
    if (lh > 0 && lh < lhMax) {
      const next = lhDefs[lh];
      lhWanted = placeable(next, true);
      for (let i = 0; lhWanted && i < pLevel.length; i++) {
        if (!pStarting[i]) continue;
        if (pLevel[i] >= Math.min(lh + ahead, pDefs[i].length)) continue;
        // A producer that cannot move (next level unplaceable or too big to store) is not waited for.
        const up = pDefs[i][pLevel[i]];
        let blocked = !placeable(up, true);
        for (let r = 0; !blocked && r < 4; r++) if (up.cost[r] > capacity[r]) blocked = true;
        if (!blocked) lhWanted = false;
      }
      const lhSlotCost = longhouseSlotCost(slots);
      if (lhWanted && usedSlots + lhSlotCost <= slots && affordable(next)) {
        spend(next);
        jobs.push({ kind: 'lh', index: 0, finishMinute: minute + Math.ceil(next.buildMinutes), slotCost: lhSlotCost });
        usedSlots += lhSlotCost;
        lhBusy = true;
        return;
      }
    }

    // (a2) the settle building and its prerequisite chain, paid for like any building.
    if (!civicBusy && settleDef) {
      const chain: { type: string; level: number }[] = [...settleDef.prereqs.map((p) => ({ type: p.type, level: p.level })), { type: params.settleType, level: 1 }];
      for (const step of chain) {
        const have = civicLevels.get(step.type) ?? 0;
        if (have >= step.level || (standingBest.get(step.type) ?? 0) >= step.level) continue;
        // A step on a type the player owns as a producer is waited for, not built here.
        if (pType.includes(step.type)) break;
        const d = defsOf(step.type)[have];
        if (d && placeable(d, true) && affordable(d) && usedSlots + d.slotCost <= slots) {
          spend(d);
          jobs.push({ kind: 'civic', civicType: step.type, index: 0, finishMinute: minute + Math.ceil(d.buildMinutes), slotCost: d.slotCost });
          usedSlots += d.slotCost;
          civicBusy = true;
          return;
        }
        break;
      }
    }

    // (b) storage, only when it is needed: the next Longhouse level or some producer's next level (within the
    // producers-ahead limit) costs more than the current capacity of a resource. Candidates: upgrade the lowest Storage
    // House, a new Storage House (only when none can be upgraded), upgrade the lowest Great Storehouse, a new Great
    // Storehouse (the n-th needs n Storage Houses at max level). The best capacity gain per total cost wins.
    if (!storageBusy) {
      let needed = false;
      if (lh > 0 && lh < lhMax) {
        const nextLh = lhDefs[lh];
        for (let r = 0; r < 4; r++) if (nextLh.cost[r] > capacity[r]) needed = true;
      }
      for (let i = 0; !needed && i < pLevel.length; i++) {
        const nd = pDefs[i][pLevel[i]];
        if (!nd || pLevel[i] >= lh + ahead) continue;
        for (let r = 0; r < 4; r++) if (nd.cost[r] > capacity[r]) needed = true;
      }
      if (needed) {
        type Cand = { def: Compiled; gain: number; act: () => number };
        const cands: Cand[] = [];
        let low = -1;
        for (let i = 0; i < storageLevels.length; i++) if (storageLevels[i] < storageMax && (low < 0 || storageLevels[i] < storageLevels[low])) low = i;
        if (low >= 0) {
          const l = storageLevels[low];
          const d = storageDefs[l];
          cands.push({ def: d, gain: d.storage[0] - (l > 0 ? storageDefs[l - 1].storage[0] : 0), act: () => low });
        }
        const canUpgradeSome = storageLevels.some((l) => l < storageMax && placeable(storageDefs[l], true));
        if (storageMax > 0 && !canUpgradeSome) {
          cands.push({ def: storageDefs[0], gain: storageDefs[0].storage[0], act: () => { storageLevels.push(0); return storageLevels.length - 1; } });
        }
        let glow = -1;
        for (let j = 0; j < gsLevels.length; j++) if (gsLevels[j] < gsDefs.length && (glow < 0 || gsLevels[j] < gsLevels[glow])) glow = j;
        if (glow >= 0) {
          const l = gsLevels[glow];
          const d = gsDefs[l];
          cands.push({ def: d, gain: d.storage[0] - (l > 0 ? gsDefs[l - 1].storage[0] : 0), act: () => -(glow + 2) });
        }
        const maxed = storageLevels.filter((l) => l >= storageMax).length;
        if (gsDefs.length > 0 && maxed > gsLevels.length) {
          cands.push({ def: gsDefs[0], gain: gsDefs[0].storage[0], act: () => { gsLevels.push(0); return -(gsLevels.length - 1 + 2); } });
        }
        let best: Cand | null = null;
        let bestScore = -1;
        for (const c of cands) {
          if (!placeable(c.def, true) || !affordable(c.def) || usedSlots + c.def.slotCost > slots) continue;
          const score = c.gain / Math.max(1, c.def.total);
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
        if (best) {
          const index = best.act();
          spend(best.def);
          jobs.push({ kind: 'storage', index, finishMinute: minute + Math.ceil(best.def.buildMinutes), slotCost: best.def.slotCost });
          usedSlots += best.def.slotCost;
          storageBusy = true;
          return;
        }
      }
    }

    // (c) best producer upgrade: lowest scarcity-weighted payback
    let maxPayback = Infinity;
    if (lhWanted) {
      // Saving for the Longhouse: only an upgrade that pays for itself before the Longhouse would be affordable anyway.
      const next = lhDefs[lh];
      let hours = 0;
      for (let r = 0; r < 3; r++) {
        const short = next.cost[r] - stock[r];
        if (short > 0) hours = Math.max(hours, rate[r] > 0 ? short / rate[r] : Infinity);
      }
      maxPayback = hours;
      if (!(maxPayback > 0)) return;
    }
    let best = -1;
    let bestScore = Infinity;
    // The starting set is upgraded first, the tower-added producers only when none of it can move.
    for (const starting of [true, false]) {
    if (best >= 0) break;
    for (let i = 0; i < pLevel.length; i++) {
      if (pBusy[i]) continue;
      if (pStarting[i] !== starting) continue;
      const defs = pDefs[i];
      const level = pLevel[i];
      if (level >= defs.length || level >= lh + ahead) continue;
      const next = defs[level];
      const gain = next.prodTotal - (level > 0 ? defs[level - 1].prodTotal : 0);
      if (gain <= 0 || !placeable(next, true) || !affordable(next) || usedSlots + next.slotCost > slots) continue;
      const weight = 1 + 1 / (1 + rate[pResource[i]] / 50);
      // While saving for the Longhouse only an upgrade that pays for itself before it would be affordable anyway.
      if (next.total / gain > maxPayback) continue;
      const score = next.total / gain / weight;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
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

  let growthFlattensAt: number | null = null;
  const total = (h: number) => series.rate.wood[h] + series.rate.stone[h] + series.rate.food[h];
  for (let day = 3; day * 24 < series.minute.length; day++) {
    const before = total((day - 1) * 24);
    if (total(day * 24) < before * (1 + GROWTH_FLAT_FRACTION)) {
      growthFlattensAt = day;
      break;
    }
  }

  return { lhReachedAt, secondSettlementAt, growthFlattensAt, renownReachedAt, renown, feastsHeld, series };
}

function primaryResource(prod: Float64Array): number {
  let best = 0;
  for (let r = 1; r < 4; r++) if (prod[r] > prod[best]) best = r;
  return best;
}
