// Guards the exact bug this file's own update history hit once already:
// a new building type needs an entry in *three* separate label/category
// tables (this file's TYPE_LABELS/CATEGORY_OF/GRAPH_CATEGORY_OF, plus
// TechTreeView.vue's own CATEGORY_OF and the i18n docs.buildingTypes) or it
// silently falls back to a capitalized-but-unspaced label ("Cartworkshop")
// and the default 'production' category — wrong, not broken, so nothing
// else catches it.
import { describe, expect, it } from 'vitest';
import { categoryOf, graphCategoryOf, typeLabel } from './buildingPresentation';

const NEW_TYPES = [
  { type: 'meadery', label: 'Meadery', category: 'production', graphCategory: 'production' },
  { type: 'townsquare', label: 'Town square', category: 'production', graphCategory: 'production' },
  { type: 'cropmill', label: 'Crop mill', category: 'production', graphCategory: 'production' },
  { type: 'smithy', label: 'Smithy', category: 'production', graphCategory: 'production' },
  { type: 'druidhut', label: "Druid's hut", category: 'production', graphCategory: 'production' },
  { type: 'cartworkshop', label: 'Cart workshop', category: 'logistics', graphCategory: 'logistics' },
  { type: 'claybrickworks', label: 'Clay brickworks', category: 'production', graphCategory: 'production' },
] as const;

describe('buildingPresentation', () => {
  it.each(NEW_TYPES)('$type has the expected label and category', ({ type, label, category, graphCategory }) => {
    expect(typeLabel(type)).toBe(label);
    expect(categoryOf(type)).toBe(category);
    expect(graphCategoryOf(type)).toBe(graphCategory);
  });
});
