// @vitest-environment jsdom
//
// ReportLocationLink.vue: the one link every report card uses for a location. It asks the map to centre on the hex and
// leaves the report: back to the page the modal was opened over when that is the map (or there is none), else to the map.
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import ReportLocationLink from './ReportLocationLink.vue';
import { useMapFocus } from '../../composables/useMapFocus';
import { createTestI18n } from '../../test/i18n';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/settlement', component: { template: '<div />' } },
    { path: '/docs', component: { template: '<div />' } },
    { path: '/reports/:reportId', name: 'report-detail', component: { template: '<div />' } },
  ],
});

function mountLink(props: { coord: { q: number; r: number }; label?: string; pin?: boolean }) {
  return mount(ReportLocationLink, { props, global: { plugins: [createTestI18n(), router] } });
}

describe('ReportLocationLink', () => {
  it('shows the coordinate unless given a label', () => {
    const plain = mountLink({ coord: { q: 3, r: -1 } });
    expect(plain.get('[data-testid="report-location-link"]').text()).toBe('(3, -1)');
    plain.unmount();
    const labelled = mountLink({ coord: { q: 3, r: -1 }, label: 'Hex 3, -1' });
    expect(labelled.get('[data-testid="report-location-link"]').text()).toBe('Hex 3, -1');
    labelled.unmount();
  });

  it('goes back to the map it was opened over and asks it to centre on the hex', async () => {
    const map = useMapFocus();
    map.clear();
    await router.push('/settlement#world&q=1&r=2&z=0.30');
    await router.push({ path: '/reports/r1', state: { backgroundView: '/settlement#world&q=1&r=2&z=0.30' } });
    const wrapper = mountLink({ coord: { q: 12, r: -4 } });

    await wrapper.get('[data-testid="report-location-link"]').trigger('click');
    await flushPromises();

    expect(map.pending.value?.coord).toEqual({ q: 12, r: -4 });
    // Back in history to the page the modal was opened over: the link picks no mode or zoom of its own.
    expect(router.currentRoute.value.fullPath).toBe('/settlement#world&q=1&r=2&z=0.30');
    map.clear();
    wrapper.unmount();
  });

  it('a report opened over a page without a map goes to the map instead of leaving the request waiting', async () => {
    const map = useMapFocus();
    map.clear();
    await router.push('/docs');
    await router.push({ path: '/reports/r1', state: { backgroundView: '/docs' } });
    const wrapper = mountLink({ coord: { q: 12, r: -4 } });

    await wrapper.get('[data-testid="report-location-link"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/settlement');
    expect(map.pending.value?.coord).toEqual({ q: 12, r: -4 });
    map.clear();
    wrapper.unmount();
  });

  it('outside a modal route (the HUD panel on the map) only asks the map to centre and emits navigate', async () => {
    const map = useMapFocus();
    map.clear();
    await router.push('/settlement');
    const wrapper = mountLink({ coord: { q: 5, r: 6 }, pin: true });
    expect(wrapper.find('svg.pin').exists()).toBe(true);

    await wrapper.get('[data-testid="report-location-link"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/settlement');
    expect(map.pending.value?.coord).toEqual({ q: 5, r: 6 });
    expect(wrapper.emitted('navigate')).toHaveLength(1);
    map.clear();
    wrapper.unmount();
  });
});
