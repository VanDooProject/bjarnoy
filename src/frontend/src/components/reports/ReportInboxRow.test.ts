// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import ReportInboxRow from './ReportInboxRow.vue';
import type { InboxRowView } from '../../composables/useInboxRows';
import { createTestI18n } from '../../test/i18n';
import enReports from '../../i18n/locales/en/reports.json';
import enCommon from '../../i18n/locales/en/common.json';

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });

function rowView(overrides: Partial<InboxRowView> = {}): InboxRowView {
  return {
    key: 'camp:c1',
    id: 'c1',
    kind: 'camp',
    item: {} as InboxRowView['item'],
    tone: 'win',
    title: 'Won · Hunt',
    summary: '6 units lost',
    when: 'Jan 3, 2026, 10:00',
    whenShort: 'Jan 3, 2026',
    location: { q: 4, r: 11 },
    unread: true,
    ...overrides,
  };
}

function mountRow(row: InboxRowView, props: { expanded?: boolean; summary?: boolean } = {}) {
  return mount(ReportInboxRow, {
    props: { row, tile: 44, ...props },
    global: { plugins: [router, createTestI18n({ reports: enReports, common: enCommon })] },
  });
}

describe('ReportInboxRow', () => {
  it('marks an unread row with the attribute, the dot and a hidden "Unread" for screen readers', () => {
    const wrapper = mountRow(rowView());
    expect(wrapper.attributes('data-unread')).toBe('true');
    expect(wrapper.classes()).toContain('unread');
    expect(wrapper.find('[data-testid="report-row-dot"]').exists()).toBe(true);
    expect(wrapper.find('.visually-hidden').text()).toBe('Unread');
  });

  it('a read row has no dot and no unread marker', () => {
    const wrapper = mountRow(rowView({ unread: false }));
    expect(wrapper.attributes('data-unread')).toBe('false');
    expect(wrapper.find('[data-testid="report-row-dot"]').exists()).toBe(false);
    expect(wrapper.find('.visually-hidden').exists()).toBe(false);
  });

  it('takes its tone from the row', () => {
    expect(mountRow(rowView({ tone: 'loss' })).classes()).toContain('tone-loss');
    expect(mountRow(rowView({ tone: 'trade' })).classes()).toContain('tone-trade');
  });

  it('keeps the location link next to the row button, not inside it, and shows no link without a location', () => {
    const wrapper = mountRow(rowView());
    expect(wrapper.find('button [data-testid="report-location-link"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="report-location-link"]').exists()).toBe(true);
    expect(mountRow(rowView({ location: null })).find('[data-testid="report-location-link"]').exists()).toBe(false);
  });

  it('has aria-expanded and a chevron only when it expands in place', () => {
    expect(mountRow(rowView()).get('[data-testid="report-row"]').attributes('aria-expanded')).toBeUndefined();
    expect(mountRow(rowView()).find('.chevron').exists()).toBe(false);
    const open = mountRow(rowView(), { expanded: true });
    expect(open.get('[data-testid="report-row"]').attributes('aria-expanded')).toBe('true');
    expect(open.find('.chevron').exists()).toBe(true);
    expect(mountRow(rowView(), { expanded: false }).get('[data-testid="report-row"]').attributes('aria-expanded')).toBe('false');
  });

  it('emits open on a click of the row', async () => {
    const wrapper = mountRow(rowView());
    await wrapper.get('[data-testid="report-row"]').trigger('click');
    expect(wrapper.emitted('open')).toHaveLength(1);
  });
});
