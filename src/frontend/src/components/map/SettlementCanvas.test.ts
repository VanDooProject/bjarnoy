// @vitest-environment jsdom
//
// SettlementCanvas's loading overlay reads useHexMapRenderer's `ready`/
// `loadError` refs — mocked directly here rather than driving a real
// HexMapRenderer mount (see useHexMapRenderer.test.ts for that), so this
// file only has to check the overlay's own visibility/content rules.
import { ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SettlementCanvas from './SettlementCanvas.vue';
import { createTestI18n } from '../../test/i18n';
import enMap from '../../i18n/locales/en/map.json';

const ready = ref(false);
const loadError = ref<unknown>(null);

vi.mock('../../composables/useHexMapRenderer', () => ({
  useHexMapRenderer: () => ({ renderer: ref(null), ready, loadError }),
}));

function mountCanvas() {
  return mount(SettlementCanvas, {
    props: { worldModel: {} as any, playerId: 'p1' },
    global: { plugins: [createTestI18n({ map: enMap })] },
  });
}

describe('SettlementCanvas loading overlay', () => {
  it('shows a status overlay with the loading text while the renderer is not ready', () => {
    ready.value = false;
    loadError.value = null;

    const wrapper = mountCanvas();
    const overlay = wrapper.get('[data-testid="map-loading"]');
    expect(overlay.attributes('role')).toBe('status');
    expect(overlay.attributes('aria-live')).toBe('polite');
    expect(overlay.text()).toBe('Loading island…');
    expect(overlay.find('button').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides the overlay once the renderer becomes ready', async () => {
    ready.value = false;
    loadError.value = null;
    const wrapper = mountCanvas();
    expect(wrapper.find('[data-testid="map-loading"]').exists()).toBe(true);

    ready.value = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="map-loading"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the failure message and a retry button when loading errors out', () => {
    ready.value = false;
    loadError.value = new Error('boom');

    const wrapper = mountCanvas();
    const overlay = wrapper.get('[data-testid="map-loading"]');
    expect(overlay.text()).toContain("Couldn't load the island art.");
    const button = overlay.get('button');
    expect(button.text()).toBe('Retry');
    wrapper.unmount();
  });
});
