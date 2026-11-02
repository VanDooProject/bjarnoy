// The target-building picker of a dispatch draft, shared by ArmyPanel.vue and MobileDispatchSheet.vue so both
// surfaces offer the same rows and apply the same rule: a fleet attack must name one building on the target's
// shore (only shore buildings are offered), a land attack may name one for its siege engines, and
// then only the buildings the selected engines can damage can be picked.
import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../stores/world';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import type { MessageSchema } from '../i18n/schema';
import { buildingLabel } from '../lib/units/battleReports';
import { canSiegeDamage, classifyUnitSelection, shoreBuildings, targetBuildingPickerMode } from '../lib/units/armyDispatch';

export function useDispatchTargetBuilding(hasTargetSettlement: ComputedRef<boolean>) {
  const world = useWorldStore();
  const catalogue = useUnitCatalogueStore();
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

  const draft = computed(() => world.dispatchDraft);
  const mode = computed(() =>
    targetBuildingPickerMode(
      draft.value?.mission,
      hasTargetSettlement.value,
      draft.value?.unitCounts ?? {},
      catalogue.byType,
      classifyUnitSelection(draft.value?.unitCounts ?? {}, catalogue.byType),
    ),
  );
  const showPicker = computed(() => mode.value !== 'none');
  const isRequired = computed(() => mode.value === 'required');

  const rows = computed(() => {
    if (!draft.value?.targetSettlementId) return [];
    if (world.dispatchTargetBuildingsFor !== draft.value.targetSettlementId) return [];
    const all = world.dispatchTargetBuildings ?? [];
    return (isRequired.value ? shoreBuildings(all, world.model) : all).map((b) => ({
      q: b.q,
      r: b.r,
      label: buildingLabel(b.type),
      level: b.level,
      // Whether the selected engines can damage this kind of building: rams breach walls and towers, catapults burn towers
      // and the rest, ships whatever shore building they are sent at.
      damageable: canSiegeDamage(draft.value?.unitCounts ?? {}, catalogue.byType, b.type),
    }));
  });
  const selectedLabel = computed(() => {
    const coord = draft.value?.targetBuildingCoord;
    if (!coord) return null;
    const row = rows.value.find((b) => b.q === coord.q && b.r === coord.r);
    return row
      ? `${row.label} (${t('hud.armyPanel.buildingLevelCoord', { level: row.level, q: coord.q, r: coord.r })})`
      : `(${coord.q}, ${coord.r})`;
  });
  // The preferred target can be set before the engines are (the ring's Siege action pre-selects a wall): say so when the selected
  // engines cannot damage it, since the siege would then do nothing.
  const selectedUnreachable = computed(() => {
    const coord = draft.value?.targetBuildingCoord;
    if (!coord) return false;
    const row = rows.value.find((b) => b.q === coord.q && b.r === coord.r);
    return !!row && !row.damageable;
  });
  /** A fleet cannot be sent without a building: the dispatch button waits for the pick. */
  const isMissingRequiredPick = computed(() => isRequired.value && !draft.value?.targetBuildingCoord);

  function pick(q: number, r: number) {
    world.setDispatchTargetBuilding({ q, r });
  }
  function clear() {
    world.setDispatchTargetBuilding(null);
  }

  return { showPicker, isRequired, rows, selectedLabel, selectedUnreachable, isMissingRequiredPick, pick, clear };
}
