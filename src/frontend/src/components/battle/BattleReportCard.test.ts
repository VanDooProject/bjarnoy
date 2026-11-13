// @vitest-environment jsdom
//
// The battle outcome card: a land army's report is one fight as it always was, a fleet's report shows the ship fight, then the
// land fight, the drowned passengers and the Fire Hulks' fire damage.
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BattleReportCard, { type BattleReportCardData } from './BattleReportCard.vue';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';

const landReport: BattleReportCardData = {
  mission: 'attack',
  winner: 'attacker',
  attackPower: 750,
  defensePower: 350,
  lootTaken: { wood: 0, stone: 0, food: 0, iron: 0 },
  attackerLines: [{ unit: 'spearman', sent: 50, lost: 16, survived: 34 }],
  defenderLines: [{ unit: 'spearman', lost: 10, survived: 0 }],
  siege: null,
};

const fleetReport: BattleReportCardData = {
  ...landReport,
  attackPower: 300,
  defensePower: 200,
  attackerLines: [{ unit: 'spearman', sent: 20, lost: 5, survived: 15 }],
  defenderLines: [{ unit: 'axeman', lost: 8, survived: 0 }],
  shipFight: {
    attackerLines: [
      { unit: 'snekkja', sent: 2, lost: 1, survived: 1 },
      { unit: 'firehulk', sent: 30, lost: 4, survived: 26 },
    ],
    defenderLines: [{ unit: 'snekkja', lost: 2, survived: 0 }],
    attackPower: 120,
    defensePower: 80,
    winner: 'attacker',
  },
  drowned: [{ unit: 'spearman', count: 20 }],
  fireShipsBurned: 20,
  fireSiege: { targetCoord: { q: 5, r: 0 }, targetType: 'harbour', levelBefore: 3, levelAfter: 1, settlementRazed: false },
};

function mountCard(report: BattleReportCardData) {
  return mount(BattleReportCard, {
    props: { report, side: 'attacker', occurredAt: '2026-09-09T10:00:00.000Z' },
    global: { plugins: [createTestI18n({ hud: enHud })] },
  });
}

describe('BattleReportCard', () => {
  it('shows a land army report as one fight with no fight headings and none of the fleet sections', () => {
    const wrapper = mountCard(landReport);

    expect(wrapper.find('[data-testid=ship-fight]').exists()).toBe(false);
    expect(wrapper.find('[data-testid=land-fight] h2').exists()).toBe(false);
    expect(wrapper.find('[data-testid=land-fight]').text()).toContain('750');
    expect(wrapper.find('[data-testid=drowned]').exists()).toBe(false);
    expect(wrapper.find('[data-testid=fire-damage]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Ship fight');
  });

  it('shows a report stored before ships fought separately exactly like a land fight', () => {
    // Older reports have none of the fleet fields at all.
    const { shipFight: _s, drowned: _d, fireShipsBurned: _f, fireSiege: _fs, ...old } = fleetReport;
    const wrapper = mountCard({ ...old, attackerLines: landReport.attackerLines, defenderLines: landReport.defenderLines });

    expect(wrapper.find('[data-testid=ship-fight]').exists()).toBe(false);
    expect(wrapper.find('[data-testid=land-fight] h2').exists()).toBe(false);
    expect(wrapper.find('[data-testid=land-fight] table').exists()).toBe(true);
  });

  it('shows the ship fight first, then the land fight, the drowned and the fire damage', () => {
    const wrapper = mountCard(fleetReport);

    const ship = wrapper.get('[data-testid=ship-fight]');
    expect(ship.get('h2').text()).toBe('Ship fight');
    expect(ship.text()).toContain('Fire Hulk');
    expect(ship.text()).toContain('120');
    expect(ship.text()).toContain('80');

    const land = wrapper.get('[data-testid=land-fight]');
    expect(land.get('h2').text()).toBe('Land fight');
    expect(land.text()).toContain('300');

    // The ship fight comes before the land fight in the document.
    const html = wrapper.html();
    expect(html.indexOf('data-testid="ship-fight"')).toBeLessThan(html.indexOf('data-testid="land-fight"'));

    expect(wrapper.get('[data-testid=drowned]').text()).toContain('20');
    const fire = wrapper.get('[data-testid=fire-damage]').text();
    expect(fire).toContain('20 fire craft burned');
    expect(fire).toContain('Harbour damaged: level 3 → 1');
  });

  it('says there was no land fight when a fleet fought only at sea', () => {
    const wrapper = mountCard({ ...fleetReport, attackerLines: [], defenderLines: [], attackPower: 0, defensePower: 0 });

    expect(wrapper.get('[data-testid=land-fight]').text()).toContain('No land fight was fought.');
    expect(wrapper.find('[data-testid=ship-fight]').exists()).toBe(true);
  });
});
