// Vitest setup: in the app the placement rules (terrain, bog kinds, river shapes, ring categories) arrive with the building catalogue
// (`stores/buildingCatalogue.ts`); node tests that place buildings or build the ring expect them synchronously, so register them from
// the bundled catalogue snapshot, the state the app is in once the catalogue has loaded.
import catalogue from '../data/building-catalogue.json';
import { setPlacementRules } from '../lib/map/placementRules';
setPlacementRules(catalogue.data);
