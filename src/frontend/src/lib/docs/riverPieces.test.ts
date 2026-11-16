import { describe, expect, it } from 'vitest';
import { riverPieces } from './riverPieces';
import type { AtlasFrameRect } from '../map/atlas';

const frame = {} as AtlasFrameRect;

describe('riverPieces', () => {
  it('lists only the looks the atlas has', () => {
    const have = new Set(['rivertile_SE', 'rivertile_small_bend180_SE', 'rivertile_delta_SE']);
    const pieces = riverPieces((name) => (have.has(name) ? frame : undefined));
    expect(pieces.map((p) => p.id)).toEqual(['straight', 'mouth']);
    const straight = pieces[0]!;
    expect(straight.widths.river?.map((l) => l.id)).toEqual(['plain']);
    expect(straight.widths.stream?.map((l) => l.id)).toEqual(['plain']);
  });

  it('lists every piece when the atlas has everything', () => {
    expect(riverPieces(() => frame).map((p) => p.id)).toHaveLength(9);
  });
});
