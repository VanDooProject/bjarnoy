// Axial hex-coordinate math (flat-top orientation), shared by the world map
// and the settlement view so both read as the same lattice at different zoom
// (see docs/design/zip-brainstorms.md and prototypes/village_view/README.md).

export interface AxialCoord {
  q: number;
  r: number;
}

export interface OffsetCoord {
  col: number;
  row: number;
}

export function key(q: number, r: number): string {
  return `${q},${r}`;
}

export function coordKey(c: AxialCoord): string {
  return key(c.q, c.r);
}

export function parseKey(k: string): AxialCoord {
  const [q, r] = k.split(',').map(Number);
  return { q, r };
}

// Odd-q offset <-> axial, matching the legacy renderer's convention.
export function axialToOddQ(c: AxialCoord): OffsetCoord {
  const col = c.q;
  const row = c.r + (c.q - (c.q & 1)) / 2;
  return { col, row };
}

export function oddQToAxial(o: OffsetCoord): AxialCoord {
  const q = o.col;
  const r = o.row - (o.col - (o.col & 1)) / 2;
  return { q, r };
}

const NEIGHBOR_DIRS: AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function neighbors(c: AxialCoord): AxialCoord[] {
  return NEIGHBOR_DIRS.map((d) => ({ q: c.q + d.q, r: c.r + d.r }));
}

export function hexDistance(a: AxialCoord, b: AxialCoord): number {
  const aq = a.q, ar = a.r, as = -a.q - a.r;
  const bq = b.q, br = b.r, bs = -b.q - b.r;
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}

/**
 * Straight-line distance between two hex centres, in hex-spacing units — the
 * round metric, as opposed to `hexDistance`'s step count.
 *
 * The two differ in *shape*, not just precision, and that matters wherever a
 * distance is rendered rather than counted. A `hexDistance` disk is a
 * hexagon: its six axis directions reach ~15% further from the centre than
 * the directions between them (a displacement of d steps is d wide along an
 * axis and 0.866·d between axes). Every contour of a hexDistance field
 * therefore has six corners, which is exactly what a fog ramp built on it
 * shows once it is soft enough to see the shape of — noise can scramble a
 * contour, but not a bias that points the same six ways everywhere.
 *
 * Gameplay reach stays `hexDistance` — how far a thing extends is counted in
 * hexes, and always has been. This is for the fog mask's ramp, where the
 * question is "how far away does this *look*".
 *
 * Never larger than `hexDistance` for the same pair, and never smaller than
 * √3/2 of it, so a hexDistance-based prune around a euclidean query is
 * always safe if it is widened by 2/√3.
 */
export function hexEuclideanDistance(a: AxialCoord, b: AxialCoord): number {
  // Axial -> cartesian at unit centre spacing: adjacent hexes land exactly 1
  // apart, so the result is directly comparable with a hexDistance radius.
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const x = dq + dr / 2;
  const y = dr * (Math.sqrt(3) / 2);
  return Math.sqrt(x * x + y * y);
}

// All hexes within `radius` of `center`, closest ring first — cheap enough to
// call for the small radii settlements use (border growth, fog reveal).
export function hexesInRadius(center: AxialCoord, radius: number): AxialCoord[] {
  const out: AxialCoord[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) {
      out.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return out;
}
