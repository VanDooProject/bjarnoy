import { describe, expect, it } from 'vitest';
import { shouldStartLandingIntro } from './startLandingIntro';

describe('shouldStartLandingIntro', () => {
  it('plays on the landing page of a device without a settlement', () => {
    expect(shouldStartLandingIntro('/', '', null, false)).toBe(true);
  });

  it('is skipped for a device that founded a settlement', () => {
    expect(shouldStartLandingIntro('/', '', 'settlement-1', false)).toBe(false);
  });

  it('#intro plays it for a founded device too', () => {
    expect(shouldStartLandingIntro('/', '#intro', 'settlement-1', false)).toBe(true);
  });

  it('#loop and #loop(...) play it for a founded device too', () => {
    expect(shouldStartLandingIntro('/', '#loop', 'settlement-1', false)).toBe(true);
    expect(shouldStartLandingIntro('/', '#loop(1-2,5)', 'settlement-1', false)).toBe(true);
    expect(shouldStartLandingIntro('/docs', '#loop', null, false)).toBe(false);
  });

  it('#no-intro never plays it', () => {
    expect(shouldStartLandingIntro('/', '#no-intro', null, false)).toBe(false);
  });

  it('only plays on the landing page', () => {
    expect(shouldStartLandingIntro('/docs', '#intro', null, false)).toBe(false);
  });

  it('is skipped for a device with a stored login', () => {
    expect(shouldStartLandingIntro('/', '', null, true)).toBe(false);
  });

  it('plays #intro and #loop also with a stored login, and #no-intro never', () => {
    expect(shouldStartLandingIntro('/', '#intro', null, true)).toBe(true);
    expect(shouldStartLandingIntro('/', '#loop', null, true)).toBe(true);
    expect(shouldStartLandingIntro('/', '#no-intro', null, true)).toBe(false);
  });
});
