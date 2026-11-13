// Build times (docs/design/economy.md §9). Mirrors `BuildingCatalogue.BuildTime`; the what-if bench reads the same function.
//
// Two curve kinds, in minutes:
//  - early curve (Longhouse, resource producers, Storage House): 1 min at level 1, 8^(1/2) at level 2, 8 min at level 3, then
//    doubling up to the knee level, then a log-like tail (`bend`) up to the top-level time at the max level;
//  - tech curve (everything else): the level-1 time by tech-tree position, then a straight line to the top-level time.

/** 0..1 → 0..1. k > 0 bends it like a log (fast first, flat at the top), k < 0 like an exponential, k = 0 is a straight line. */
export function bend(u: number, k: number): number {
  if (Math.abs(k) < 1e-6) return u;
  return k > 0 ? Math.log(1 + k * u) / Math.log(1 + k) : (Math.exp(-k * u) - 1) / (Math.exp(-k) - 1);
}

export interface BuildTimeKnobs {
  lhKnee: number;
  lhShape: number;
  lhTopHours: number;
  prodKnee: number;
  prodShape: number;
  /** Top-level hours of the Reindeer Herder and the Lumberjack. */
  topHerderLumber: number;
  /** Top-level hours of Clay Brickworks, Quarry, Farm, Pumpkin Farm and Fishing Hut. */
  topProducers: number;
  topBogOre: number;
  shKnee: number;
  shShape: number;
  shTopHours: number;
  /** Shape of the tech curve (0 = straight line). */
  techShape: number;
  /** Top-level hours of the Great Storehouse. */
  gsTopHours: number;
}

export const DEFAULT_BUILD_TIME_KNOBS: BuildTimeKnobs = {
  lhKnee: 6,
  lhShape: 3,
  lhTopHours: 26,
  prodKnee: 6,
  prodShape: 3,
  topHerderLumber: 20,
  topProducers: 22,
  topBogOre: 24,
  shKnee: 6,
  shShape: 3,
  shTopHours: 20,
  techShape: 0,
  gsTopHours: 30,
};

/** Tech curve: [level-1 minutes, top-level hours] per type. */
export const TECH_TIMES: Readonly<Record<string, readonly [number, number]>> = {
  tower: [10, 12],
  barracks: [15, 22],
  townsquare: [20, 22],
  palisade: [10, 1],
  palisadegate: [10, 1],
  bridge: [30, 3],
  harbour: [30, 24],
  shipyard: [60, 24],
  archeryrange: [45, 22],
  cartworkshop: [60, 22],
  meadery: [60, 24],
  druidhut: [90, 24],
  smithy: [120, 24],
  greatstorehouse: [120, 30],
  siegeworkshop: [180, 24],
  sawmill: [240, 24],
  cropmill: [240, 24],
  hammerschmiede: [240, 24],
  shrineofthor: [360, 24],
  shrineoffreyja: [360, 24],
  shrineofullr: [360, 24],
  shrineofnjord: [360, 24],
  odinstatue: [360, 24],
};

interface EarlyCurve {
  knee: number;
  shape: number;
  top: number;
}

const PRODUCERS_22 = ['claybrickworks', 'quarry', 'farm', 'pumpkinfarm', 'fishinghut'];

function earlyCurveFor(type: string, k: BuildTimeKnobs): EarlyCurve | null {
  if (type === 'longhouse') return { knee: k.lhKnee, shape: k.lhShape, top: k.lhTopHours };
  if (type === 'storagehouse') return { knee: k.shKnee, shape: k.shShape, top: k.shTopHours };
  if (type === 'reindeerherder' || type === 'lumberjack') return { knee: k.prodKnee, shape: k.prodShape, top: k.topHerderLumber };
  if (type === 'bogoreworks') return { knee: k.prodKnee, shape: k.prodShape, top: k.topBogOre };
  if (PRODUCERS_22.includes(type)) return { knee: k.prodKnee, shape: k.prodShape, top: k.topProducers };
  return null;
}

/** Build minutes of `type` at `level` (of `max` levels), unrounded. */
export function buildMinutes(type: string, level: number, max: number, k: BuildTimeKnobs = DEFAULT_BUILD_TIME_KNOBS): number {
  // The Beach Camp a sea landing sets up is never built: it stands at once (BuildingCatalogue.BeachCamp).
  if (type === 'beachcamp') return 0;
  const c = earlyCurveFor(type, k);
  let start: number;
  let from: number;
  let top: number;
  let shape: number;
  if (c) {
    if (level <= 3) return 8 ** ((level - 1) / 2);
    if (c.knee > 3 && level <= c.knee) return 8 * 2 ** (level - 3);
    start = c.knee > 3 ? 8 * 2 ** (c.knee - 3) : 8;
    from = c.knee > 3 ? c.knee : 3;
    top = c.top * 60;
    shape = c.shape;
  } else {
    const [t1, topH] = TECH_TIMES[type] ?? [10, 24];
    if (max <= 1) return t1;
    start = t1;
    from = 1;
    top = (type === 'greatstorehouse' ? k.gsTopHours : topH) * 60;
    shape = k.techShape;
  }
  return start + (top - start) * bend((level - from) / (max - from), shape);
}

/** `buildMinutes` in whole seconds, as the catalogue stores it. */
export function buildSecondsOf(type: string, level: number, max: number, k: BuildTimeKnobs = DEFAULT_BUILD_TIME_KNOBS): number {
  return Math.round(buildMinutes(type, level, max, k) * 60);
}

/** The curves the bench charts: label, a representative type and its max level. */
export const BUILD_TIME_CURVE_GROUPS: readonly { label: string; type: string; max: number }[] = [
  { label: 'Longhouse', type: 'longhouse', max: 30 },
  { label: 'Producers (22 h)', type: 'farm', max: 25 },
  { label: 'Herder, Lumberjack (20 h)', type: 'reindeerherder', max: 25 },
  { label: 'Storage House', type: 'storagehouse', max: 25 },
  { label: 'Barracks', type: 'barracks', max: 20 },
  { label: 'Cart Workshop', type: 'cartworkshop', max: 20 },
  { label: 'Mills', type: 'sawmill', max: 20 },
  { label: 'Great Storehouse', type: 'greatstorehouse', max: 10 },
];
