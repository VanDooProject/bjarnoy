// Test support: where to look in a world whose islands are far larger and further apart
// than the few-dozen-hex windows the older tests sample. Nothing in the game imports this.
import { oddQToAxial, hexRing, type AxialCoord } from '../../hex/coords';
import { enumerateIslandShapes, terrainAt, type WorldSeed } from '../worldGenerator';

/**
 * The middle of the widest island's spine, as a hex: a window of a few dozen hexes around it
 * holds coast, sea and inland terrain when the world is small-scale (see `COMPACT_GENERATION`).
 */
export function widestIslandCentre(world: WorldSeed): AxialCoord {
  const shapes = enumerateIslandShapes(world);
  if (shapes.length === 0) throw new Error(`seed ${world.seed} has no islands — pick a different test seed`);
  const widest = shapes.reduce((a, b) => (Math.max(...b.w) > Math.max(...a.w) ? b : a));
  const mid = Math.floor(widest.sx.length / 2);
  return oddQToAxial({
    col: Math.floor(widest.cx + widest.sx[mid] + 0.5),
    row: Math.floor(widest.cy + widest.sy[mid] + 0.5),
  });
}

/** The nearest land hex to `from` (ring by ring, at most `maxRadius` away), or null. */
export function nearestLand(world: WorldSeed, from: AxialCoord, maxRadius = 600): AxialCoord | null {
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (const c of hexRing(from, radius)) if (terrainAt(c.q, c.r, world) !== 'sea') return c;
  }
  return null;
}
