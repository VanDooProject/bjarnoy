// Acceptance statistics for the bog generator over several seeds: bogs and lakes per island, lake sizes, through-river
// bogs, sinks and spawns (the owner wants them together under 20% of the bogs), enclosed pockets and the map-rule
// violations (must all be 0).
//   cd src/frontend && npx tsx ../../scripts/worldgen-preview/bog-stats.ts --seeds 1-8 --radius 1000
import { DEFAULT_GENERATION } from '../../src/frontend/src/lib/map/worldGenerator';
import { addViolations, noViolations, totalViolations } from '../../src/frontend/src/lib/map/bogRules';
import { computeRivers } from './rivers';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const [from, to] = opt('seeds', '1-8').split('-').map(Number) as [number, number];
const radius = Number(opt('radius', '1000'));

let islands = 0;
let bigIslands = 0;
let bigWithBog = 0;
let sites = 0;
let sinks = 0;
let spawns = 0;
let pocketsFound = 0;
let pocketsFilled = 0;
let pocketSinks = 0;
let guaranteeThrough = 0;
let guaranteeSpawns = 0;
let guaranteeMissed = 0;
let guaranteeIslands = 0;
let paddingRejected = 0;
let guaranteePaddingRejected = 0;
let holeTiles = 0;
let bogTiles = 0;
let violations = noViolations();
const lakes: number[] = [];
const bogsPerIsland: number[] = [];
const tilesPerBog: number[] = [];
let inlandMouths = 0;

for (let seed = from; seed <= to; seed++) {
  const world = { seed, generation: { ...DEFAULT_GENERATION, worldRadius: radius } };
  const field = computeRivers(world);
  islands += field.islands;
  inlandMouths += field.inlandMouths;
  violations = addViolations(violations, field.bogViolations);
  guaranteeMissed += field.stats.guaranteeMissed;
  guaranteeIslands += field.stats.guaranteeIslands;
  paddingRejected += field.stats.paddingRejected;
  guaranteePaddingRejected += field.stats.guaranteePaddingRejected;
  holeTiles += field.stats.holeTiles;
  bogTiles += field.bogs.size;
  for (const i of field.bogIslands) {
    sites += i.sites;
    sinks += i.sinks;
    spawns += i.spawns;
    pocketsFound += i.pocketsFound;
    pocketsFilled += i.pocketsFilled;
    pocketSinks += i.pocketSinks;
    guaranteeThrough += i.guaranteeThrough;
    guaranteeSpawns += i.guaranteeSpawns;
    lakes.push(...i.lakes);
    bogsPerIsland.push(i.sites + i.pocketsFilled + i.guaranteeThrough + i.guaranteeSpawns);
    tilesPerBog.push(i.tiles);
    if (i.land >= 3000) bigWithBog++;
  }
  console.log(
    `seed ${seed}: ${field.bogIslands.length} islands with bog of ${field.islands}, ` +
      `${field.bogIslands.reduce((a, i) => a + i.sites, 0)} through-river bogs, ${field.bogIslands.reduce((a, i) => a + i.lakes.length, 0)} lakes, violations ${totalViolations(field.bogViolations)}`,
  );
}

const median = (v: number[]) => (v.length === 0 ? 0 : [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!);
console.log(`\nislands ${islands}, with a bog ${bogsPerIsland.length}, of them 3000+ tiles: ${bigWithBog}`);
console.log(`bogs per island with a bog: mean ${(bogsPerIsland.reduce((a, b) => a + b, 0) / Math.max(1, bogsPerIsland.length)).toFixed(2)}, max ${Math.max(0, ...bogsPerIsland)}; bog tiles per island: median ${median(tilesPerBog)}`);
console.log(`lakes ${lakes.length}: tiles min ${Math.min(...lakes)} median ${median(lakes)} max ${Math.max(...lakes)}`);
console.log(`through-river bogs ${sites}, sinks ${sinks} (${((100 * sinks) / Math.max(1, sites)).toFixed(1)}%), spawns ${spawns} (${((100 * spawns) / Math.max(1, sites)).toFixed(1)}%)`);
const allBogs = sites + guaranteeThrough + guaranteeSpawns;
console.log(
  `bog guarantee: acted on ${guaranteeIslands} islands, placed ${guaranteeThrough} through-river and ${guaranteeSpawns} spawn bogs, could not help ${guaranteeMissed}`,
);
console.log(
  `of all ${allBogs} bogs (pockets excluded): sinks ${((100 * sinks) / allBogs).toFixed(1)}%, spawns ${((100 * (spawns + guaranteeSpawns)) / allBogs).toFixed(1)}% ` +
    `(${((100 * spawns) / allBogs).toFixed(1)}% rolled + ${((100 * guaranteeSpawns) / allBogs).toFixed(1)}% guarantee)`,
);
console.log(`bog tiles ${bogTiles}; padding (R12): sites rejected ${paddingRejected} by the normal pass, ${guaranteePaddingRejected} guarantee attempts; ${holeTiles} enclosed grass/forest tiles filled with moss`);
console.log(`pockets found ${pocketsFound}, filled ${pocketsFilled}, rivers sunk into pockets ${pocketSinks}`);
console.log(`inland mouths (rivers): ${inlandMouths}`);
console.log(`RULE VIOLATIONS: ${JSON.stringify(violations)} total ${totalViolations(violations)}`);
void bigIslands;
