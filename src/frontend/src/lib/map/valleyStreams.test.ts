// Valley streams (docs/design/river-generation.md, "Valley streams"): a stream out of every mountain-enclosed
// valley of at least VALLEY_MIN_HEXES hexes. These run on a hand-built island - a disc of grass with a ring of
// mountains round a valley - so the valley's size, border and neighbours are exactly what the test says.
import { describe, expect, it } from 'vitest';
import { coordKey, hexDistance, neighbors, type AxialCoord } from '../hex/coords';
import { emptyRiverStats, generateRiversWithBogs, isWideRiverTile, valleyCandidates, VALLEY_MIN_HEXES } from './riverGenerator';
import { TILE_ORIENTATIONS, type RiverTile, type Terrain } from './types';

const ORIGIN: AxialCoord = { q: 0, r: 0 };
const RADIUS = 15;
const VALLEY_RADIUS = 6; // 127 hexes
/** A world seed for which the island's one outer-rim spring leaves the valley alone (checked by the first test). */
const SEED = 6;
/** One where the nearest reachable hex across the ring is a river tile, so the stream joins it. */
const JOINING_SEED = 12;

function disc(radius: number): AxialCoord[] {
  const out: AxialCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) out.push({ q, r });
  }
  return out;
}

interface Island {
  tiles: AxialCoord[];
  terrainOf: (c: AxialCoord) => Terrain;
  valley: Set<string>;
}

/** A disc island: a grass valley of `valleyHexes` hexes (the hexagon of radius 6 trimmed from its rim), three rings of mountain, grass and a sand rim. */
function island(valleyHexes: number): Island {
  const tiles = disc(RADIUS);
  const rim = disc(VALLEY_RADIUS)
    .filter((c) => hexDistance(ORIGIN, c) === VALLEY_RADIUS)
    .sort((a, b) => a.q - b.q || a.r - b.r);
  const trimmed = new Set(rim.slice(0, disc(VALLEY_RADIUS).length - valleyHexes).map((c) => coordKey(c)));
  const valley = new Set(disc(VALLEY_RADIUS).filter((c) => !trimmed.has(coordKey(c))).map((c) => coordKey(c)));
  const terrainOf = (c: AxialCoord): Terrain => {
    const d = hexDistance(ORIGIN, c);
    if (valley.has(coordKey(c))) return 'grass';
    if (d <= VALLEY_RADIUS + 3) return 'mountain';
    return d >= RADIUS - 1 ? 'sand' : 'grass';
  };
  return { tiles, terrainOf, valley };
}

function generate(isle: Island, worldSeed: number, stats = emptyRiverStats()) {
  const { rivers, bogs } = generateRiversWithBogs(
    isle.tiles,
    isle.terrainOf,
    // Depth is only used to pick the first spring (the lowest): inverted, it puts the island's one spring on the ring's outer edge, away from the valley.
    (c) => (RADIUS - hexDistance(ORIGIN, c)) / RADIUS,
    (c) => hexDistance(ORIGIN, c) <= RADIUS,
    worldSeed,
    0,
    false,
    true,
    stats,
  );
  return { rivers, bogs, stats };
}

/** The hexes a land army can reach from the island's rim: land that is not mountain, plus every river tile that is not wide. */
function reachableFromCoast(isle: Island, rivers: RiverTile[]): Set<string> {
  const riverAt = new Map(rivers.map((t) => [coordKey(t), t]));
  const walkable = (c: AxialCoord): boolean => {
    const t = riverAt.get(coordKey(c));
    if (t) return !isWideRiverTile(t, (x) => riverAt.get(coordKey(x)));
    return isle.terrainOf(c) !== 'mountain';
  };
  const start = { q: RADIUS - 3, r: 0 };
  const seen = new Set([coordKey(start)]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const n of neighbors(queue[i]!)) {
      if (hexDistance(ORIGIN, n) <= RADIUS && !seen.has(coordKey(n)) && walkable(n)) {
        seen.add(coordKey(n));
        queue.push(n);
      }
    }
  }
  return seen;
}

describe('valley streams', () => {
  it('lets a stream out of a 100+ hex valley ringed by mountains, ending in the sea', () => {
    const isle = island(127);
    expect(isle.valley.size).toBeGreaterThanOrEqual(VALLEY_MIN_HEXES);
    const { rivers, stats } = generate(isle, SEED);

    expect(stats.valleyCandidates).toBe(1);
    expect(stats.valleyStreams).toBe(1);
    expect([...isle.valley].every((k) => reachableFromCoast(isle, rivers).has(k))).toBe(true);

    // Exactly one spring in the valley; following its water leads over mountains and ends at a mouth on the coast.
    const springs = rivers.filter((t) => t.shape === 'spring' && isle.valley.has(coordKey(t)));
    expect(springs).toHaveLength(1);
    const byKey = new Map(rivers.map((t) => [coordKey(t), t]));
    let cur = springs[0]!;
    let overMountain = 0;
    for (let guard = 0; cur.outDirection && guard < 1000; guard++) {
      if (isle.terrainOf(cur) === 'mountain') overMountain++;
      cur = byKey.get(coordKey(neighbors(cur)[TILE_ORIENTATIONS.indexOf(cur.outDirection)]!))!;
    }
    expect(overMountain).toBeGreaterThanOrEqual(1);
    expect(cur.shape).toBe('mouth');
    expect(neighbors(cur).some((n) => hexDistance(ORIGIN, n) > RADIUS)).toBe(true);
  });

  it('joins the river it meets on the far side of the mountains', () => {
    const isle = island(127);
    const { rivers, stats } = generate(isle, JOINING_SEED);

    expect(stats.valleyStreams).toBe(1);
    expect(stats.valleyStreamsIntoRivers).toBe(1);
    expect([...isle.valley].every((k) => reachableFromCoast(isle, rivers).has(k))).toBe(true);
    expect(rivers.filter((t) => t.shape === 'spring' && isle.valley.has(coordKey(t)))).toHaveLength(1);
    expect(rivers.some((t) => t.shape === 'confluence')).toBe(true);
  });

  it('leaves a 99 hex valley alone', () => {
    const isle = island(99);
    expect(isle.valley.size).toBe(99);
    const { rivers, stats } = generate(isle, SEED);

    expect(stats.valleyCandidates).toBe(0);
    expect(stats.valleyStreams).toBe(0);
    expect(rivers.some((t) => isle.valley.has(coordKey(t)))).toBe(false);
    expect(reachableFromCoast(isle, rivers).has(coordKey(ORIGIN))).toBe(false);
  });

  it('does not count a valley with a wide river on its border', () => {
    const isle = island(127);
    const none = valleyCandidates(isle.tiles, isle.terrainOf, [], []);
    expect(none).toHaveLength(1);
    expect(none[0]!.size).toBe(127);

    // A river-width tile in the mountain ring beside the valley is a wall of its own, not a mountain.
    const at = { q: VALLEY_RADIUS + 1, r: 0 };
    const tile = (width: RiverTile['width']): RiverTile => ({
      ...at,
      shape: 'straight',
      inDirections: ['W'],
      outDirection: 'E',
      width,
      wasted: false,
    });
    expect(valleyCandidates(isle.tiles, isle.terrainOf, [tile('river')], [])).toEqual([]);
    // A stream there is walkable and joins the valley instead: still enclosed by mountains.
    expect(valleyCandidates(isle.tiles, isle.terrainOf, [tile('stream')], [])).toHaveLength(1);
  });

  it('is deterministic: the same seed gives the same rivers twice', () => {
    const a = generate(island(127), SEED);
    const b = generate(island(127), SEED);
    expect(b.rivers).toEqual(a.rivers);
    expect(b.stats).toEqual(a.stats);
    expect(a.stats.valleyStreams).toBe(1);
  });
});
