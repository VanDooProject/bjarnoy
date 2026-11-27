import { describe, expect, it } from 'vitest';
import { UNKNOWN_TEXEL } from './fogChunks';
import { FOG_FIELD_FRAGMENT } from './fogShader';

const UNKNOWN = UNKNOWN_TEXEL.map((c) => c / 255);

/** Every all-numeric `vec4(a, b, c, d)` literal in the field shader (return or ternary branch), as numbers. */
function vec4ReturnLiterals(src: string): number[][] {
  return [...src.matchAll(/vec4\(\s*([\d.]+(?:\s*,\s*[\d.]+){3})\s*\)/g)].map((m) => m[1].split(',').map((c) => Number(c.trim())));
}

describe('FOG_FIELD_FRAGMENT unknown ground', () => {
  // Ground past the chunk window used to read (1, 0, 0): mist on, dark tier off, while an unfetched chunk inside the
  // window reads UNKNOWN_TEXEL (both on). The dark tier then stopped dead along the window edge. Every place the shader
  // answers "nothing known here" must therefore be that one literal, and no other vec4 default may creep in.
  it('answers "unknown" with exactly UNKNOWN_TEXEL, everywhere it does so', () => {
    const literals = vec4ReturnLiterals(FOG_FIELD_FRAGMENT);

    expect(literals.length).toBeGreaterThanOrEqual(3);
    for (const literal of literals) expect(literal).toEqual(UNKNOWN);
  });

  it('turns the dark tier on for unknown ground (unknown is always out of sight)', () => {
    const [unknown, outOfSight] = UNKNOWN;
    expect(unknown).toBe(1);
    expect(outOfSight).toBe(1);
  });

  it('has no other vec4 literal standing in for a missing mask', () => {
    const sampling = /vec4 sampleOverview[\s\S]*?void main\(\)/.exec(FOG_FIELD_FRAGMENT);
    expect(sampling).not.toBeNull();
    const literals = [...sampling![0].matchAll(/vec4\(([^)]*)\)/g)].map((m) => m[1].split(',').map((c) => Number(c.trim())));
    for (const literal of literals) expect(literal).toEqual(UNKNOWN);
  });
});
