import { describe, expect, it } from 'vitest';
import { foundingLock, SETTLERS_PER_FOUNDING } from './founding';

const renown = (canFoundAnother: boolean) => ({ total: 120.7, requiredForNextSettlement: 300.2, canFoundAnother });

describe('foundingLock', () => {
  it('is free when five settlers are home and renown allows another settlement', () => {
    expect(foundingLock(SETTLERS_PER_FOUNDING, renown(true))).toBeNull();
    expect(foundingLock(12, renown(true))).toBeNull();
  });

  it('locks on settlers first, even when renown is also missing or unknown', () => {
    expect(foundingLock(4, renown(true))).toEqual({ reason: 'settlers', have: 4, need: 5 });
    expect(foundingLock(0, renown(false))).toEqual({ reason: 'settlers', have: 0, need: 5 });
    expect(foundingLock(2, null)).toEqual({ reason: 'settlers', have: 2, need: 5 });
  });

  it('locks on renown with the totals when the server says no more settlements', () => {
    expect(foundingLock(5, renown(false))).toEqual({ reason: 'renown', total: 120.7, required: 300.2 });
  });

  it('reports unknown renown while it has not loaded', () => {
    expect(foundingLock(5, null)).toEqual({ reason: 'renownUnknown' });
  });
});
