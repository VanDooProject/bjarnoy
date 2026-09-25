// Guards the exact bug this file's own update history hit once already:
// a new building type needs an entry in *two* separate label/category
// tables (this file's TYPE_LABELS/GRAPH_CATEGORY_OF, plus the i18n
// docs.buildingTypes) or it silently falls back to a capitalized-but-
// unspaced label ("Cartworkshop") and the default 'production' category —
// wrong, not broken, so nothing else catches it. TechTreeView.vue used to
// keep its own separate copy of the category table for its page sections;
// that's gone now (see GRAPH_CATEGORY_ORDER's own comment) so there's only
// the one table left to drift.
import { describe, expect, it } from 'vitest';
import { graphCategoryOf, typeLabel } from './buildingPresentation';

const NEW_TYPES = [
  { type: 'meadery', label: 'Meadery', graphCategory: 'production' },
  { type: 'townsquare', label: 'Town square', graphCategory: 'logistics' },
  { type: 'cropmill', label: 'Crop mill', graphCategory: 'production' },
  { type: 'smithy', label: 'Smithy', graphCategory: 'military' },
  { type: 'druidhut', label: "Druid's hut", graphCategory: 'logistics' },
  { type: 'cartworkshop', label: 'Cart workshop', graphCategory: 'logistics' },
  { type: 'claybrickworks', label: 'Clay brickworks', graphCategory: 'production' },
] as const;

describe('buildingPresentation', () => {
  it.each(NEW_TYPES)('$type has the expected label and category', ({ type, label, graphCategory }) => {
    expect(typeLabel(type)).toBe(label);
    expect(graphCategoryOf(type)).toBe(graphCategory);
  });

  it('every shrine gets the religion category, not the production fallback', () => {
    for (const type of ['shrineofthor', 'shrineoffreyja', 'shrineofullr', 'shrineofnjord']) {
      expect(graphCategoryOf(type)).toBe('religion');
    }
  });
});
