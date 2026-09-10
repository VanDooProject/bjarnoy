// @vitest-environment jsdom
//
// Issue #206: a real-DOM render check for FieldBattleReportCard.vue,
// complementing the pure-logic coverage in lib/units/fieldBattleReports.test.ts
// — this is the layer those helpers can't exercise (i18n keys actually
// resolve, both side sections render, the "you"/"defending" tags show up
// correctly, and loot only renders for the winning viewer).
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import FieldBattleReportCard from './FieldBattleReportCard.vue';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';

const baseReport = {
  winner: 'sidea',
  sideAPower: 420,
  sideBPower: 180,
  sideAWasDefending: false,
  sideBWasDefending: true,
  lootTaken: { wood: 40, stone: 0, food: 10, iron: 0 },
  lines: [
    { side: 'sidea' as const, isLoss: true, unit: 'axeman', count: 3 },
    { side: 'sidea' as const, isLoss: false, unit: 'axeman', count: 12 },
    { side: 'sideb' as const, isLoss: true, unit: 'thrall', count: 20 },
  ],
};

function mountCard(side: 'sidea' | 'sideb' = 'sidea') {
  return mount(FieldBattleReportCard, {
    props: { report: baseReport, side, occurredAt: '2026-09-09T10:00:00.000Z' },
    global: { plugins: [createTestI18n({ hud: enHud })] },
  });
}

describe('FieldBattleReportCard', () => {
  it("renders the viewer's own outcome, both side sections, and no siege section", () => {
    const wrapper = mountCard('sidea');

    expect(wrapper.find('.banner').text()).toBe('Won');
    expect(wrapper.findAll('.side')).toHaveLength(2);
    expect(wrapper.find('.siege').exists()).toBe(false);
    wrapper.unmount();
  });

  it('tags the viewer\'s own side and the defending side', () => {
    const wrapper = mountCard('sidea');

    const sections = wrapper.findAll('.side');
    expect(sections[0].find('.you-tag').exists()).toBe(true);
    expect(sections[1].find('.you-tag').exists()).toBe(false);
    expect(sections[0].find('.defending-tag').exists()).toBe(false);
    expect(sections[1].find('.defending-tag').exists()).toBe(true);
    wrapper.unmount();
  });

  it('merges loss/survivor lines per unit type into one row each', () => {
    const wrapper = mountCard('sidea');

    const rows = wrapper.findAll('.side')[0].findAll('tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].find('.lost').text()).toBe('3');
    expect(rows[0].find('.survived').text()).toBe('12');
    wrapper.unmount();
  });

  it('shows loot for the winning viewer but not for the loser', () => {
    const winnerCard = mountCard('sidea');
    expect(winnerCard.find('.loot').exists()).toBe(true);
    winnerCard.unmount();

    const loserCard = mountCard('sideb');
    expect(loserCard.find('.banner').text()).toBe('Lost');
    expect(loserCard.find('.loot').exists()).toBe(false);
    loserCard.unmount();
  });

  it('reads as tied for either side on a tie', () => {
    const tied = { ...baseReport, winner: 'tie' };
    const wrapper = mount(FieldBattleReportCard, {
      props: { report: tied, side: 'sidea', occurredAt: '2026-09-09T10:00:00.000Z' },
      global: { plugins: [createTestI18n({ hud: enHud })] },
    });

    expect(wrapper.find('.banner').text()).toBe('Tied');
    expect(wrapper.find('.card').classes()).toContain('tie');
    wrapper.unmount();
  });
});
