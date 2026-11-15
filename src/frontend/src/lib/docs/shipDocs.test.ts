import { describe, expect, it } from 'vitest';
import { TOWER_DEFENCE_PERCENT_PER_LEVEL } from './shipDocs';

describe('shipDocs', () => {
  it('adds 5% defence per Watchtower level', () => {
    expect(TOWER_DEFENCE_PERCENT_PER_LEVEL).toBe(5);
  });
});
