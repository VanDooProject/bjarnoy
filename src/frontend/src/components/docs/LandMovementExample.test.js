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
const setHighlight = vi.fn();
let rendererOptions = {};
vi.mock('../../composables/useHexMapRenderer', () => ({
    useHexMapRenderer: (_canvas, _container, options) => {
        rendererOptions = options;
        return { renderer: shallowRef({ setArmyOverlay, setHighlight }) };
    },
}));
vi.mock('../../stores/unitCatalogue', () => ({
    useUnitCatalogueStore: () => ({ byType: { spearman: { speed: 4 } } }),
}));
import LandMovementExample from './LandMovementExample.vue';
function mountExample() {
    setActivePinia(createPinia());
    const i18n = createI18n({
        legacy: false,
        locale: 'en',
        messages: { en: { common: enCommon, catalogue: enCatalogue, docs: enDocs } },
        datetimeFormats,
        numberFormats,
    });
    return mount(LandMovementExample, { global: { plugins: [i18n] } });
}
describe('LandMovementExample', () => {
    it('draws the pathfinder route as the selected army route and lists each hex with the time spent on it', () => {
        const wrapper = mountExample();
        const route = landExampleRoute();
        const overlay = setArmyOverlay.mock.calls[0][0];
        expect(overlay.route).toEqual(route.path);
        expect(overlay.armies[0]).toMatchObject({ selected: true, isFleet: false, position: route.path[0] });
        const steps = wrapper.findAll('[data-testid="land-example-steps"] tbody tr');
        expect(steps).toHaveLength(route.hexes.length);
        // Spearman: 4 hexes per hour is 15 minutes on grass. Time on a hex: half its price on the first and the last hex of the route, the
        // full price between: 7.5 min on the start, 1.3 times 15 min in the forest, 9 times 15 min on the stream.
        expect(steps[0].text()).toContain('Settlement');
        expect(steps[0].text()).toContain('7.5 min');
        expect(steps[1].text()).toContain('Forest');
        expect(steps[1].text()).toContain('19.5 min');
        expect(steps[3].text()).toContain('Stream');
        expect(steps[3].text()).toContain('2 h 15 min');
        expect(wrapper.text()).toContain('Stream');
        expect(wrapper.get('[data-testid="land-example-total"]').text()).toContain('5 h 6 min');
        wrapper.unmount();
    });
    it('highlights the hex of a hovered table row and clears it when the pointer leaves the table', async () => {
        setHighlight.mockClear();
        const wrapper = mountExample();
        const route = landExampleRoute();
        const rows = wrapper.findAll('[data-testid="land-example-steps"] tbody tr');
        await rows[2].trigger('mouseenter');
        expect(setHighlight).toHaveBeenLastCalledWith(route.hexes[2].coord);
        expect(rows[2].classes()).toContain('active');
        expect(wrapper.get('[data-testid="land-example-caption"]').text()).toBe(rows[2].findAll('td')[1].text());
        await wrapper.get('[data-testid="land-example-steps"] tbody').trigger('mouseleave');
        expect(setHighlight).toHaveBeenLastCalledWith(undefined);
        expect(rows[2].classes()).not.toContain('active');
        wrapper.unmount();
    });
    it('marks the table row of the hex hovered on the map', async () => {
        const wrapper = mountExample();
        const route = landExampleRoute();
        rendererOptions.onHoverChange({ coord: route.hexes[4].coord });
        await wrapper.vm.$nextTick();
        const rows = wrapper.findAll('[data-testid="land-example-steps"] tbody tr');
        expect(rows.map((r) => r.classes().includes('active'))).toEqual(rows.map((_, i) => i === 4));
        wrapper.unmount();
    });
    it('keeps a tapped row highlighted until it is tapped again', async () => {
        setHighlight.mockClear();
        const wrapper = mountExample();
        const route = landExampleRoute();
        const rows = wrapper.findAll('[data-testid="land-example-steps"] tbody tr');
        await rows[1].trigger('mouseenter');
        await rows[1].trigger('click');
        await wrapper.get('[data-testid="land-example-steps"] tbody').trigger('mouseleave');
        expect(rows[1].classes()).toContain('active');
        expect(setHighlight).toHaveBeenLastCalledWith(route.hexes[1].coord);
        await rows[1].trigger('click');
        expect(rows[1].classes()).not.toContain('active');
        expect(setHighlight).toHaveBeenLastCalledWith(undefined);
        wrapper.unmount();
    });
    it('goes back to the tapped row when the pointer passes over another row and leaves the table', async () => {
        setHighlight.mockClear();
        const wrapper = mountExample();
        const route = landExampleRoute();
        const rows = wrapper.findAll('[data-testid="land-example-steps"] tbody tr');
        await rows[1].trigger('click');
        await rows[3].trigger('mouseenter');
        expect(rows[3].classes()).toContain('active');
        await wrapper.get('[data-testid="land-example-steps"] tbody').trigger('mouseleave');
        expect(rows[3].classes()).not.toContain('active');
        expect(rows[1].classes()).toContain('active');
        expect(setHighlight).toHaveBeenLastCalledWith(route.hexes[1].coord);
        wrapper.unmount();
    });
});
