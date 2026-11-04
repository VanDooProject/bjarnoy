import { describe, expect, it } from 'vitest';
import { shouldStartLandingIntro } from './startLandingIntro';

describe('shouldStartLandingIntro', () => {
  it('plays on the landing page of a device without a settlement', () => {
    expect(shouldStartLandingIntro('/', '', null)).toBe(true);
  });

  it('is skipped for a device that founded a settlement', () => {
    expect(shouldStartLandingIntro('/', '', 'settlement-1')).toBe(false);
  });

  it('#intro plays it for a founded device too', () => {
    expect(shouldStartLandingIntro('/', '#intro', 'settlement-1')).toBe(true);
  });

  it('#no-intro never plays it', () => {
    expect(shouldStartLandingIntro('/', '#no-intro', null)).toBe(false);
  });

  it('only plays on the landing page', () => {
    expect(shouldStartLandingIntro('/docs', '#intro', null)).toBe(false);
  });
});
