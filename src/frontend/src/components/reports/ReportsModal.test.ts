// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportsModal from './ReportsModal.vue';
import type { BattleReportResponse } from '../../api/types';
import { usePlayerStore } from '../../stores/player';
import { createTestI18n } from '../../test/i18n';
import enReports from '../../i18n/locales/en/reports.json';
import enHud from '../../i18n/locales/en/hud.json';

// Exercises the real reports list/detail content rather than the demo-mode
// hint — the vitest config otherwise defaults DEMO_MODE to true the same
// way a plain `npm run dev` does (see LoginView.test.ts's own comment on
// this same mock).
vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return { ...actual, DEMO_MODE: false };
});

const { getSettlementReports, getSettlementTradeReports, getSettlementFieldReports } = vi.hoisted(() => ({
  getSettlementReports: vi.fn(),
  getSettlementTradeReports: vi.fn(),
  getSettlementFieldReports: vi.fn(),
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    api: { getSettlementReports, getSettlementTradeReports, getSettlementFieldReports },
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
    seed: 1,
    lootTaken: { wood: 0, stone: 0, food: 0, iron: 0 },
    attackerLines: [],
    defenderLines: [],
    siege: null,
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
    global: { plugins: [router, createTestI18n({ reports: enReports, hud: enHud })] },
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
  getSettlementReports.mockResolvedValue([battleReport()]);
  getSettlementTradeReports.mockResolvedValue([]);
  getSettlementFieldReports.mockResolvedValue([]);
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

  it('clicking a row navigates to the detail, keeping the stashed backgroundView', async () => {
    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/reports', state: { backgroundView: '/settlement' } });
    await router.isReady();

    const wrapper = await mountModal(router);
    await wrapper.find('[data-testid="report-row"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/reports/battle-1');
    expect((router.options.history.state as { backgroundView?: unknown }).backgroundView).toBe('/settlement');
    expect(wrapper.find('[data-testid="report-detail"]').exists()).toBe(true);
  });

  it('on mobile, the chevron on a detail returns to the list rather than closing the modal', async () => {
    setIsMobile(true);
    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/reports', state: { backgroundView: '/settlement' } });
    await router.push({ path: '/reports/battle-1', state: { backgroundView: '/settlement' } });
    await router.isReady();

    const wrapper = await mountModal(router);
    await wrapper.find('.back-button').trigger('click');
    await flushPromises();

    // Back to the list, not out to the background route.
    expect(router.currentRoute.value.path).toBe('/reports');
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
