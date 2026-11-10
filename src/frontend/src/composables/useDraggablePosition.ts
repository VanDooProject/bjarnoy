// Drag-to-move for a fixed-size floating box, for the `?debug=1` stack: its
// default spot (top right) sits on TrainingQueuePanel and ArmyPanel, and there
// is no corner that is free in every state, so the box is movable instead.
//
// Until the first drag the box has no position of its own and the stylesheet
// places it. After that the position is a `left`/`top` pair, kept in
// sessionStorage like DebugPanel's collapsed state (a throwaway inspection aid,
// scoped to the tab, outliving a navigation). A double-click on the handle
// goes back to the stylesheet's spot.
import { computed, onUnmounted, ref, type Ref } from 'vue';

export interface Point {
  left: number;
  top: number;
}

/** Keeps at least `grip` px of the box's top-left inside the viewport, so the handle can never be lost off-screen. */
export function clampToViewport(p: Point, viewport: { w: number; h: number }, grip = 40): Point {
  return {
    left: Math.min(Math.max(p.left, grip - 200), viewport.w - grip),
    top: Math.min(Math.max(p.top, 0), viewport.h - grip),
  };
}

function load(key: string): Point | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Point>;
    return Number.isFinite(v.left) && Number.isFinite(v.top) ? { left: v.left!, top: v.top! } : null;
  } catch {
    return null;
  }
}

export function useDraggablePosition(storageKey: string, box: Ref<HTMLElement | null>) {
  const key = `bjarnoy:dragPos:${storageKey}`;
  const pos = ref<Point | null>(load(key));

  const style = computed(() =>
    pos.value
      ? {
          left: `${pos.value.left}px`,
          top: `${pos.value.top}px`,
          right: 'auto',
          maxHeight: `calc(100dvh - ${pos.value.top}px - 16px)`,
        }
      : {},
  );

  let drag: { dx: number; dy: number } | null = null;

  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    pos.value = clampToViewport(
      { left: e.clientX - drag.dx, top: e.clientY - drag.dy },
      { w: window.innerWidth, h: window.innerHeight },
    );
  };
  const stop = () => {
    drag = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    try {
      if (pos.value) sessionStorage.setItem(key, JSON.stringify(pos.value));
    } catch {
      /* storage blocked: the position just doesn't outlive the view */
    }
  };

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !box.value) return;
    const rect = box.value.getBoundingClientRect();
    drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    e.preventDefault();
  }

  function reset() {
    pos.value = null;
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* see stop() */
    }
  }

  onUnmounted(() => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  });

  return { style, onPointerDown, reset };
}
