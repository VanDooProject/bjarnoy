import { afterEach, describe, expect, it } from 'vitest';
import catalogue from '../../data/building-catalogue.json';
import type { BuildingDefinitionResponse } from '../../api/types';
import { categoriesFor } from '../../composables/useBuildRing';
import { buildingAllowedOnHex, isBogBoundBuilding, isLakeShoreHut, isWaterOnlyBuilding, newPlacementDisabled, riverBuildingAllowedHere } from './ringCatalogue';
import { placementRuleFor, setPlacementRules } from './placementRules';
import type { Tile } from './types';

const SNAPSHOT = catalogue.data as unknown as BuildingDefinitionResponse[];
const types = (tile: Partial<Tile>) => categoriesFor(tile as Tile).flatMap((c) => c.buildings.map((b) => b.type));

// The suite's setup registers the snapshot; every test here that swaps the rules puts it back.
afterEach(() => setPlacementRules(SNAPSHOT));

describe('the placement rules come from the building catalogue', () => {
  it('registers the level-1 entry of every catalogue building, plus the demo-only hut', () => {
    expect(placementRuleFor('tower')).toMatchObject({ category: 'defense', alsoOnBogKinds: ['bog'] });
    expect(placementRuleFor('hammerschmiede')).toMatchObject({ requiresBogKinds: ['creek'] });
    expect(placementRuleFor('fishinghut')).toMatchObject({ requiresCoastalWater: true, lakeShoreKinds: ['half'] });
    expect(placementRuleFor('sawmill')).toMatchObject({ requiresRiverShapes: ['bend', 'bend60', 'straight'], excludedRiverVariants: ['loop'] });
    expect(placementRuleFor('hut')).toMatchObject({ category: null, allowedTerrain: ['grass'] });
    expect(placementRuleFor('nonsense')).toBeUndefined();
  });

  it('refuses everything until a catalogue has been registered', () => {
    setPlacementRules([]);
    expect(buildingAllowedOnHex('farm', { terrain: 'grass' })).toBe(false);
    expect(types({ terrain: 'grass' })).toEqual([]);
  });

  it('follows a changed terrain rule with no client change: a smithy the catalogue allows on sand is offered there', () => {
    expect(types({ terrain: 'sand' })).not.toContain('smithy');
    setPlacementRules(SNAPSHOT.map((d) => (d.type === 'smithy' ? { ...d, allowedTerrain: ['grass', 'sand'] } : d)));
    expect(buildingAllowedOnHex('smithy', { terrain: 'sand' })).toBe(true);
    expect(types({ terrain: 'sand' })).toContain('smithy');
  });

  it('lists a building the catalogue adds in its ring category and order, with no client change', () => {
    const farm = SNAPSHOT.find((d) => d.type === 'farm' && d.level === 1)!;
    setPlacementRules([...SNAPSHOT, { ...farm, type: 'newfarm', ringCategory: 'resource', ringOrder: -1 }]);
    const resource = categoriesFor({ terrain: 'grass' } as Tile).find((c) => c.id === 'resource')!;
    expect(resource.buildings[0].type).toBe('newfarm');
  });

  it('orders the categories (water first) and the buildings by the catalogue\'s ring order', () => {
    expect(categoriesFor({ terrain: 'grass' } as Tile).map((c) => c.id)).toEqual(['resource', 'military', 'logistics', 'defense', 'religion']);
    expect(categoriesFor({ terrain: 'sea', isCoastalWater: true } as Tile).map((c) => c.id)).toEqual(['water', 'defense']);
    expect(categoriesFor({ terrain: 'grass' } as Tile).find((c) => c.id === 'military')!.buildings.map((b) => b.type)).toEqual([
      'archeryrange',
      'siegeworkshop',
      'barracks',
      'smithy',
    ]);
  });

  it('keeps off the ring what the catalogue switches off, and shows the sea only its own buildings', () => {
    expect(newPlacementDisabled('quarry')).toBe(true);
    expect(types({ terrain: 'mountain' })).toEqual([]);
    expect(types({ terrain: 'sea', isCoastalWater: true }).sort()).toEqual(['fishinghut', 'harbour', 'palisade', 'shipyard', 'shrineofnjord']);
  });

  it('answers the bog, water and river questions from the same rules', () => {
    expect(isBogBoundBuilding('claybrickworks')).toBe(true);
    expect(isBogBoundBuilding('farm')).toBe(false);
    expect(isWaterOnlyBuilding('harbour')).toBe(true);
    expect(isLakeShoreHut({ buildingType: 'fishinghut', bog: { kind: 'half' } })).toBe(true);
    expect(isLakeShoreHut({ buildingType: 'fishinghut' })).toBe(false);
    expect(riverBuildingAllowedHere('cropmill', 'straight')).toBe(true);
    expect(riverBuildingAllowedHere('cropmill', 'bend')).toBe(false);
    expect(riverBuildingAllowedHere('sawmill', 'bend60', 'loop')).toBe(false);
  });
});
