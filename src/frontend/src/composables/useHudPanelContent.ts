// Whether each dockable HUD panel has something to show. The one place for these rules: a panel renders only when its flag
// is true (it unmounts, animated, when its data runs out), and the panel column shows an icon for it only then (an icon
// that could do nothing is left out, ui-guidelines section 1). The one exception is the Construction icon: the column always
// has it, disabled and dimmed while there are no build orders, but the panel itself still renders only with orders.
import { computed, type ComputedRef } from 'vue';
import { useWorldStore } from '../stores/world';
import type { HudPanelId } from '../lib/hud/hudPanelDock';
import { useBuildOrders, useTrainingOrders } from './useQueueOrders';
import { useQuests } from './useQuests';

/** A dispatch, field order or army picker is being composed: the map is in a pick mode and the phone's quest strip steps aside. */
export function useHasActiveDraft(): ComputedRef<boolean> {
  const world = useWorldStore();
  return computed(() => !!(world.dispatchDraft || world.fieldOrderDraft || world.sendPicker));
}

export function useHudPanelContent(): Record<HudPanelId, ComputedRef<boolean>> {
  const world = useWorldStore();
  const buildOrders = useBuildOrders();
  const trainingOrders = useTrainingOrders();
  const { current } = useQuests();
  const hasActiveDraft = useHasActiveDraft();
  return {
    construction: computed(() => buildOrders.value.length > 0),
    // The Garrison panel: the training queue, the troops at home and the guest armies.
    garrison: computed(() => trainingOrders.value.length > 0 || world.hud.garrison.some((g) => g.count > 0) || world.guestArmies.length > 0),
    // Always something to show: the dispatch button, or the armies on the road.
    armies: computed(() => true),
    quests: computed(() => !!current.value && !hasActiveDraft.value),
  };
}

/**
 * The number on a collapsed panel's icon: build orders, the settlement's own armies on the road, quests ready to claim.
 * The Garrison icon has none (always 0). One place, so the column and its tests read the same numbers.
 */
export function useHudPanelCounts(): Record<HudPanelId, ComputedRef<number>> {
  const world = useWorldStore();
  const buildOrders = useBuildOrders();
  const { claimable } = useQuests();
  return {
    construction: computed(() => buildOrders.value.length),
    garrison: computed(() => 0),
    armies: computed(() => world.armies.filter((a) => a.movement !== null).length),
    quests: computed(() => claimable.value.length),
  };
}
