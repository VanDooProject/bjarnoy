// @vitest-environment jsdom
//
// The land movement example: the renderer is a WebGL canvas jsdom cannot draw, so the composable is stubbed with a fake renderer
// that records the army overlay. What matters here is what the component hands the renderer (the real pathfinder's route, drawn as
// the selected army's route) and the step list and total under the map.
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { shallowRef } from 'vue';
import { createI18n } from 'vue-i18n';
import enCommon from '../../i18n/locales/en/common.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';
import enDocs from '../../i18n/locales/en/docs.json';
import { datetimeFormats, numberFormats } from '../../i18n/formats';
import { landExampleRoute } from '../../lib/docs/landMovementExample';

const setArmyOverlay = vi.fn();
vi.mock('../../composables/useHexMapRenderer', () => ({
  useHexMapRenderer: () => ({ renderer: shallowRef({ setArmyOverlay }) }),
}));
vi.mock('../../stores/unitCatalogue', () => ({
  useUnitCatalogueStore: () => ({ byType: { spearman: { speed: 4 } } }),
}));

import LandMovementExample from './LandMovementExample.vue';

describe('LandMovementExample', () => {
  it('draws the pathfinder route as the selected army route and lists each step with its time', () => {
    setActivePinia(createPinia());
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: { en: { common: enCommon, catalogue: enCatalogue, docs: enDocs } },
      datetimeFormats,
      numberFormats,
    });
    const wrapper = mount(LandMovementExample, { global: { plugins: [i18n] } });
    const route = landExampleRoute();

    const overlay = setArmyOverlay.mock.calls[0]![0];
    expect(overlay.route).toEqual(route.path);
    expect(overlay.armies[0]).toMatchObject({ selected: true, isFleet: false, position: route.path[0] });

    const steps = wrapper.findAll('[data-testid="land-example-steps"] li');
    expect(steps).toHaveLength(route.steps.length);
    // Spearman: 4 hexes per hour is 15 minutes on grass; the stream costs 9 times that.
    expect(steps[0]!.text()).toContain('15 min');
    expect(wrapper.text()).toContain('Stream');
    expect(wrapper.text()).toContain('2 h 15 min');
    expect(wrapper.get('[data-testid="land-example-total"]').text()).toContain('4 h 15 min');
    wrapper.unmount();
  });
});
