import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuickUpgradeStore } from '../stores/quickUpgrade';

/** Elements marked with this attribute keep the quick upgrade mode on when pressed (the status chip, the build queue). */
export const QUICK_UPGRADE_KEEP_ATTR = 'data-quick-upgrade-keep';

export interface QuickUpgradeInputHost {
  /** The map's own element (the canvas container): a press inside it does not end the mode. */
  mapElement: () => Element | null | undefined;
  /** The ring menu is open: Esc is the ring's then. */
  ringOpen: () => boolean;
  /** The settlement view is showing (not the world map). */
  inSettlement: () => boolean;
  /** The selected settlement. */
  settlementId: () => string | null;
}

/**
 * Everything that feeds or ends the quick upgrade mode apart from the map's own long press (which MapView wires to
 * `stop()`): the Shift key for the desktop shortcut, and every way out of the mode. One capture-phase `pointerdown` covers
 * modals, the army box, the ring's bubbles and the rest of the HUD at once: a press anywhere but the map (or an element marked
 * `data-quick-upgrade-keep`) ends it, so no component needs to know about the mode. Esc ends it unless the ring is open (the
 * ring handles its own Esc). Leaving the settlement view, switching the settlement, any route change and unmounting end it too.
 * Shift is reset when the window loses focus or the tab is hidden, where the key-up would never arrive.
 */
export function useQuickUpgradeInput(host: QuickUpgradeInputHost) {
  const quick = useQuickUpgradeStore();
  const router = useRouter();

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Shift') quick.setShift(true);
    else if (e.key === 'Escape' && quick.on && !host.ringOpen()) quick.stop();
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.key === 'Shift') quick.setShift(false);
  }
  function releaseShift() {
    quick.setShift(false);
  }
  function onPointerDown(e: PointerEvent) {
    // The modifier as the press itself reports it: right even if the key-down happened while the window was not listening.
    if (typeof e.shiftKey === 'boolean') quick.setShift(e.shiftKey);
    if (!quick.on) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest(`[${QUICK_UPGRADE_KEEP_ATTR}]`)) return;
    const map = host.mapElement();
    if (map && map.contains(target)) return;
    quick.stop();
  }
  function onVisibility() {
    if (document.visibilityState === 'hidden') releaseShift();
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseShift);
    window.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('visibilitychange', onVisibility);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', releaseShift);
    window.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('visibilitychange', onVisibility);
    quick.stop();
    releaseShift();
  });

  watch(
    () => host.inSettlement(),
    (inSettlement) => {
      if (!inSettlement) quick.stop();
    },
  );
  watch(host.settlementId, () => quick.stop());
  watch(
    () => router.currentRoute.value.fullPath,
    () => quick.stop(),
  );
}
