import { onUnmounted } from 'vue';
import { useWorldStore } from '../stores/world';
import { DOUBLE_TAP_MS, isDoubleTap, type Tap } from '../lib/map/doubleTap';

/**
 * Tap/click behaviour of an army row of the desktop panel (ArmyPanel). The phone drawer has no double tap: a tap there opens
 * the army's detail, with "Show on map" in it.
 *
 * - A tap on an unselected row selects the army at once (route on the map).
 * - A tap on the selected row deselects it, but only after DOUBLE_TAP_MS
 *   without a second tap: the first tap of a double tap must not clear the
 *   selection, or the route flickers off and back on.
 * - A double tap (the shared `isDoubleTap` rule, same as the map's
 *   double-tap zoom, on the same army) cancels the pending deselect, makes
 *   sure the army is selected and calls `onDoubleTap`.
 * - A tap on another row supersedes the pending deselect of the previous one.
 */
export function useArmyRowTap(onDoubleTap: (armyId: string) => void) {
  const world = useWorldStore();
  let lastTap: { armyId: string; tap: Tap } | null = null;
  let pendingDeselect: ReturnType<typeof setTimeout> | null = null;

  function cancelPendingDeselect() {
    if (pendingDeselect !== null) {
      clearTimeout(pendingDeselect);
      pendingDeselect = null;
    }
  }

  function onRowClick(armyId: string, event: MouseEvent) {
    const tap: Tap = { at: { x: event.clientX, y: event.clientY }, timeMs: event.timeStamp };
    cancelPendingDeselect();
    if (lastTap && lastTap.armyId === armyId && isDoubleTap(lastTap.tap, tap)) {
      lastTap = null;
      if (world.selectedArmyId !== armyId) world.selectArmy(armyId);
      onDoubleTap(armyId);
      return;
    }
    lastTap = { armyId, tap };
    if (world.selectedArmyId === armyId) {
      pendingDeselect = setTimeout(() => {
        pendingDeselect = null;
        if (world.selectedArmyId === armyId) world.clearSelectedArmy();
      }, DOUBLE_TAP_MS);
    } else {
      world.selectArmy(armyId);
    }
  }

  onUnmounted(cancelPendingDeselect);

  return onRowClick;
}
