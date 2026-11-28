// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportsModal from './ReportsModal.vue';
import type { BattleReportResponse, CampReportResponse } from '../../api/types';
import { usePlayerStore } from '../../stores/player';
import { useWorldStore } from '../../stores/world';
import { createTestI18n } from '../../test/i18n';
import enReports from '../../i18n/locales/en/reports.json';
import enHud from '../../i18n/locales/en/hud.json';
import enProfile from '../../i18n/locales/en/profile.json';

// Exercises the real reports list/detail content rather than the demo-mode
// hint — the vitest config otherwise defaults DEMO_MODE to true the same
// way a plain `npm run dev` does (see LoginView.test.ts's own comment on
// this same mock).
vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return { ...actual, DEMO_MODE: false };
});

const { getWorldReports, getWorldTradeReports, getWorldFieldReports, getWorldCampReports, getWorldArmyReports, markReportRead, markAllReportsRead } = vi.hoisted(() => ({
  markReportRead: vi.fn(),
  markAllReportsRead: vi.fn(),
  getWorldReports: vi.fn(),
  getWorldArmyReports: vi.fn(),
  getWorldTradeReports: vi.fn(),
  getWorldFieldReports: vi.fn(),
  getWorldCampReports: vi.fn(),
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    api: { getWorldReports, getWorldTradeReports, getWorldFieldReports, getWorldCampReports, getWorldArmyReports, markReportRead, markAllReportsRead },
  };
});

function battleReport(overrides: Partial<BattleReportResponse> = {}): BattleReportResponse {
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
    attackerVolleyPower: 0,
    defenderVolleyPower: 0,
    seed: 1,
    lootTaken: { wood: 0, stone: 0, food: 0, iron: 0 },
    attackerLines: [],
    defenderLines: [],
    siege: null,
    shipFight: null,
    drowned: [],
    fireShipsBurned: 0,
    fireSiege: null,
    viewerSide: 'attacker',
    read: false,
    ...overrides,
  };
}

function campReport(overrides: Partial<CampReportResponse> = {}): CampReportResponse {
  return {
    id: 'camp-1',
    kind: 'hunt',
    occurredAt: '2026-01-14T00:00:00Z',
    camp: { q: 1, r: 2, family: 'wolfden', effectiveLevel: 1 },
    settlementId: 'settlement-1',
    armyId: 'army-1',
    winner: 'army',
    armyPower: 300,
    campPower: 195,
    armyVolleyPower: 0,
    units: [],
    beasts: [],
    loot: { wood: 0, stone: 0, food: 0, iron: 0 },
    campCleared: true,
    tower: null,
    towerBurned: false,
    read: false,
    ...overrides,
  };
}

function testRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settlement', name: 'settlement', component: { template: '<div />' } },
      { path: '/reports', name: 'reports', component: { template: '<div />' } },
      { path: '/reports/:reportId', name: 'report-detail', component: { template: '<div />' } },
    ],
  });
}

async function mountModal(router: Router) {
  const wrapper = mount(ReportsModal, {
    global: { plugins: [router, createTestI18n({ reports: enReports, hud: enHud, profile: enProfile })] },
  });
  await flushPromises();
  return wrapper;
}

let matchMediaSpy: ReturnType<typeof vi.fn>;

function setIsMobile(matches: boolean) {
  matchMediaSpy = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  window.matchMedia = matchMediaSpy as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  setIsMobile(false);
  getWorldReports.mockResolvedValue([battleReport()]);
  getWorldTradeReports.mockResolvedValue([]);
  getWorldFieldReports.mockResolvedValue([]);
  getWorldCampReports.mockResolvedValue([]);
  getWorldArmyReports.mockResolvedValue([]);
  markReportRead.mockResolvedValue(undefined);
  markAllReportsRead.mockResolvedValue({ markedRead: 1 });
  const player = usePlayerStore();
  player.settlementId = 'settlement-1';
  useWorldStore().worldId = 'world-1';
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
    getWorldReports.mockResolvedValue([
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
    getWorldReports.mockResolvedValue([battleReport({ id: 'battle-1' }), battleReport({ id: 'battle-2' })]);
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

  describe('read state', () => {
    it('opening the window marks nothing read', async () => {
      const router = testRouter();
      await router.push('/reports');
      await router.isReady();

      const wrapper = await mountModal(router);

      expect(markReportRead).not.toHaveBeenCalled();
      expect(markAllReportsRead).not.toHaveBeenCalled();
      expect(wrapper.find('[data-testid="reports-unread-header"]').text()).toBe('Unread · 1');
      expect(wrapper.find('[data-testid="report-row"]').attributes('data-unread')).toBeUndefined();
      expect(wrapper.find('.report-inbox-row').attributes('data-unread')).toBe('true');
    });

    it('expanding an unread row marks it read once, keeps it under Unread while open, and moves it to Earlier once collapsed', async () => {
      getWorldReports.mockResolvedValue([battleReport({ id: 'battle-1' }), battleReport({ id: 'battle-2', occurredAt: '2026-01-14T00:00:00Z' })]);
      const router = testRouter();
      await router.push('/reports');
      await router.isReady();
      const wrapper = await mountModal(router);

      await wrapper.find('[data-testid="report-row"]').trigger('click');
      await flushPromises();

      expect(markReportRead).toHaveBeenCalledTimes(1);
      expect(markReportRead).toHaveBeenCalledWith('world-1', 'battle', 'battle-1', expect.anything());
      // The opened row stays in the unread group; the other unread row is still there too.
      expect(wrapper.find('[data-testid="reports-unread-header"]').text()).toBe('Unread · 2');
      expect(wrapper.find('[data-testid="reports-earlier-divider"]').exists()).toBe(false);

      await wrapper.find('[data-testid="report-row"]').trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-testid="reports-unread-header"]').text()).toBe('Unread · 1');
      expect(wrapper.find('[data-testid="reports-earlier-divider"]').exists()).toBe(true);
      expect(markReportRead).toHaveBeenCalledTimes(1);
    });

    it('a deep link marks that report read', async () => {
      getWorldReports.mockResolvedValue([battleReport({ id: 'battle-1' }), battleReport({ id: 'battle-2' })]);
      const router = testRouter();
      await router.push('/reports/battle-2');
      await router.isReady();

      await mountModal(router);

      expect(markReportRead).toHaveBeenCalledTimes(1);
      expect(markReportRead).toHaveBeenCalledWith('world-1', 'battle', 'battle-2', expect.anything());
    });

    it('"Mark read" marks every report read at once', async () => {
      getWorldReports.mockResolvedValue([battleReport({ id: 'battle-1' }), battleReport({ id: 'battle-2' })]);
      const router = testRouter();
      await router.push('/reports');
      await router.isReady();
      const wrapper = await mountModal(router);

      await wrapper.find('[data-testid="reports-mark-read"]').trigger('click');
      await flushPromises();

      expect(markAllReportsRead).toHaveBeenCalledTimes(1);
      expect(wrapper.find('[data-testid="reports-mark-read"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="reports-unread-header"]').exists()).toBe(false);
    });

    it('a report the server has as read starts under Earlier, with no Unread header', async () => {
      getWorldReports.mockResolvedValue([battleReport({ read: true })]);
      const router = testRouter();
      await router.push('/reports');
      await router.isReady();

      const wrapper = await mountModal(router);

      expect(wrapper.find('[data-testid="reports-unread-header"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="reports-mark-read"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="reports-earlier-divider"]').exists()).toBe(false);
      expect(wrapper.find('.report-inbox-row').attributes('data-unread')).toBe('false');
    });
  });

  describe('kind tabs', () => {
    async function mountTabs() {
      getWorldReports.mockResolvedValue([battleReport({ id: 'battle-1' }), battleReport({ id: 'battle-2', read: true })]);
      getWorldCampReports.mockResolvedValue([campReport()]);
      const router = testRouter();
      await router.push('/reports');
      await router.isReady();
      return mountModal(router);
    }

    it('shows the unread count per kind in a corner badge, and the total on All', async () => {
      const wrapper = await mountTabs();

      expect(wrapper.find('[data-testid="report-kind-tab-badge-all"]').text()).toBe('2');
      expect(wrapper.find('[data-testid="report-kind-tab-badge-battle"]').text()).toBe('1');
      expect(wrapper.find('[data-testid="report-kind-tab-badge-camp"]').text()).toBe('1');
      expect(wrapper.find('[data-testid="report-kind-tab-badge-trade"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="report-kind-tab-battle"]').attributes('aria-label')).toBe('Battle, 1 unread');
      expect(wrapper.find('[data-testid="report-kind-tab-trade"]').attributes('aria-label')).toBe('Trade');
    });

    it('filters the rows by kind', async () => {
      const wrapper = await mountTabs();
      expect(wrapper.findAll('[data-testid="report-row"]')).toHaveLength(3);

      await wrapper.find('[data-testid="report-kind-tab-camp"]').trigger('click');

      expect(wrapper.find('[data-testid="report-kind-tab-camp"]').attributes('aria-pressed')).toBe('true');
      expect(wrapper.findAll('[data-testid="report-row"]')).toHaveLength(1);
    });
  });
});
