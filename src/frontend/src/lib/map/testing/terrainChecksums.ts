// The scan behind src/shared/terrain-checksum-golden.json: SHA-256 digests of the
// terrain letters, orientation indices and variant digits of every hex on a coarse
// lattice over the whole default world. Shared by the fixture generator
// (scripts/regen-goldens/terrain-checksum-golden.ts) and the parity test
// (terrainChecksum.golden.test.ts); the backend's TerrainSamplerParityTests and
// TileFeatureTests walk the same lattice in C#. Test support only — nothing in the
// game imports this.
import { hexDistance } from '../../hex/coords';
import { TILE_ORIENTATIONS } from '../types';
import { DEFAULT_GENERATION, orientationAt, terrainAt, variantAt } from '../worldGenerator';

/** Hexes with |q|, |r| <= extent inside the world disc, every `stride`-th q and r, q-major. */
export const CHECKSUM_SCAN = { extent: 1000, stride: 5 } as const;

export interface TerrainChecksums {
  terrain: string;
  orientation: string;
  variant: string;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function terrainChecksums(seed: number): Promise<TerrainChecksums> {
  const world = { seed, generation: DEFAULT_GENERATION };
  const { extent, stride } = CHECKSUM_SCAN;
  const origin = { q: 0, r: 0 };
  const terrain: string[] = [];
  const orientation: string[] = [];
  const variant: string[] = [];
  for (let q = -extent; q <= extent; q += stride) {
    for (let r = -extent; r <= extent; r += stride) {
      if (hexDistance(origin, { q, r }) > DEFAULT_GENERATION.worldRadius) continue;
      const t = terrainAt(q, r, world);
      terrain.push(t[0]);
      orientation.push(String(TILE_ORIENTATIONS.indexOf(orientationAt(q, r, world))));
      // The backend's VariantAt has no coastal-water weighting (sea is always variant 0);
      // the frontend's variantAt does, so compare land only and pin sea to 0.
      variant.push(String(t === 'sea' ? 0 : variantAt(q, r, world)));
    }
  }
  return {
    terrain: await sha256(terrain.join('')),
    orientation: await sha256(orientation.join('')),
    variant: await sha256(variant.join('')),
  };
}
