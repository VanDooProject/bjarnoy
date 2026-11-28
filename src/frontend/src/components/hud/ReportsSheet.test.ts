// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportsSheet from './ReportsSheet.vue';
import type { CampReportResponse } from '../../api/types';
import { reportsSheetOpen } from '../../composables/useReportsSheet';
import { __resetPhoneLayersForTest } from '../../composables/usePhoneLayer';
import { useReportsStore } from '../../stores/reports';
import { createTestI18n } from '../../test/i18n';
import enReports from '../../i18n/locales/en/reports.json';
import enHud from '../../i18n/locales/en/hud.json';
import enCommon from '../../i18n/locales/en/common.json';

const { markAllReportsRead } = vi.hoisted(() => ({ markAllReportsRead: vi.fn() }));
vi.mock('../../config', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../config')>()), DEMO_MODE: false }));
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, api: { ...actual.api, markAllReportsRead } };
});

function campReport(n: number, read: boolean): CampReportResponse {
  return {
    id: `camp-${n}`,
    kind: 'hunt',
    occurredAt: new Date(Date.UTC(2026, 0, 10, 12, n)).toISOString(),
    camp: { q: n, r: 2, family: 'wolfden', effectiveLevel: 1 },
    settlementId: 's1',
    armyId: 'a1',
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
    read,
  };
}

describe('ReportsSheet', () => {
  let router: Router;
  beforeEach(async () => {
    setActivePinia(createPinia());
    __resetPhoneLayersForTest();
    markAllReportsRead.mockReset().mockResolvedValue({ markedRead: 2 });
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/settlement', component: { template: '<div />' } },
        { path: '/reports', component: { template: '<div />' } },
        { path: '/reports/:reportId', component: { template: '<div />' } },
      ],
    });
    await router.push('/settlement');
    reportsSheetOpen.value = true;
  });
  afterEach(() => {
    reportsSheetOpen.value = false;
  });

  function mountSheet() {
    const reports = useReportsStore();
    reports.worldId = 'w1';
    reports.campItems = [campReport(1, true), campReport(2, false), campReport(3, false)];
    return mount(ReportsSheet, {
      attachTo: document.body,
      global: { stubs: { transition: false }, plugins: [router, createTestI18n({ reports: enReports, hud: enHud, common: enCommon })] },
    });
  }

  it('lists the unread reports under New and the read ones under Earlier', () => {
    const wrapper = mountSheet();
    expect(wrapper.find('[data-testid="reports-sheet"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="reports-sheet-new"]').text()).toBe('New · 2');
    expect(wrapper.get('[data-testid="reports-sheet-earlier"]').text()).toBe('Earlier');
    const flags = wrapper.findAll('.report-inbox-row').map((row) => row.attributes('data-unread'));
    expect(flags).toEqual(['true', 'true', 'false']);
    wrapper.unmount();
  });

  it('marks everything read from the header button, which goes away with the last unread report', async () => {
    const wrapper = mountSheet();
    await wrapper.get('[data-testid="reports-sheet-mark-read"]').trigger('click');
    await flushPromises();
    expect(markAllReportsRead).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="reports-sheet-mark-read"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens a report or the whole list in the reports window', async () => {
    const wrapper = mountSheet();
    await wrapper.findAll('[data-testid="report-row"]')[0]!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/reports/camp-3');
    await router.push('/settlement');
    await wrapper.get('[data-testid="reports-sheet-all"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/reports');
    wrapper.unmount();
  });

  it('closes when a row\'s show-on-map link is used', async () => {
    const wrapper = mountSheet();
    await wrapper.get('.report-inbox-row .location').trigger('click');
    expect(reportsSheetOpen.value).toBe(false);
    wrapper.unmount();
  });
});
