// The frontend half of the confluence representability table (`src/shared/confluence-representability.json`);
// the backend half is `RiverConfluenceParityTests`.
import { describe, expect, it } from 'vitest';
import fixture from '../../../../shared/confluence-representability.json';
import { confluenceKind } from './types';

describe('confluence representability golden', () => {
  it('has a row for every out and inflow pair', () => {
    expect(fixture.rows).toHaveLength(6 * 15);
  });

  it.each(fixture.rows)('out $out ins $inA,$inB -> $kind', (row) => {
    expect(confluenceKind(row.inA, row.inB, row.out)).toBe(row.kind);
    expect(confluenceKind(row.inB, row.inA, row.out)).toBe(row.kind);
  });
});
