import { describe, expect, it } from 'vitest';
import { PALISADE_FAMILY, isRefusal } from '../map/palisadeTiles';
import {
  PALISADE_PIECES,
  exampleGroundHexes,
  exampleSeaHexes,
  exampleWallHexes,
  pieceFrameNames,
  resolveExampleWall,
  stagesOf,
} from './palisadeDocs';
import { coordKey } from '../hex/coords';

describe('stagesOf', () => {
  const atlasWith = (frames: string[]) => (name: string) => frames.includes(name);

  it('counts the stages the atlas has, construction site included', () => {
    const has = atlasWith([
      'palisade_straight180_SE_level000',
      'palisade_straight180_SE_level001',
      'palisade_straight180_SE_level002',
    ]);
    expect(stagesOf('straight180', has)).toEqual([0, 1, 2]);
  });

  it('picks up a fourth stage as soon as the atlas ships it', () => {
    const frames = [0, 1, 2, 3].map((n) => `palisade_bend60_SE_level00${n}`);
    expect(stagesOf('bend60', atlasWith(frames))).toEqual([0, 1, 2, 3]);
  });

  it('stops at a gap and is empty for a piece with no art', () => {
    expect(stagesOf('end', atlasWith(['palisade_end_SE_level000', 'palisade_end_SE_level002']))).toEqual([0]);
    expect(stagesOf('end_coast', () => false)).toEqual([]);
  });
});

describe('pieceFrameNames', () => {
  it('draws a land piece on the chosen ground and the sea end on its own water base', () => {
    expect(pieceFrameNames('straight180', 'NE', 1, 'sand')).toMatchObject({
      top: 'palisade_straight180_NE_level001',
      base: 'sandtile_NE_base',
    });
    expect(pieceFrameNames('straight180', 'W', 0, 'bog').base).toBe('bog_W_base');
    expect(pieceFrameNames('end_coast', 'SE', 2, 'grass')).toMatchObject({
      top: 'palisade_end_coast_SE_level002',
      base: 'coastalwatertile_SE_base',
      ownBase: 'palisade_end_coast_SE_level002_base',
    });
  });

  it('knows an atlas family for each of the six pieces', () => {
    expect(PALISADE_PIECES.map((p) => PALISADE_FAMILY[p])).toEqual([
      'palisade_straight180',
      'palisade_bend60',
      'palisade_bend120',
      'palisade_gate180',
      'palisade_end',
      'palisade_end_coast',
    ]);
  });
});

describe('the example wall', () => {
  it('resolves to land end, straight, gate, straight, 120-degree bend, straight, sea end', () => {
    const pieces = resolveExampleWall().map((h) => (isRefusal(h.result) ? h.result.refusal : h.result.piece));
    expect(pieces).toEqual(['end', 'straight180', 'gate180', 'straight180', 'bend120', 'straight180', 'end_coast']);
  });

  it('puts the sea end in the sea and keeps every land wall hex on land', () => {
    const hexes = exampleWallHexes();
    const sea = new Set(exampleSeaHexes(hexes).map(coordKey));
    expect(sea.has(coordKey(hexes.at(-1)!.coord))).toBe(true);
    for (const h of hexes.slice(0, -1)) expect(sea.has(coordKey(h.coord))).toBe(false);
  });

  it('turns each piece onto its neighbours, so the two ends face into the wall', () => {
    const resolved = resolveExampleWall();
    const first = resolved[0]!.result;
    const last = resolved.at(-1)!.result;
    expect(isRefusal(first) || isRefusal(last)).toBe(false);
    if (!isRefusal(first) && !isRefusal(last)) {
      // The ends are different rotations: one wall runs out of each.
      expect(first.dir).not.toBe(last.dir);
      expect(first.edges).toHaveLength(1);
    }
  });

  it('is a connected line of seven distinct hexes with ground that does not overlap it', () => {
    const hexes = exampleWallHexes();
    expect(new Set(hexes.map((h) => coordKey(h.coord))).size).toBe(7);
    const wall = new Set(hexes.map((h) => coordKey(h.coord)));
    const ground = exampleGroundHexes(hexes);
    for (const g of ground) expect(wall.has(coordKey(g.coord))).toBe(false);
    expect(ground.some((g) => g.sea)).toBe(true);
    expect(ground.some((g) => !g.sea)).toBe(true);
  });
});
