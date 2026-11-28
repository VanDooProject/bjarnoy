// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ReportsChip from './ReportsChip.vue';
import type { CampReportResponse } from '../../api/types';
import { queueHandleBottomPx } from '../../composables/hudBarHeight';
import { __resetPhoneLayersForTest, usePhoneLayer } from '../../composables/usePhoneLayer';
import { reportsSheetOpen } from '../../composables/useReportsSheet';
import { useReportsStore } from '../../stores/reports';
import { createTestI18n } from '../../test/i18n';
import enReports from '../../i18n/locales/en/reports.json';
import enHud from '../../i18n/locales/en/hud.json';

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

function mountChip() {
  return mount(ReportsChip, { global: { plugins: [createTestI18n({ reports: enReports, hud: enHud })] } });
}

describe('ReportsChip', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    __resetPhoneLayersForTest();
    reportsSheetOpen.value = false;
    queueHandleBottomPx.value = 0;
    useReportsStore().campItems = [campReport(1, false), campReport(2, false), campReport(3, true)];
  });
  afterEach(() => {
    reportsSheetOpen.value = false;
  });

  it('shows the unread count in its badge and its label, and opens the sheet on a tap', async () => {
    const wrapper = mountChip();
    expect(wrapper.get('[data-testid="reports-chip-badge"]').text()).toBe('2');
    expect(wrapper.get('[data-testid="reports-chip"]').attributes('aria-label')).toBe('Reports (2)');
    await wrapper.get('[data-testid="reports-chip"]').trigger('click');
    expect(reportsSheetOpen.value).toBe(true);
  });

  it('has no badge and a plain label when everything is read', () => {
    useReportsStore().campItems = [campReport(3, true)];
    const wrapper = mountChip();
    expect(wrapper.find('[data-testid="reports-chip-badge"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="reports-chip"]').attributes('aria-label')).toBe('Reports');
  });

  it('sits below the queue drawer handle: the handle\'s bottom edge goes into its position', async () => {
    queueHandleBottomPx.value = 300;
    const wrapper = mountChip();
    expect((wrapper.get('[data-testid="reports-chip"]').element as HTMLElement).style.getPropertyValue('--queue-handle-bottom')).toBe('300px');
  });

  it('hides under a phone layer', async () => {
    window.matchMedia = (() => ({ matches: true, media: '', addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    const wrapper = mountChip();
    const layer = mount({ setup() { usePhoneLayer(true); return () => null; } });
    await nextTick();
    expect((wrapper.get('[data-testid="reports-chip"]').element as HTMLElement).style.visibility).toBe('hidden');
    layer.unmount();
  });
});
