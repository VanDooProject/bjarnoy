import { describe, expect, it } from 'vitest';
import { riverArtFor } from './textures';
import { bendOrientationOf } from './types';
import type { RiverTile } from './types';

// riverArtFor picks which art family (and rotation) a river tile renders
// with. Exercised directly here (rather than through loadTileTextures/
// riverTexturesFor) because Pixi's Assets.load needs a browser `document`
// this repo's node-environment vitest config doesn't provide — see
// riverArtFor's own export comment.
function riverTile(shape: RiverTile['shape'], inDirection: RiverTile['inDirections'][number] | null, outDirection: RiverTile['outDirection']): RiverTile {
  return { q: 0, r: 0, shape, inDirections: inDirection ? [inDirection] : [], outDirection };
}

describe('riverArtFor', () => {
  it('resolves a Bend60 tile to the bend60 family, oriented the same way a Bend tile would be', () => {
    // bend60 reuses bendOrientationOf (the same in/out-pair anchor logic
    // bend itself uses) — see riverArtFor's doc comment for why: it's a
    // directional bend either way, the vendor pack just shipped a distinct
    // art family for its sharper interior angle.
    const result = riverArtFor(riverTile('bend60', 'E', 'NW'), null);

    expect(result.shape).toBe('bend60');
    expect(result.orientation).toBe(bendOrientationOf('E', 'NW'));
  });

  it('does not resolve a Bend60 tile to the plain bend family', () => {
    const result = riverArtFor(riverTile('bend60', 'E', 'NW'), null);

    expect(result.shape).not.toBe('bend');
  });

  it('still resolves an ordinary Bend tile to the bend family, unaffected by bend60 existing', () => {
    const result = riverArtFor(riverTile('bend', 'NW', 'SW'), null);

    expect(result.shape).toBe('bend');
    expect(result.orientation).toBe(bendOrientationOf('NW', 'SW'));
  });
});
