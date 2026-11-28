// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';
import ReportsPanel from './ReportsPanel.vue';
import type { CampReportResponse } from '../../api/types';
import { REPORTS_PANEL_ROWS } from '../../lib/units/inbox';
import { useReportsStore } from '../../stores/reports';
import { createTestI18n } from '../../test/i18n';
import enReports from '../../i18n/locales/en/reports.json';
import enHud from '../../i18n/locales/en/hud.json';
import enCommon from '../../i18n/locales/en/common.json';

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

function mountPanel(router: Router) {
  return mount(ReportsPanel, {
    global: { plugins: [router, createTestI18n({ reports: enReports, hud: enHud, common: enCommon })] },
  });
}

describe('ReportsPanel', () => {
  let router: Router;
  beforeEach(async () => {
    setActivePinia(createPinia());
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/settlement', component: { template: '<div />' } },
        { path: '/reports', component: { template: '<div />' } },
        { path: '/reports/:reportId', component: { template: '<div />' } },
      ],
    });
    await router.push('/settlement');
  });

  it('lists only the newest rows and marks the unread ones', () => {
    // Seven reports, the two oldest are read.
    useReportsStore().campItems = [1, 2, 3, 4, 5, 6, 7].map((n) => campReport(n, n <= 2));
    const wrapper = mountPanel(router);
    const rows = wrapper.findAll('[data-testid="report-row"]');
    expect(rows).toHaveLength(REPORTS_PANEL_ROWS);
    expect(wrapper.findAll('.report-inbox-row').every((row) => row.attributes('data-unread') === 'true')).toBe(true);
    expect(wrapper.find('.unread-count').text()).toBe('5 unread');
  });

  it('shows a read row without the unread mark and no count when everything is read', () => {
    useReportsStore().campItems = [campReport(1, true)];
    const wrapper = mountPanel(router);
    expect(wrapper.get('.report-inbox-row').attributes('data-unread')).toBe('false');
    expect(wrapper.find('.unread-count').exists()).toBe(false);
  });

  it('opens a report in the reports window over the current view', async () => {
    useReportsStore().campItems = [campReport(1, false)];
    const wrapper = mountPanel(router);
    await wrapper.get('[data-testid="report-row"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve));
    expect(router.currentRoute.value.path).toBe('/reports/camp-1');
    expect((router.options.history.state as { backgroundView?: string }).backgroundView).toBe('/settlement');
  });

  it('opens the whole list from the footer', async () => {
    useReportsStore().campItems = [campReport(1, false)];
    const wrapper = mountPanel(router);
    await wrapper.get('[data-testid="reports-panel-all"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve));
    expect(router.currentRoute.value.path).toBe('/reports');
    expect((router.options.history.state as { backgroundView?: string }).backgroundView).toBe('/settlement');
  });
});
