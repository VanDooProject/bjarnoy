// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MapLoadingIndicator from './MapLoadingIndicator.vue';
import type { MapLoadState } from '../../lib/map/HexMapRenderer';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
}

function mountIndicator(state: MapLoadState) {
  return mount(MapLoadingIndicator, {
    props: { state },
    global: { plugins: [createTestI18n({ hud: enHud })] },
  });
}

describe('MapLoadingIndicator', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows the centred overlay with the terrain label in the 'terrain' phase", () => {
    stubReducedMotion(false);
    const wrapper = mountIndicator({ phase: 'terrain' });
    expect(wrapper.find('.overlay').exists()).toBe(true);
    expect(wrapper.find('.corner').exists()).toBe(false);
    expect(wrapper.text()).toContain(enHud.mapLoading.terrain);
    expect(wrapper.find('[role="status"]').attributes('aria-live')).toBe('polite');
    wrapper.unmount();
  });

  it("shows a thin progress bar in the 'terrain' phase once progress is known, and none when it isn't", () => {
    stubReducedMotion(false);
    const withProgress = mountIndicator({ phase: 'terrain', progress: 0.4 });
    const fill = withProgress.get('.progress-fill');
    expect(fill.attributes('style')).toContain('width: 40%');
    withProgress.unmount();

    const withoutProgress = mountIndicator({ phase: 'terrain' });
    expect(withoutProgress.find('.progress-track').exists()).toBe(false);
    withoutProgress.unmount();
  });

  it("shows the small corner indicator with the buildings label in the 'buildings' phase, not the centred overlay", () => {
    stubReducedMotion(false);
    const wrapper = mountIndicator({ phase: 'buildings' });
    expect(wrapper.find('.corner').exists()).toBe(true);
    expect(wrapper.find('.overlay').exists()).toBe(false);
    expect(wrapper.text()).toContain(enHud.mapLoading.buildings);
    wrapper.unmount();
  });

  it("renders nothing at all in the 'ready' phase from the start (world mode never shows a loader)", () => {
    stubReducedMotion(false);
    const wrapper = mountIndicator({ phase: 'ready' });
    expect(wrapper.find('.map-loading').exists()).toBe(false);
    wrapper.unmount();
  });

  it('fades out and then unmounts once the phase reaches ready', async () => {
    vi.useFakeTimers();
    stubReducedMotion(false);
    const wrapper = mountIndicator({ phase: 'buildings' });
    expect(wrapper.find('.map-loading').exists()).toBe(true);

    await wrapper.setProps({ state: { phase: 'ready' } });
    // Still mounted, but fading — and still showing the last real phase's
    // content (the corner indicator), not a blank 'ready' template.
    const el = wrapper.get('.map-loading');
    expect(el.classes()).toContain('map-loading--hiding');
    expect(wrapper.find('.corner').exists()).toBe(true);

    vi.advanceTimersByTime(250);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.map-loading').exists()).toBe(false);
    wrapper.unmount();
  });

  it('honours prefers-reduced-motion: no animation classes drive motion, just a static hex + text', () => {
    stubReducedMotion(true);
    const wrapper = mountIndicator({ phase: 'terrain' });
    expect(wrapper.get('.map-loading').classes()).toContain('map-loading--reduced');
    // The label is still shown — only the motion is suppressed.
    expect(wrapper.text()).toContain(enHud.mapLoading.terrain);
    wrapper.unmount();
  });
});
