// Drag-to-dock for the desktop HUD panels (components/hud/HudPanelDock.vue) and the one enter / leave / snap motion all four
// share. A press on a panel's header (`[data-dock-handle]` inside the panel's `[data-hud-panel]` slot) starts a drag after
// 4px; the slot follows the pointer, and on release the panel snaps to the corner whose quadrant of the map area holds its
// centre (lib/hud/hudPanelDock.ts). Esc or a cancelled pointer puts it back. The snap runs from the drop rectangle to the
// new slot (FLIP) — only when motion is on; with motion off everything is instant.
import { nextTick, onUnmounted, ref, type Ref } from 'vue';
import { animate, motionEnabled } from '../lib/motion';
import { nearestCorner, type DockCorner, type HudPanelId } from '../lib/hud/hudPanelDock';
import { useHudPrefsStore } from '../stores/hudPrefs';

/** Movement below this is a click on the header, not a drag. */
export const DRAG_THRESHOLD_PX = 4;
const SNAP_MS = 180;
const FADE_MS = 160;
/** How far a panel slides toward its corner while it fades in or out. */
const SLIDE_PX = 16;

const INTERACTIVE = 'button, a, input, select, textarea, [role="button"]';

export function useHudPanelDock(area: Ref<HTMLElement | null>) {
  const prefs = useHudPrefsStore();
  const dragging = ref<HudPanelId | null>(null);

  /** The rectangle a dropped panel left, for the new slot to animate from. */
  let pendingSnap: { id: HudPanelId; from: DOMRect } | null = null;
  /** Set while a drop moves a panel to another corner: the slot is re-created there, which is no enter or leave. */
  let moving = false;

  let session: { id: HudPanelId; slot: HTMLElement; x: number; y: number; started: boolean } | null = null;

  function offset(e: PointerEvent) {
    return { dx: e.clientX - session!.x, dy: e.clientY - session!.y };
  }

  function onMove(e: PointerEvent) {
    if (!session) return;
    const { dx, dy } = offset(e);
    if (!session.started) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      session.started = true;
      dragging.value = session.id;
      session.slot.style.zIndex = '30';
    }
    session.slot.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function stopListening() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
  }

  /** Slides the slot from where it was dropped back to its own spot, then clears the drag styles. */
  async function settleInPlace(slot: HTMLElement, from: string) {
    slot.style.transform = '';
    if (motionEnabled()) await animate(slot, [{ transform: from }, { transform: 'translate(0, 0)' }], { duration: SNAP_MS, easing: 'ease-out' });
    slot.style.zIndex = '';
  }

  function cancel() {
    const s = session;
    session = null;
    stopListening();
    if (!s?.started) return;
    const from = s.slot.style.transform;
    dragging.value = null;
    void settleInPlace(s.slot, from);
  }

  function onUp(e: PointerEvent) {
    const s = session;
    if (!s) return;
    if (!s.started) {
      session = null;
      stopListening();
      return;
    }
    const { dx, dy } = offset(e);
    session = null;
    stopListening();
    dragging.value = null;
    const dropRect = s.slot.getBoundingClientRect();
    const areaRect = area.value?.getBoundingClientRect();
    const corner: DockCorner = areaRect
      ? nearestCorner({ x: dropRect.left + dropRect.width / 2, y: dropRect.top + dropRect.height / 2 }, areaRect)
      : prefs.panels[s.id].corner;
    if (corner === prefs.panels[s.id].corner) {
      void settleInPlace(s.slot, `translate(${dx}px, ${dy}px)`);
      return;
    }
    moving = true;
    pendingSnap = { id: s.id, from: dropRect };
    prefs.setPanelCorner(s.id, corner);
    void nextTick(() => {
      moving = false;
      pendingSnap = null;
    });
  }

  const onCancel = () => cancel();
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') cancel();
  }

  /** Delegated from the dock: a left-button press on a panel's header (not on a control inside it). */
  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || session) return;
    const target = e.target instanceof Element ? e.target : null;
    const handle = target?.closest('[data-dock-handle]');
    if (!target || !handle || target.closest(INTERACTIVE)) return;
    const slot = handle.closest<HTMLElement>('[data-hud-panel]');
    const id = slot?.dataset.hudPanel as HudPanelId | undefined;
    if (!slot || !id) return;
    session = { id, slot, x: e.clientX, y: e.clientY, started: false };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
  }

  onUnmounted(() => {
    session = null;
    stopListening();
  });

  // ---- the shared transition of every panel slot (TransitionGroup hooks) ----

  const towardCorner = (el: Element) => ((el as HTMLElement).dataset.corner?.endsWith('left') ? -SLIDE_PX : SLIDE_PX);

  function onEnter(el: Element, done: () => void) {
    const snap = pendingSnap && (el as HTMLElement).dataset.hudPanel === pendingSnap.id ? pendingSnap : null;
    if (snap) {
      pendingSnap = null;
      const now = el.getBoundingClientRect();
      void animate(el, [{ transform: `translate(${snap.from.left - now.left}px, ${snap.from.top - now.top}px)` }, { transform: 'translate(0, 0)' }], {
        duration: SNAP_MS,
        easing: 'ease-out',
      }).then(done, done);
      return;
    }
    void animate(
      el,
      [
        { opacity: 0, transform: `translateX(${towardCorner(el)}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: FADE_MS, easing: 'ease-out' },
    ).then(done, done);
  }

  function onLeave(el: Element, done: () => void) {
    if (moving) return done();
    void animate(
      el,
      [
        { opacity: 1, transform: 'translateX(0)' },
        { opacity: 0, transform: `translateX(${towardCorner(el)}px)` },
      ],
      { duration: FADE_MS, easing: 'ease-in', fill: 'forwards' },
    ).then(done, done);
  }

  return { dragging, onPointerDown, onEnter, onLeave };
}
