// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DispatchSlots from './DispatchSlots.vue';
import MobileDispatchSheet from './MobileDispatchSheet.vue';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import unitSnapshot from '../../data/unit-catalogue.json';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';
function mountSlots(unitCounts) {
    return mount(DispatchSlots, {
        props: { unitCounts },
        global: { plugins: [createTestI18n({ hud: enHud })] },
    });
}
beforeEach(() => {
    setActivePinia(createPinia());
    useUnitCatalogueStore().definitions = unitSnapshot.data;
});
describe('DispatchSlots', () => {
    it('shows nothing for a land army', () => {
        expect(mountSlots({ spearman: 5, ram: 1 }).find('[data-testid=ship-slots]').exists()).toBe(false);
    });
    it('keeps its reserved space whether or not a ship is selected, so the form below never jumps', async () => {
        const wrapper = mountSlots({ spearman: 5 });
        expect(wrapper.find('.dispatch-slots-slot').exists()).toBe(true);
        await wrapper.setProps({ unitCounts: { spearman: 5, karve: 1 } });
        expect(wrapper.find('.dispatch-slots-slot').exists()).toBe(true);
        expect(wrapper.get('[data-testid=ship-slots]').text()).toBe('Troop slots: 5 of 10 used');
    });
    it('shows the slots the troops aboard use out of what the ships offer', () => {
        const wrapper = mountSlots({ karve: 1, longship: 1, axeman: 3, ram: 1 });
        expect(wrapper.get('[data-testid=ship-slots]').text()).toBe('Troop slots: 16 of 30 used');
        expect(wrapper.find('[role=alert]').exists()).toBe(false);
    });
    it('warns once the troops need more room than the ships have', () => {
        const wrapper = mountSlots({ karve: 1, spearman: 11 });
        expect(wrapper.get('[data-testid=ship-slots]').text()).toContain('Troop slots: 11 of 10 used');
        expect(wrapper.get('[role=alert]').text()).toContain('more room than the ships have');
    });
});
describe('a fleet dispatch in the phone sheet', () => {
    function mountSheet() {
        return mount(MobileDispatchSheet, {
            global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
        });
    }
    it('keeps land units selectable once a ship is selected, they ride along', async () => {
        const world = useWorldStore();
        world.hud.garrison = [{ unit: 'karve', count: 2 }, { unit: 'spearman', count: 30 }];
        world.startDispatchAt({ q: 1, r: 1 });
        world.setDispatchUnitCount('karve', 1);
        const wrapper = mountSheet();
        await wrapper.vm.$nextTick();
        const spearmen = wrapper.findAll('.unit-stepper-row').find((row) => row.text().includes('Spearman'));
        expect(spearmen.classes()).not.toContain('is-locked-out');
        expect(spearmen.findAll('button.stepper-btn').every((b) => b.element.disabled === (b.text() === '−'))).toBe(true);
        expect(wrapper.find('.unit-stepper-row.is-locked-out').exists()).toBe(false);
    });
});
