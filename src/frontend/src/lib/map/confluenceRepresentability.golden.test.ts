// The frontend half of the confluence representability table (`src/shared/confluence-representability.json`);
// the backend half is `RiverConfluenceParityTests`.
import { describe, expect, it } from 'vitest';
import fixture from '../../../../shared/confluence-representability.json';
import { confluenceKind, confluenceKindWithWidths } from './types';

describe('confluence representability golden', () => {
  it('has a row for every out and inflow pair', () => {
    expect(fixture.rows).toHaveLength(6 * 15);
  });

  it.each(fixture.rows)('out $out ins $inA,$inB -> $kind', (row) => {
    expect(confluenceKind(row.inA, row.inB, row.out)).toBe(row.kind);
    expect(confluenceKind(row.inB, row.inA, row.out)).toBe(row.kind);
  });

  it('has a row for every out and ordered river/stream inflow pair', () => {
    expect(fixture.riverStreamRows).toHaveLength(6 * 30);
  });

  it.each(fixture.riverStreamRows)('out $out river $riverIn stream $streamIn -> $kind', (row) => {
    expect(confluenceKindWithWidths(row.riverIn, true, row.streamIn, false, row.out)).toBe(row.kind);
    expect(confluenceKindWithWidths(row.streamIn, false, row.riverIn, true, row.out)).toBe(row.kind);
  });
});
