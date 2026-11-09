// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SendArmyPicker from './SendArmyPicker.vue';
import { useWorldStore } from '../../stores/world';
import { useAuthStore } from '../../stores/auth';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import unitSnapshot from '../../data/unit-catalogue.json';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';
vi.mock('../../config', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, DEMO_MODE: false };
});
// The pathfinder is the map's own and has its suites; here every hex is plain ground, a route costs its hex distance.
vi.mock('../../lib/map/hexPath', () => ({
    findPath: (from, to) => [from, to],
    findSeaPath: (from, to) => [from, to],
    pathCost: (path) => Math.abs(path[1].q - path[0].q) + Math.abs(path[1].r - path[0].r),
}));
vi.mock('../../lib/map/movementContext', () => ({ gamePathContext: () => ({}) }));
function army(id, overrides = {}, arrivesAt = '2020-01-01T05:00:00Z') {
    return {
        id,
        settlementId: 'home-1',
        mission: 'move',
        targetSettlementId: null,
        atHome: false,
        supporting: false,
        position: { q: 10, r: 0 },
        provisions: 5000,
        totalSpeed: 2,
        totalUpkeepPerHour: 10,
        stacks: [{ unit: 'spearman', count: 10 }],
        movement: {
            departedAt: '2020-01-01T00:00:00Z',
            path: [
                { q: 0, r: 0 },
                { q: 10, r: 0 },
            ],
            cumulativeHours: [0, 5],
            edgeHours: [0, 2.5],
            arrivesAt,
            returnPath: [],
            returnCumulativeHours: [],
            returnEdgeHours: [],
            turnAroundAt: '2099-01-01T00:00:00Z',
            returnArrivesAt: '2099-01-02T00:00:00Z',
            isReturning: false,
        },
        ...overrides,
    };
}
const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString();
function mountPicker() {
    return mount(SendArmyPicker, { global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] } });
}
function setup(armies, garrison = [{ unit: 'spearman', count: 8 }], premium = false) {
    const world = useWorldStore();
    useUnitCatalogueStore().definitions = unitSnapshot.data;
    const auth = useAuthStore();
    auth.user = { id: 'u1', userName: 'ragnar', role: 'player', status: 'active', displayName: null, isPremium: premium, preferredLocale: null };
    world.hud.garrison = garrison;
    world.armies = armies;
    world.openSendPicker({ q: 4, r: 0 });
    return world;
}
describe('SendArmyPicker', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });
    it('lists home first, then the armies, and dims the ones that cannot go with the reason', async () => {
        const returning = army('ret');
        returning.movement.isReturning = true;
        setup([returning, army('stand'), army('sup', { supporting: true, movement: null })]);
        const wrapper = mountPicker();
        const rows = wrapper.findAll('.send-row');
        expect(rows.map((r) => r.attributes('data-source'))).toEqual(['home', 'stand', 'ret', 'sup']);
        expect(rows[1].classes()).not.toContain('is-off');
        expect(rows[2].classes()).toContain('is-off');
        expect(rows[2].text()).toContain('Returning home');
        expect(rows[3].text()).toContain('recall it first');
        expect(rows[3].get('.send-row-head').element.disabled).toBe(true);
    });
    it('a marching army shows the premium lock and cannot be selected without premium', async () => {
        const world = setup([army('march', {}, inOneHour())]);
        const wrapper = mountPicker();
        const row = wrapper.get('[data-source="march"]');
        expect(row.text()).toContain('Premium: redirect while marching');
        expect(row.get('.send-row-head').element.disabled).toBe(true);
        await row.get('.send-row-head').trigger('click');
        expect(world.sendPicker?.selectedId).toBeNull();
    });
    it('with premium a marching army is selectable and moves whole, with no steppers', async () => {
        setup([army('march', {}, inOneHour())], [], true);
        const wrapper = mountPicker();
        await wrapper.get('[data-source="march"] .send-row-head').trigger('click');
        expect(wrapper.find('.send-stepper').exists()).toBe(false);
        expect(wrapper.get('[data-testid="split-note"]').text()).toBe('Whole army moves.');
    });
    it('selecting a standing army defaults to all units; trimming one tells how many keep standing and the button says what happens', async () => {
        const world = setup([army('stand')]);
        const wrapper = mountPicker();
        await wrapper.get('[data-source="stand"] .send-row-head').trigger('click');
        expect(wrapper.get('[data-testid="split-note"]').text()).toBe('Whole army moves.');
        expect(wrapper.get('.send-go').text()).toMatch(/^Move · 10 units · \d+ (min|h)/);
        const minus = wrapper.get('.send-stepper .stepper-btn');
        for (let i = 0; i < 10; i++)
            await minus.trigger('click');
        expect(world.fieldOrderDraft?.units?.spearman).toBe(0);
        expect(wrapper.get('[data-testid="split-note"]').text()).toBe('Pick at least one unit.');
        expect(wrapper.get('.send-go').element.disabled).toBe(true);
    });
    it('the split note counts the units that go and the ones that keep standing', async () => {
        const world = setup([army('stand')]);
        const wrapper = mountPicker();
        await wrapper.get('[data-source="stand"] .send-row-head').trigger('click');
        world.setFieldOrderUnitCount('spearman', 4);
        await wrapper.vm.$nextTick();
        expect(wrapper.get('[data-testid="split-note"]').text()).toBe('Splits: 4 go, 6 keep standing.');
        expect(wrapper.get('.send-go').text()).toContain('4 units');
    });
    it('the send button is disabled when the leaving part cannot afford the way home', async () => {
        // 10 spearmen eat 10 food/h; 6 + 4 hexes of walking at speed 2 is 5 h = 50 food, but only 20 is left.
        setup([army('stand', { provisions: 20 })]);
        const wrapper = mountPicker();
        expect(wrapper.get('[data-source="stand"]').text()).toContain('Not enough food for the way home');
        expect(wrapper.get('[data-source="stand"] .send-row-head').element.disabled).toBe(true);
    });
    it('the home row hands over to the dispatch form for the garrison', async () => {
        const world = setup([army('stand')]);
        const wrapper = mountPicker();
        await wrapper.get('[data-source="home"] .send-row-head').trigger('click');
        expect(world.sendPicker).toBeNull();
        expect(world.dispatchDraft?.route).toEqual([{ q: 4, r: 0 }]);
    });
    it('closing drops the order being composed', async () => {
        const world = setup([army('stand')]);
        const wrapper = mountPicker();
        await wrapper.get('[data-source="stand"] .send-row-head').trigger('click');
        await wrapper.get('.send-picker-close').trigger('click');
        expect(world.sendPicker).toBeNull();
        expect(world.fieldOrderDraft).toBeNull();
    });
});
