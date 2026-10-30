import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import en from '../../i18n/locales/en/docs.json';
import de from '../../i18n/locales/de/docs.json';
import { WALL_SIEGE } from './wallSiegeDocs';

describe('WALL_SIEGE', () => {
  it('mirrors the backend: three levels per wall hex (gate included), one level per won siege', () => {
    // BuildingCatalogue.MaxLevelFor: Palisade and PalisadeGate 3; SiegeResolver.LevelsTakenFrom: min(1, levelsDestroyed).
    expect(WALL_SIEGE.levels).toBe(3);
    expect(WALL_SIEGE.levelsPerSiege).toBe(1);
  });

  it.each([
    ['en', en, /\b3\b/],
    ['de', de, /\b3\b/],
  ])('the %s siege text quotes the wall level count', (locale, docs, number) => {
    const i18n = createI18n({ legacy: false, locale, messages: { [locale]: { docs } } });
    const text = i18n.global.t('docs.walls.sieges.rules.level', { levels: WALL_SIEGE.levels });
    expect(text).toMatch(number);
    expect(text).not.toContain('{levels}');
  });
});
