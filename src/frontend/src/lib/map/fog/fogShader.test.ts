import { describe, expect, it } from 'vitest';
import { UNKNOWN_TEXEL } from './fogChunks';
import { FOG_FIELD_FRAGMENT } from './fogShader';

function outOfMaskDefault(src: string): number[] {
  const body = /vec4 sampleMask\([^)]*\) \{\s*if \([^)]*\) \{\s*return vec4\(([^)]*)\);/.exec(src);
  if (!body) throw new Error('sampleMask out-of-mask branch not found');
  return body[1].split(',').map((c) => Number(c.trim()));
}

describe('FOG_FIELD_FRAGMENT sampleMask', () => {
  // Ground past the chunk window used to read (1, 0, 0): mist on, dark tier off, while an unfetched chunk inside the
  // window reads UNKNOWN_TEXEL (both on). The dark tier then stopped dead along the window edge.
  it('reads ground outside the mask exactly like an unfetched chunk inside it', () => {
    expect(outOfMaskDefault(FOG_FIELD_FRAGMENT)).toEqual(UNKNOWN_TEXEL.map((c) => c / 255));
  });

  it('turns the dark tier on outside the mask (unknown is always out of sight)', () => {
    const [unknown, outOfSight] = outOfMaskDefault(FOG_FIELD_FRAGMENT);
    expect(unknown).toBe(1);
    expect(outOfSight).toBe(1);
  });
});
