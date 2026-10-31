import { describe, expect, it } from 'vitest';
import { i18n } from '../../i18n';
import type { BuildingModifier, BuildingOutput } from './buildingEconomy';
import { formatBuildingModifier, formatBuildingOutput, type StatsTranslate } from './buildingStatsText';

const en: StatsTranslate = (key, named) => i18n.global.t(key, named ?? {}, { locale: 'en' }) as string;
const de: StatsTranslate = (key, named) => i18n.global.t(key, named ?? {}, { locale: 'de' }) as string;

// Record<kind, ...> makes TypeScript fail here when a kind is added to (or
// removed from) the unions without a case, and the loops below then fail at
// runtime when the new kind has no text.
const OUTPUTS: { [K in BuildingOutput['kind']]: [Extract<BuildingOutput, { kind: K }>, string][] } = {
  resourceRate: [
    [{ kind: 'resourceRate', resource: 'wood', amount: 40 }, '+40 Wood/h'],
    [{ kind: 'resourceRate', resource: 'iron', amount: 5 }, '+5 Iron/h'],
  ],
  populationCapacity: [[{ kind: 'populationCapacity', amount: 12 }, '+12 population capacity']],
  storageCapacity: [[{ kind: 'storageCapacity', amount: 600 }, '+600 storage capacity']],
  visionRing: [[{ kind: 'visionRing', amount: 3, explored: 2 }, 'Vision radius 3 (explored 2)']],
};

const MODIFIERS: { [K in BuildingModifier['kind']]: [Extract<BuildingModifier, { kind: K }>, string][] } = {
  borderAnchor: [[{ kind: 'borderAnchor' }, 'Border anchor']],
  trainsLandTroops: [[{ kind: 'trainsLandTroops' }, 'Trains land troops']],
  trainsShips: [[{ kind: 'trainsShips' }, 'Trains ships']],
  trainsCivilianCrews: [[{ kind: 'trainsCivilianCrews' }, 'Trains provisioners/settler crews']],
  terrainBoost: [[{ kind: 'terrainBoost', terrain: 'forest', percent: 20 }, 'Forest (+20%)']],
  coastal: [
    [{ kind: 'coastal' }, 'Coastal'],
    [{ kind: 'coastal', percent: 15 }, 'Coastal (+15%)'],
  ],
  shrineFavour: [
    [{ kind: 'shrineFavour', domain: 'wood', percent: 10 }, '+10% Wood production'],
    [{ kind: 'shrineFavour', domain: 'food', percent: 10 }, '+10% Food production'],
    [{ kind: 'shrineFavour', domain: 'landAttack', percent: 5 }, '+5% land unit attack'],
    [{ kind: 'shrineFavour', domain: 'shipAttack', percent: 5 }, '+5% ship attack'],
  ],
  odinFavour: [[{ kind: 'odinFavour', buildTimePercent: 2, visionRings: 2 }, '-2% build time, +2 rings of vision']],
  radiusBoost: [
    [{ kind: 'radiusBoost', resource: 'wood', percent: 10, range: 2 }, '+10% Wood to buildings within 2 rings'],
    [{ kind: 'radiusBoost', resource: 'iron', percent: 10, range: 2 }, '+10% Iron to buildings within 2 rings'],
    [{ kind: 'radiusBoost', resource: 'food', percent: 10, range: 2 }, '+10% Food to buildings within 2 rings'],
    // A level 1-4 mill reaches a single ring: singular, not "1 rings".
    [{ kind: 'radiusBoost', resource: 'wood', percent: 5, range: 1 }, '+5% Wood to buildings within 1 ring'],
  ],
  palisadeWall: [[{ kind: 'palisadeWall' }, 'Blocks every land army (a lone end is half open)']],
  palisadeGate: [[{ kind: 'palisadeGate' }, "Open to its owner's armies, its owner's guild and guilds at peace with it"]],
  bridge: [0, 1, 2, 3, 4].map((level) => [{ kind: 'bridge', level }, en(`hud.hoverTooltip.bridgeLevel${level}`)] as [Extract<BuildingModifier, { kind: 'bridge' }>, string]),
};

describe('formatBuildingOutput', () => {
  for (const [kind, cases] of Object.entries(OUTPUTS)) {
    it(`words every ${kind} output`, () => {
      expect(cases.length).toBeGreaterThan(0);
      for (const [output, text] of cases) expect(formatBuildingOutput(output, en)).toBe(text);
    });
  }
});

describe('formatBuildingModifier', () => {
  for (const [kind, cases] of Object.entries(MODIFIERS)) {
    it(`words every ${kind} modifier`, () => {
      expect(cases.length).toBeGreaterThan(0);
      for (const [modifier, text] of cases) {
        expect(text).not.toMatch(/^hud\./);
        expect(formatBuildingModifier(modifier, en)).toBe(text);
      }
    });
  }

  it('follows the translate function it is given', () => {
    expect(formatBuildingModifier({ kind: 'trainsShips' }, de)).not.toBe('Trains ships');
    expect(formatBuildingOutput({ kind: 'storageCapacity', amount: 600 }, de)).not.toBe('+600 storage capacity');
  });
});
