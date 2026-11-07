// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RING_DESKTOP_SCALE, RING_SIZE_FACTOR, ringMaxScale } from './ringSize';

describe('ringMaxScale', () => {
  it('is the desktop base size by default, so bubble labels reach a normal reading size', () => {
    // Smallest bubble label is 8.2px at scale 1 (RingMenu.vue's --label-px).
    expect(ringMaxScale(false, 'normal')).toBe(RING_DESKTOP_SCALE);
    expect(8.2 * ringMaxScale(false, 'normal')).toBeGreaterThanOrEqual(11);
  });

  it('keeps phones at the designed size and lets the setting scale either base', () => {
    expect(ringMaxScale(true, 'normal')).toBe(1);
    expect(ringMaxScale(false, 'large')).toBeCloseTo(RING_DESKTOP_SCALE * RING_SIZE_FACTOR.large);
    expect(ringMaxScale(false, 'small')).toBeLessThan(ringMaxScale(false, 'normal'));
    expect(ringMaxScale(true, 'xlarge')).toBe(RING_SIZE_FACTOR.xlarge);
  });
});

describe('ringSizePreference', () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('defaults to normal, and ignores an unknown stored value', async () => {
    localStorage.setItem('bjarnoy.ringSize', 'huge');
    const { ringSizePreference } = await import('./ringSize');
    expect(ringSizePreference.setting).toBe('normal');
  });

  it('reads a stored size at load and persists a change', async () => {
    localStorage.setItem('bjarnoy.ringSize', 'small');
    const { ringSizePreference } = await import('./ringSize');
    expect(ringSizePreference.setting).toBe('small');
    ringSizePreference.setting = 'xlarge';
    expect(localStorage.getItem('bjarnoy.ringSize')).toBe('xlarge');
  });
});
