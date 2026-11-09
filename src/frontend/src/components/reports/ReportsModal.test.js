// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportsModal from './ReportsModal.vue';
import { usePlayerStore } from '../../stores/player';
import { createTestI18n } from '../../test/i18n';
import enReports from '../../i18n/locales/en/reports.json';
import enHud from '../../i18n/locales/en/hud.json';
import enProfile from '../../i18n/locales/en/profile.json';
// Exercises the real reports list/detail content rather than the demo-mode
// hint — the vitest config otherwise defaults DEMO_MODE to true the same
// way a plain `npm run dev` does (see LoginView.test.ts's own comment on
// this same mock).
vi.mock('../../config', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, DEMO_MODE: false };
});
const { getSettlementReports, getSettlementTradeReports, getSettlementFieldReports, getSettlementCampReports } = vi.hoisted(() => ({
    getSettlementReports: vi.fn(),
    getSettlementTradeReports: vi.fn(),
    getSettlementFieldReports: vi.fn(),
    getSettlementCampReports: vi.fn(),
}));
vi.mock('../../api/client', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        api: { getSettlementReports, getSettlementTradeReports, getSettlementFieldReports, getSettlementCampReports },
    };
});
function battleReport(overrides = {}) {
    return {
        id: 'battle-1',
        occurredAt: '2026-01-15T00:00:00Z',
        attackerArmyId: 'army-1',
        attackerSettlementId: 'settlement-1',
        defenderSettlementId: 'settlement-2',
        mission: 'raid',
        winner: 'attacker',
        attackPower: 100,
        defensePower: 50,
        seed: 1,
        lootTaken: { wood: 0, stone: 0, food: 0, iron: 0 },
        attackerLines: [],
        defenderLines: [],
        siege: null,
        ...overrides,
    };
}
function testRouter() {
    return createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/settlement', name: 'settlement', component: { template: '<div />' } },
            { path: '/reports', name: 'reports', component: { template: '<div />' } },
            { path: '/reports/:reportId', name: 'report-detail', component: { template: '<div />' } },
        ],
    });
}
async function mountModal(router) {
    const wrapper = mount(ReportsModal, {
        global: { plugins: [router, createTestI18n({ reports: enReports, hud: enHud, profile: enProfile })] },
    });
    await flushPromises();
    return wrapper;
}
let matchMediaSpy;
function setIsMobile(matches) {
    matchMediaSpy = vi.fn().mockImplementation((query) => ({
        matches,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }));
    window.matchMedia = matchMediaSpy;
}
beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    setIsMobile(false);
    getSettlementReports.mockResolvedValue([battleReport()]);
    getSettlementTradeReports.mockResolvedValue([]);
    getSettlementFieldReports.mockResolvedValue([]);
    getSettlementCampReports.mockResolvedValue([]);
    const player = usePlayerStore();
    player.settlementId = 'settlement-1';
});
afterEach(() => {
    // @ts-expect-error test-only cleanup
    delete window.matchMedia;
});
describe('ReportsModal', () => {
    it('shows a close (X) button, no back chevron, on desktop', async () => {
        const router = testRouter();
        await router.push('/reports');
        await router.isReady();
        const wrapper = await mountModal(router);
        expect(wrapper.find('.close-button').exists()).toBe(true);
        expect(wrapper.find('.back-button').exists()).toBe(false);
    });
    it('shows a back chevron and the "Reports" title on mobile, for the list', async () => {
        setIsMobile(true);
        const router = testRouter();
        await router.push('/reports');
        await router.isReady();
        const wrapper = await mountModal(router);
        expect(wrapper.find('.back-button').exists()).toBe(true);
        expect(wrapper.find('.close-button').exists()).toBe(false);
        expect(wrapper.find('.mobile-title').text()).toBe('Reports');
    });
    it('clicking a row expands its report in place, without leaving the list or touching the URL', async () => {
        const router = testRouter();
        await router.push('/settlement');
        await router.push({ path: '/reports', state: { backgroundView: '/settlement' } });
        await router.isReady();
        const wrapper = await mountModal(router);
        expect(wrapper.find('[data-testid="report-detail"]').exists()).toBe(false);
        await wrapper.find('[data-testid="report-row"]').trigger('click');
        expect(router.currentRoute.value.path).toBe('/reports');
        expect(wrapper.find('[data-testid="report-row"]').attributes('aria-expanded')).toBe('true');
        expect(wrapper.find('[data-testid="report-detail"]').exists()).toBe(true);
        await wrapper.find('[data-testid="report-row"]').trigger('click');
        expect(wrapper.find('[data-testid="report-detail"]').exists()).toBe(false);
    });
    it('keeps several reports open at once', async () => {
        getSettlementReports.mockResolvedValue([
            battleReport({ id: 'battle-1' }),
            battleReport({ id: 'battle-2', occurredAt: '2026-01-16T00:00:00Z' }),
        ]);
        const router = testRouter();
        await router.push('/reports');
        await router.isReady();
        const wrapper = await mountModal(router);
        const rows = wrapper.findAll('[data-testid="report-row"]');
        await rows[0].trigger('click');
        await rows[1].trigger('click');
        expect(wrapper.findAll('[data-testid="report-detail"]')).toHaveLength(2);
    });
    it('a deep link to a report opens that row', async () => {
        getSettlementReports.mockResolvedValue([battleReport({ id: 'battle-1' }), battleReport({ id: 'battle-2' })]);
        const router = testRouter();
        await router.push('/reports/battle-2');
        await router.isReady();
        const wrapper = await mountModal(router);
        const items = wrapper.findAll('.item');
        expect(items.find((i) => i.attributes('data-report-id') === 'battle-2')?.find('[data-testid="report-detail"]').exists()).toBe(true);
        expect(items.find((i) => i.attributes('data-report-id') === 'battle-1')?.find('[data-testid="report-detail"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="reports-back-to-list"]').exists()).toBe(false);
    });
    it('on mobile, the chevron closes the modal even with a report open', async () => {
        setIsMobile(true);
        const router = testRouter();
        await router.push('/settlement');
        await router.push({ path: '/reports/battle-1', state: { backgroundView: '/settlement' } });
        await router.isReady();
        const wrapper = await mountModal(router);
        await wrapper.find('.back-button').trigger('click');
        await flushPromises();
        expect(router.currentRoute.value.path).toBe('/settlement');
    });
    it('Escape closes the whole modal, going back to the stashed backgroundView, even from a detail', async () => {
        const router = testRouter();
        await router.push('/settlement');
        await router.push({ path: '/reports', state: { backgroundView: '/settlement' } });
        await router.push({ path: '/reports/battle-1', state: { backgroundView: '/settlement' } });
        await router.isReady();
        const wrapper = await mountModal(router);
        await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' });
        await flushPromises();
        expect(router.currentRoute.value.path).toBe('/settlement');
    });
});
