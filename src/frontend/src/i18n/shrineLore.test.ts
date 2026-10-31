// The tech tree's shrine texts once named effects the game does not give
// (Thor raising wood and stone, Njörd raising storage). Each text has to name
// the favour buildingEconomy.ts (and ShrineCatalogue.cs behind it) applies.
import { describe, expect, it } from 'vitest';
import { buildingStatsFor } from '../lib/map/buildingEconomy';
import en from './locales/en/docs.json';
import de from './locales/de/docs.json';

const DOMAIN_WORDS: Record<string, { en: string; de: string }> = {
  landAttack: { en: 'land units', de: 'Landeinheiten' },
  shipAttack: { en: 'ships', de: 'Schiffe' },
  food: { en: 'Food', de: 'Nahrung' },
  wood: { en: 'Wood', de: 'Holz' },
};

describe('shrine texts in the tech tree', () => {
  for (const type of ['shrineofthor', 'shrineoffreyja', 'shrineofullr', 'shrineofnjord'] as const) {
    it(`${type} names the favour the game gives`, () => {
      const modifier = buildingStatsFor(type, 1, 0, false).modifier;
      expect(modifier?.kind).toBe('shrineFavour');
      const words = DOMAIN_WORDS[(modifier as { domain: string }).domain]!;
      expect(en.techTree.lore[type]).toContain(words.en);
      expect(de.techTree.lore[type]).toContain(words.de);
    });
  }

  it('puts the Shrine of Njörd on coastal water, not grass', () => {
    expect(en.techTree.lore.shrineofnjord).toContain('coastal water');
    expect(en.techTree.lore.shrineofnjord).not.toContain('grass');
    expect(de.techTree.lore.shrineofnjord).toContain('Küstenwasser');
  });
});
