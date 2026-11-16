// @vitest-environment jsdom
//
// Real-DOM render check for ArmyReportCard.vue: the banner and text per kind (stuck / starved) with the hex
// filled in, and the troops table headed "lost" for a starved army and "in the army" for a stuck one.
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ArmyReportCard from './ArmyReportCard.vue';
import type { ArmyReportResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enReports from '../../i18n/locales/en/reports.json';

const base: ArmyReportResponse = {
  id: 'r1',
  kind: 'starved',
  occurredAt: '2026-09-09T10:00:00.000Z',
  armyId: 'a1',
  hex: { q: 4, r: -2 },
  mission: 'move',
  units: [{ type: 'axeman', count: 12 }],
};

function mountCard(report: ArmyReportResponse) {
  return mount(ArmyReportCard, { props: { report }, global: { plugins: [createTestI18n({ reports: enReports })] } });
}

describe('ArmyReportCard', () => {
  it('shows a starved army: where it died and the troops lost', () => {
    const w = mountCard(base);
    expect(w.find('.banner').text()).toBe('Army starved');
    expect(w.find('[data-testid="army-report-text"]').text()).toBe(
      'Army starved at (4, -2). Its food ran out and it could not get home.',
    );
    expect(w.find('[data-testid="army-report-units"] h3').text()).toBe('Troops lost');
    expect(w.find('[data-testid="army-report-units"] tbody tr').text()).toContain('12');
    w.unmount();
  });

  it('shows a stuck army: where it stopped and the troops in the army', () => {
    const w = mountCard({ ...base, kind: 'stuck' });
    expect(w.find('.banner').text()).toBe('Army stuck');
    expect(w.find('[data-testid="army-report-text"]').text()).toBe('Army stuck: a wall blocks its way. It stopped at (4, -2).');
    expect(w.find('[data-testid="army-report-units"] h3').text()).toBe('Troops in the army');
    w.unmount();
  });
});
