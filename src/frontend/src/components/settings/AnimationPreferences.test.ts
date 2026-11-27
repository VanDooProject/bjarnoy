// @vitest-environment jsdom
// The live fps readouts under "Building animations" and "Resolution": what the
// governors have measured so far and how far their window has got, plus the
// resolution row itself. The resolution levels come from the screen's pixel
// ratio at module load, so it is set before anything is imported.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
});

import { mount } from '@vue/test-utils';
import AnimationPreferences from './AnimationPreferences.vue';
import { animationPreference } from '../../lib/perf/animationPreference';
import type { GovernorProgress } from '../../lib/perf/fpsGovernor';
import { feedFrame } from '../../lib/perf/frameGovernors';
import { resolutionPreference } from '../../lib/perf/resolutionPreference';
import { createTestI18n } from '../../test/i18n';
import enProfile from '../../i18n/locales/en/profile.json';
import deCommon from '../../i18n/locales/de/common.json';
import deProfile from '../../i18n/locales/de/profile.json';

const originalProgress = Object.getOwnPropertyDescriptor(animationPreference, 'progress')!;
const originalResolutionProgress = Object.getOwnPropertyDescriptor(resolutionPreference, 'progress')!;

function progress(over: Partial<GovernorProgress>): GovernorProgress {
  return { fps: null, window: 'up', goodMs: 0, requiredMs: 10_000, thresholdFps: 30, ...over };
}

function mountPrefs(buildings: GovernorProgress, resolution: GovernorProgress = buildings) {
  Object.defineProperty(animationPreference, 'progress', { get: () => buildings, configurable: true });
  Object.defineProperty(resolutionPreference, 'progress', { get: () => resolution, configurable: true });
  return mount(AnimationPreferences, { global: { plugins: [createTestI18n({ profile: enProfile })] } });
}

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  localStorage.clear();
  resolutionPreference.setting = 'auto';
});

afterEach(() => {
  Object.defineProperty(animationPreference, 'progress', originalProgress);
  Object.defineProperty(resolutionPreference, 'progress', originalResolutionProgress);
  vi.restoreAllMocks();
});

describe('AnimationPreferences fps readout', () => {
  it('says nothing was measured before the first second on the map', () => {
    const wrapper = mountPrefs(progress({}));
    expect(wrapper.get('[data-testid="animation-measure"]').text()).toBe('No measurement yet. It runs while the map is on screen.');
  });

  it('shows the measured fps and the seconds collected toward the up window', () => {
    const wrapper = mountPrefs(progress({ fps: 57.6, goodMs: 4000 }));
    expect(wrapper.get('[data-testid="animation-measure"]').text()).toBe('Measured: 58 fps · 4 of 10 s at 30 fps or more');
  });

  it('shows the retry window with its own threshold', () => {
    const wrapper = mountPrefs(progress({ fps: 70, window: 'retry', goodMs: 12_000, requiredMs: 30_000, thresholdFps: 60 }));
    expect(wrapper.get('[data-testid="animation-measure"]').text()).toBe('Measured: 70 fps · 12 of 30 s at 60 fps or more');
  });

  it('shows the down window', () => {
    const wrapper = mountPrefs(progress({ fps: 20, window: 'down', goodMs: 3000, requiredMs: 5000 }));
    expect(wrapper.get('[data-testid="animation-measure"]').text()).toBe('Measured: 20 fps · 3 of 5 s under 30 fps');
  });

  it('uses the same readout for the resolution row', () => {
    const wrapper = mountPrefs(progress({ fps: 20, window: 'down', goodMs: 3000, requiredMs: 5000 }));
    expect(wrapper.get('[data-testid="resolution-measure"]').text()).toBe('Measured: 20 fps · 3 of 5 s under 30 fps');
  });

  it('shows a paused line on both rows while frames do not count', () => {
    focusedFrames(false);
    const wrapper = mountPrefs(progress({ fps: 70 }));
    expect(wrapper.get('[data-testid="animation-measure"]').text()).toBe('Counting paused: the window is not focused');
    expect(wrapper.get('[data-testid="resolution-measure"]').text()).toBe('Counting paused: the window is not focused');
    focusedFrames(true);
  });
});

/** Pushes one frame through the coordinator with the window focused or not. */
function focusedFrames(focused: boolean) {
  vi.spyOn(document, 'hasFocus').mockReturnValue(focused);
  feedFrame(0, 16);
}

describe('AnimationPreferences resolution row', () => {
  it('offers Auto and the levels of the screen from the highest to the lowest, with a localised number', () => {
    const wrapper = mountPrefs(progress({}));
    const labels = wrapper.findAll('[data-testid="motion-resolution"] button').map((b) => b.text());
    expect(labels).toEqual(['Auto', '2×', '1.5×', '1×']);
  });

  it('formats the levels for the German locale', () => {
    const i18n = createTestI18n({ profile: enProfile });
    i18n.global.setLocaleMessage('de', { common: deCommon, profile: deProfile });
    i18n.global.locale.value = 'de';
    Object.defineProperty(animationPreference, 'progress', { get: () => progress({}), configurable: true });
    const wrapper = mount(AnimationPreferences, { global: { plugins: [i18n] } });
    const labels = wrapper.findAll('[data-testid="motion-resolution"] button').map((b) => b.text());
    expect(labels).toEqual(['Automatisch', '2×', '1,5×', '1×']);
  });

  it('marks Auto, and an explicit choice persists on click', async () => {
    const wrapper = mountPrefs(progress({}));
    const buttons = () => wrapper.findAll('[data-testid="motion-resolution"] button');
    expect(buttons()[0].attributes('aria-pressed')).toBe('true');
    await buttons()[2].trigger('click');
    expect(resolutionPreference.setting).toBe('1.5');
    expect(localStorage.getItem('bjarnoy.resolution')).toBe('1.5');
    expect(buttons()[2].attributes('aria-pressed')).toBe('true');
    expect(buttons()[0].attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[data-testid="resolution-status"]').text()).toBe('1.5× (this device)');
  });

  it('describes Auto while it is measuring', () => {
    const wrapper = mountPrefs(progress({}));
    expect(wrapper.get('[data-testid="resolution-status"]').text()).toBe('Auto — 1×, measuring whether the next step holds');
  });
});
