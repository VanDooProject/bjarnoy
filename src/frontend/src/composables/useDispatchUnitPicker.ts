// The unit rows of a dispatch draft, shared by ArmyPanel.vue and MobileDispatchSheet.vue so both surfaces gate the same way:
// a selection with ships is a fleet and may carry land units as passengers up to the ships' slots (`exceedsShipCapacity`);
// a founding convoy is its five settlers and nothing else (founding by sea is not offered yet);
// a hunt takes land units against a land camp, and against a camp at sea (the whale road) a fleet.
import { computed, type ComputedRef } from 'vue';
import { useWorldStore } from '../stores/world';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { isWaterCampFamily } from '../lib/map/campPlacement';
import { classifyUnitSelection, exceedsShipCapacity, isHuntUnit } from '../lib/units/armyDispatch';

export function useDispatchUnitPicker(garrisonRows: ComputedRef<ReadonlyArray<{ unit: string }>>) {
  const world = useWorldStore();
  const catalogue = useUnitCatalogueStore();

  const draft = computed(() => world.dispatchDraft);
  const unitCounts = computed(() => draft.value?.unitCounts ?? {});
  const isHunt = computed(() => draft.value?.mission === 'hunt');
  const isFound = computed(() => draft.value?.mission === 'found');

  // The hunt target is a camp on the sea (the whale road): a fleet goes.
  const huntAtSea = computed(() => {
    void world.campStatesVersion;
    const target = draft.value?.targetCamp;
    const camp = target ? world.model.campAt(target) : undefined;
    return !!camp && isWaterCampFamily(camp.family);
  });
  const selectionKind = computed(() => classifyUnitSelection(unitCounts.value, catalogue.byType));

  function isRowSelectable(unit: string): boolean {
    if (isFound.value) return false;
    return !isHunt.value || isHuntUnit(unit, catalogue.byType, huntAtSea.value);
  }
  // Ships sit greyed out in the list of a hunt on land: only then is there anything to explain.
  const hasLockedOutUnits = computed(() => isHunt.value && garrisonRows.value.some((row) => !isRowSelectable(row.unit)));
  const overCapacity = computed(() => exceedsShipCapacity(unitCounts.value, catalogue.byType));
  // A hunt at sea needs at least one ship in the selection; passengers alone cannot sail.
  const selectionSendable = computed(
    () => !overCapacity.value && !(isHunt.value && huntAtSea.value && selectionKind.value !== 'fleet'),
  );

  return { isFound, huntAtSea, selectionKind, isRowSelectable, hasLockedOutUnits, overCapacity, selectionSendable };
}
