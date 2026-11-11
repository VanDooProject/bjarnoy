// The unit rows of a dispatch draft, shared by ArmyPanel.vue and MobileDispatchSheet.vue so both surfaces gate the same way:
// a selection with ships is a fleet and may carry land units as passengers up to the ships' slots (`exceedsShipCapacity`);
// a founding convoy is its five settlers (that row stays locked) plus any ships and land escorts, picked like in a move;
// a camp army is its two camp builders (locked likewise) plus ships and escorts;
// a hunt takes land units against a land camp, against a camp at sea (the whale road) a fleet, and against a sand camp (a
// haul-out) land units, which a fleet may carry: its ships take no part, so it needs land troops aboard.
import { computed, type ComputedRef } from 'vue';
import { useWorldStore } from '../stores/world';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { isSandCampFamily, isWaterCampFamily } from '../lib/map/campPlacement';
import { classifyUnitSelection, exceedsShipCapacity, fleetLacksLandTroops, isHuntUnit } from '../lib/units/armyDispatch';

export function useDispatchUnitPicker(garrisonRows: ComputedRef<ReadonlyArray<{ unit: string }>>) {
  const world = useWorldStore();
  const catalogue = useUnitCatalogueStore();

  const draft = computed(() => world.dispatchDraft);
  const unitCounts = computed(() => draft.value?.unitCounts ?? {});
  const isHunt = computed(() => draft.value?.mission === 'hunt');
  const isFound = computed(() => draft.value?.mission === 'found');
  const isCamp = computed(() => draft.value?.mission === 'setupcamp');

  // The hunt target is a camp on the sea (the whale road): a fleet goes.
  const huntCamp = computed(() => {
    void world.campStatesVersion;
    const target = draft.value?.targetCamp;
    return target ? world.model.campAt(target) : undefined;
  });
  const huntAtSea = computed(() => !!huntCamp.value && isWaterCampFamily(huntCamp.value.family));
  // The hunt target is a sand camp: ships are selectable as carriers, but a fleet needs land troops aboard.
  const huntOnSand = computed(() => !!huntCamp.value && isSandCampFamily(huntCamp.value.family));
  const selectionKind = computed(() => classifyUnitSelection(unitCounts.value, catalogue.byType));

  function isRowSelectable(unit: string): boolean {
    if (isFound.value && unit === 'settler') return false;
    if (isCamp.value && unit === 'campbuilder') return false;
    return !isHunt.value || isHuntUnit(unit, catalogue.byType, huntAtSea.value, huntOnSand.value);
  }
  // Ships sit greyed out in the list of a hunt on land: only then is there anything to explain.
  const hasLockedOutUnits = computed(() => isHunt.value && garrisonRows.value.some((row) => !isRowSelectable(row.unit)));
  const overCapacity = computed(() => exceedsShipCapacity(unitCounts.value, catalogue.byType));
  // A hunt at a sand camp with ships selected and no land troops aboard: the ships do not fight (`HuntRequiresLandUnits`).
  const sandHuntLacksTroops = computed(
    () => isHunt.value && huntOnSand.value && fleetLacksLandTroops(unitCounts.value, catalogue.byType),
  );
  // A hunt at sea needs at least one ship in the selection; passengers alone cannot sail.
  const selectionSendable = computed(
    () =>
      !overCapacity.value &&
      !sandHuntLacksTroops.value &&
      !(isHunt.value && huntAtSea.value && selectionKind.value !== 'fleet'),
  );

  return {
    isFound,
    isCamp,
    huntAtSea,
    huntOnSand,
    selectionKind,
    isRowSelectable,
    hasLockedOutUnits,
    sandHuntLacksTroops,
    overCapacity,
    selectionSendable,
  };
}
