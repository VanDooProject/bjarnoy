// @vitest-environment jsdom
// The live fps readout under "Building animations": what the 'auto'
// governor has measured so far and how far its enable window has got.
import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AnimationPreferences from './AnimationPreferences.vue';
import { animationPreference, type GovernorProgress } from '../../lib/perf/animationPreference';
import { createTestI18n } from '../../test/i18n';
import enProfile from '../../i18n/locales/en/profile.json';

const originalProgress = Object.getOwnPropertyDescriptor(animationPreference, 'progress')!;

function mountWithProgress(progress: GovernorProgress) {
  Object.defineProperty(animationPreference, 'progress', { get: () => progress, configurable: true });
  return mount(AnimationPreferences, { global: { plugins: [createTestI18n({ profile: enProfile })] } });
}

afterEach(() => {
  Object.defineProperty(animationPreference, 'progress', originalProgress);
});

describe('AnimationPreferences fps readout', () => {
  it('says nothing was measured before the first second on the map', () => {
    const wrapper = mountWithProgress({ fps: null, goodMs: 0, requiredMs: 10_000, thresholdFps: 50 });
    expect(wrapper.get('[data-testid="animation-measure"]').text()).toBe('No measurement yet. It runs while the map is on screen.');
  });

  it('shows the measured fps and the seconds collected toward the enable window', () => {
    const wrapper = mountWithProgress({ fps: 57.6, goodMs: 4000, requiredMs: 10_000, thresholdFps: 50 });
    expect(wrapper.get('[data-testid="animation-measure"]').text()).toBe('Measured: 58 fps · 4 of 10 s at 50 fps or more');
  });
});
