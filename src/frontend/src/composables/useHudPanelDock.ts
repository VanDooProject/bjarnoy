// Drag-to-dock for the desktop HUD panels (components/hud/HudPanelDock.vue) and the one enter / leave / snap motion all four
// share. A press on a panel's header (`[data-dock-handle]` inside the panel's `[data-hud-panel]` slot) starts a drag after
// 4px; the slot follows the pointer while a bar (`indicator`) shows where it would land, and on release the panel snaps into
// the column group the drop target names (lib/hud/hudPanelDock.ts). Esc or a cancelled pointer puts it back. The snap runs
// from the drop rectangle to the new slot (FLIP) — only when motion is on; with motion off everything is instant.
import { nextTick, onUnmounted, ref, type Ref } from 'vue';
import { animate, motionEnabled } from '../lib/motion';
import {
  DOCK_COLUMN_GAP,
  DOCK_GUTTER,
  DOCK_STACK_GAP,
  dropTarget,
  type ColumnGeom,
  type DockSide,
  type DropTarget,
  type HudPanelId,
} from '../lib/hud/hudPanelDock';
import { useHudPrefsStore } from '../stores/hudPrefs';

/** Movement below this is a click on the header, not a drag. */
export const DRAG_THRESHOLD_PX = 4;
const SNAP_MS = 180;
const FADE_MS = 160;
/** How far a panel slides toward its screen edge while it fades in or out. */
const SLIDE_PX = 16;
const INDICATOR_PX = 3;

/** The drop bar, in px relative to the dock's top left. */
export interface DropIndicator {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Layout {
  sides: Record<DockSide, ColumnGeom[]>;
  columns: Map<string, DOMRect>;
  slots: Map<HudPanelId, DOMRect>;
  sideRects: Partial<Record<DockSide, DOMRect>>;
}

const INTERACTIVE = 'button, a, input, select, textarea, [role="button"]';

export function useHudPanelDock(area: Ref<HTMLElement | null>) {
  const prefs = useHudPrefsStore();
  const dragging = ref<HudPanelId | null>(null);
  const indicator = ref<DropIndicator | null>(null);

  /** The rectangle a dropped panel left, for the new slot to animate from. */
  let pendingSnap: { id: HudPanelId; from: DOMRect } | null = null;
  /** Set while a drop moves a panel to another group: the slot is re-created there, which is no enter or leave. */
  let moving = false;

  let session: { id: HudPanelId; slot: HTMLElement; x: number; y: number; started: boolean } | null = null;

  function offset(e: PointerEvent) {
    return { dx: e.clientX - session!.x, dy: e.clientY - session!.y };
  }

  /** The columns, their panels and the side containers as they are laid out right now, without the dragged panel. */
  function readLayout(dragged: HudPanelId): Layout {
    const layout: Layout = { sides: { left: [], right: [] }, columns: new Map(), slots: new Map(), sideRects: {} };
    const root = area.value;
    if (!root) return layout;
    for (const side of ['left', 'right'] as const) {
      const el = root.querySelector(`.hud-dock__side--${side}`);
      if (el) layout.sideRects[side] = el.getBoundingClientRect();
    }
    for (const col of root.querySelectorAll<HTMLElement>('.hud-dock__column')) {
      const side = col.dataset.side as DockSide;
      const column = Number(col.dataset.column);
      const hasDragged = !!col.querySelector(`[data-hud-panel="${dragged}"]`);
      if (col.classList.contains('is-empty') && !hasDragged) continue;
      const rect = col.getBoundingClientRect();
      const geom: ColumnGeom = { column, left: rect.left, right: rect.right, top: [], bottom: [] };
      for (const slot of col.querySelectorAll<HTMLElement>('[data-hud-panel]')) {
        const id = slot.dataset.hudPanel as HudPanelId;
        if (id === dragged) continue;
        const r = slot.getBoundingClientRect();
        layout.slots.set(id, r);
        (slot.dataset.align === 'bottom' ? geom.bottom : geom.top).push({ id, centreY: r.top + r.height / 2 });
      }
      layout.sides[side].push(geom);
      layout.columns.set(`${side}-${column}`, rect);
    }
    for (const side of ['left', 'right'] as const) layout.sides[side].sort((a, b) => a.column - b.column);
    return layout;
  }

  /** Where the slot, at `rect`, would land, with the layout it was worked out from. */
  function targetFor(id: HudPanelId, rect: DOMRect): { target: DropTarget; layout: Layout } | null {
    const areaRect = area.value?.getBoundingClientRect();
    if (!areaRect) return null;
    const layout = readLayout(id);
    const target = dropTarget({
      centre: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      width: rect.width,
      area: areaRect,
      sides: layout.sides,
    });
    return { target, layout };
  }

  /** The sibling after `id` in its own group right now (null when it is last), for the "stays where it is" check. */
  function currentBefore(slot: HTMLElement): HudPanelId | null {
    const group = slot.parentElement;
    if (!group) return null;
    const siblings = [...group.querySelectorAll<HTMLElement>('[data-hud-panel]')];
    const next = siblings[siblings.indexOf(slot) + 1];
    return (next?.dataset.hudPanel as HudPanelId | undefined) ?? null;
  }

  function isSamePlace(id: HudPanelId, slot: HTMLElement, target: DropTarget): boolean {
    const p = prefs.panels[id];
    return p.side === target.side && p.column === target.column && p.align === target.align && currentBefore(slot) === target.before;
  }

  /** The bar showing the drop target: horizontal in an existing column, vertical for a new one. */
  function indicatorFor(target: DropTarget, layout: Layout): DropIndicator | null {
    const areaRect = area.value?.getBoundingClientRect();
    if (!areaRect) return null;
    const columns = layout.sides[target.side];
    const geom = columns.find((c) => c.column === target.column);
    const colRect = layout.columns.get(`${target.side}-${target.column}`);
    if (geom && colRect) {
      const group = target.align === 'top' ? geom.top : geom.bottom;
      const half = DOCK_STACK_GAP / 2;
      let y: number;
      const before = target.before ? layout.slots.get(target.before) : undefined;
      if (target.align === 'top') {
        if (before) y = before.top - half;
        else if (group.length) y = layout.slots.get(group[group.length - 1].id)!.bottom + half;
        else y = colRect.top;
      } else if (before) y = before.bottom + half;
      else if (group.length) y = layout.slots.get(group[group.length - 1].id)!.top - half;
      else y = colRect.bottom;
      y = Math.min(Math.max(y - INDICATOR_PX / 2, colRect.top), colRect.bottom - INDICATOR_PX);
      return { left: colRect.left - areaRect.left, top: y - areaRect.top, width: colRect.width, height: INDICATOR_PX };
    }
    const sideRect = layout.sideRects[target.side];
    if (!sideRect) return null;
    const inner = columns[columns.length - 1];
    let x: number;
    if (!inner) x = target.side === 'left' ? areaRect.left + DOCK_GUTTER : areaRect.right - DOCK_GUTTER - INDICATOR_PX;
    else if (target.side === 'left') x = inner.right + DOCK_COLUMN_GAP / 2 - INDICATOR_PX / 2;
    else x = inner.left - DOCK_COLUMN_GAP / 2 - INDICATOR_PX / 2;
    return { left: x - areaRect.left, top: sideRect.top - areaRect.top, width: INDICATOR_PX, height: sideRect.height };
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
    const hit = targetFor(session.id, session.slot.getBoundingClientRect());
    indicator.value = hit ? indicatorFor(hit.target, hit.layout) : null;
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
    indicator.value = null;
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
    indicator.value = null;
    const dropRect = s.slot.getBoundingClientRect();
    const hit = targetFor(s.id, dropRect);
    if (!hit || isSamePlace(s.id, s.slot, hit.target)) {
      void settleInPlace(s.slot, `translate(${dx}px, ${dy}px)`);
      return;
    }
    // The slot is re-created in another group, or reused when it only moves inside its own; either way the drag styles go.
    s.slot.style.transform = '';
    s.slot.style.zIndex = '';
    moving = true;
    pendingSnap = { id: s.id, from: dropRect };
    prefs.movePanel(s.id, hit.target);
    void nextTick(() => {
      const snap = pendingSnap;
      moving = false;
      pendingSnap = null;
      // Not taken by onEnter: the slot stayed in its group (a reorder), so it slides from the drop rectangle itself.
      const el = snap && area.value?.querySelector<HTMLElement>(`[data-hud-panel="${snap.id}"]`);
      if (snap && el && motionEnabled()) {
        const now = el.getBoundingClientRect();
        void animate(el, [{ transform: `translate(${snap.from.left - now.left}px, ${snap.from.top - now.top}px)` }, { transform: 'translate(0, 0)' }], {
          duration: SNAP_MS,
          easing: 'ease-out',
        });
      }
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

  const towardEdge = (el: Element) => ((el as HTMLElement).dataset.side === 'left' ? -SLIDE_PX : SLIDE_PX);

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
        { opacity: 0, transform: `translateX(${towardEdge(el)}px)` },
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
        { opacity: 0, transform: `translateX(${towardEdge(el)}px)` },
      ],
      { duration: FADE_MS, easing: 'ease-in', fill: 'forwards' },
    ).then(done, done);
  }

  return { dragging, indicator, onPointerDown, onEnter, onLeave };
}
