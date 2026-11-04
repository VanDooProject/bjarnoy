import { describe, expect, it } from 'vitest';
import { BEATS } from './registry';

describe('intro story order', () => {
  it('sends the boy before the ravens', () => {
    expect(BEATS.map((b) => b.id)).toEqual(['fire', 'prophecy', 'sending', 'ravens', 'hold', 'landfall']);
  });
});
