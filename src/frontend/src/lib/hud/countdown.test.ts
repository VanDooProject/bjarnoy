import { describe, expect, it } from 'vitest';
import { coarseDuration } from './countdown';

describe('coarseDuration', () => {
  it('is minutes alone under an hour, at least one', () => {
    expect(coarseDuration(0)).toEqual({ hours: 0, minutes: 1 });
    expect(coarseDuration(2520)).toEqual({ hours: 0, minutes: 42 });
  });

  it('is whole hours and the minutes left from an hour on', () => {
    expect(coarseDuration(3900)).toEqual({ hours: 1, minutes: 5 });
    expect(coarseDuration(26 * 3600 + 59)).toEqual({ hours: 26, minutes: 0 });
  });
});
