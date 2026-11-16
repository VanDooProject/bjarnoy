// The frozen-lands docs page lists its looks by atlas frame name. Every one must exist in the vendored frozen pack, so
// an art rename or a dropped tile fails here instead of leaving an empty card on the page.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FROZEN_FAMILIES } from './frozenLands';

const ATLAS_DIR = join(__dirname, '../../../vendor/bg_assets_hextile/atlas');

function showcaseFrames(): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(ATLAS_DIR).filter((f) => /^frozen-showcase-\d+\.json$/.test(f))) {
    const { frames } = JSON.parse(readFileSync(join(ATLAS_DIR, file), 'utf8')) as { frames: Record<string, unknown> | { filename: string }[] };
    for (const n of Array.isArray(frames) ? frames.map((f) => f.filename) : Object.keys(frames)) names.add(n);
  }
  return names;
}

describe('frozen lands page', () => {
  it('only lists frames that exist in the frozen showcase atlas', () => {
    const have = showcaseFrames();
    for (const family of FROZEN_FAMILIES) {
      for (const look of family.looks) expect(have.has(look.frame), `${family.id}: ${look.frame}`).toBe(true);
    }
  });

  it('names every look that is not a plain variant', () => {
    for (const family of FROZEN_FAMILIES) {
      const named = family.looks.filter((l) => l.labelKey).length;
      expect(named === 0 || named === family.looks.length, family.id).toBe(true);
    }
  });
});
