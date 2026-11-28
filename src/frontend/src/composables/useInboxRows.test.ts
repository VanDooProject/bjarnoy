// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';
import { useInboxGroups, useInboxRowView } from './useInboxRows';
import { useReportsStore } from '../stores/reports';
import type { TradeReportResponse } from '../api/types';
import { mergeInbox } from '../lib/units/inbox';
import { createTestI18n } from '../test/i18n';
import enReports from '../i18n/locales/en/reports.json';

// The composables need a component context for useI18n.
function inSetup<T>(fn: () => T): T {
  let result!: T;
  mount(
    defineComponent({
      setup() {
        result = fn();
        return () => null;
      },
    }),
    { global: { plugins: [createTestI18n({ reports: enReports })] } },
  );
  return result;
}

function trade(id: string, read: boolean): TradeReportResponse {
  return {
    id,
    offerId: `offer-${id}`,
    completedAt: '2026-01-02T00:00:00Z',
    posterSettlementId: 'p',
    acceptorSettlementId: 'a',
    offeredResource: 'wood',
    offeredAmount: 200,
    requestedResource: 'iron',
    requestedAmount: 100,
    guildTrade: false,
    travelHours: 1,
    viewerSide: 'poster',
    read,
  };
}

beforeEach(() => setActivePinia(createPinia()));

describe('useInboxRowView', () => {
  it('builds a trade row: mission as title, no location, tone trade, unread from the store', () => {
    const [item] = mergeInbox([], [trade('t1', false)]);
    const row = inSetup(() => useInboxRowView())(item!);
    expect(row).toMatchObject({ key: 'trade:t1', id: 't1', kind: 'trade', tone: 'trade', location: null, unread: true });
    expect(row.title).toBe('Trade');
  });
});

describe('useInboxGroups', () => {
  it('splits unread from earlier, and keeps a row the player just opened in the unread group', () => {
    const reports = useReportsStore();
    const items = ref(mergeInbox([], [trade('t1', false), trade('t2', true)]));
    const keptOpen = ref(new Set<string>());
    const { unread, earlier } = inSetup(() => useInboxGroups(items, keptOpen));
    expect(unread.value.map((r) => r.id)).toEqual(['t1']);
    expect(earlier.value.map((r) => r.id)).toEqual(['t2']);

    reports.localRead = { 'trade:t1': true };
    keptOpen.value = new Set(['trade:t1']);
    expect(unread.value.map((r) => r.id)).toEqual(['t1']);
    keptOpen.value = new Set();
    expect(unread.value).toEqual([]);
    expect(earlier.value.map((r) => r.id)).toEqual(['t1', 't2']);
  });
});
