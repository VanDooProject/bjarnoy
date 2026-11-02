// @vitest-environment jsdom
//
// Real-DOM render check for CampReportCard.vue: the title per kind, the banner for the
// viewer, units sent/lost, beasts before/lost per tier with the family's beast names, loot and
// the cleared / tower burned notes.
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CampReportCard from './CampReportCard.vue';
import type { CampReportResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';

const base: CampReportResponse = {
  id: 'c1',
  kind: 'hunt',
  occurredAt: '2026-09-09T10:00:00.000Z',
  camp: { q: 4, r: -2, family: 'wolfden', effectiveLevel: 2 },
  settlementId: 's1',
  armyId: 'a1',
  winner: 'army',
  armyPower: 400,
  campPower: 255,
  units: [{ type: 'axeman', sent: 20, lost: 6 }],
  beasts: [
    { tier: 'young', before: 4, lost: 4 },
    { tier: 'adult', before: 9, lost: 9 },
    { tier: 'alpha', before: 1, lost: 1 },
  ],
  loot: { wood: 100, stone: 0, food: 250, iron: 0 },
  campCleared: true,
  tower: null,
  towerBurned: false,
};

function mountCard(report: CampReportResponse) {
  return mount(CampReportCard, { props: { report }, global: { plugins: [createTestI18n({ hud: enHud })] } });
}

describe('CampReportCard', () => {
  it('shows a won hunt: title, units, named beasts per tier, loot and the cleared note', () => {
    const w = mountCard(base);
    expect(w.find('.banner').text()).toBe('Won');
    expect(w.find('[data-testid="camp-report-title"]').text()).toBe('Hunt at Wolf den');
    expect(w.find('[data-testid="camp-report-units"] tbody tr').text()).toContain('20');
    const beasts = w.findAll('[data-testid="camp-report-beasts"] tbody tr');
    expect(beasts).toHaveLength(3);
    expect(beasts[0]!.text()).toContain('Wolf pup');
    expect(beasts[2]!.text()).toContain('Alpha wolf');
    expect(w.find('[data-testid="camp-report-loot"]').text()).toContain('250');
    expect(w.find('[data-testid="camp-report-cleared"]').exists()).toBe(true);
    expect(w.find('[data-testid="camp-report-tower"]').exists()).toBe(false);
    w.unmount();
  });

  it('titles an ambush and a lost fight without loot', () => {
    const w = mountCard({
      ...base,
      kind: 'ambush',
      winner: 'camp',
      campCleared: false,
      loot: { wood: 0, stone: 0, food: 0, iron: 0 },
    });
    expect(w.find('.banner').text()).toBe('Lost');
    expect(w.find('[data-testid="camp-report-title"]').text()).toBe('Ambushed by Wolf den');
    expect(w.find('[data-testid="camp-report-loot"]').exists()).toBe(false);
    expect(w.find('[data-testid="camp-report-cleared"]').exists()).toBe(false);
    w.unmount();
  });

  it('says whether the attacked tower burned or held', () => {
    const burned = mountCard({ ...base, kind: 'tower', winner: 'camp', tower: { q: 1, r: 1 }, towerBurned: true, campCleared: false });
    expect(burned.find('[data-testid="camp-report-title"]').text()).toBe('Wolf den attacked your tower');
    expect(burned.find('[data-testid="camp-report-tower"]').text()).toContain('burned');
    burned.unmount();

    const held = mountCard({ ...base, kind: 'tower', tower: { q: 1, r: 1 }, towerBurned: false, campCleared: false });
    expect(held.find('[data-testid="camp-report-tower"]').text()).toContain('held');
    held.unmount();
  });
});
