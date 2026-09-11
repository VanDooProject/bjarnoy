// Generic drag-to-collapse/expand mechanic for a HUD sheet with a drag
// handle (the mobile header bar's queue-summary reveal, and later the
// Queues sidebar). No existing composable does this — see the task notes
// for why this needed building from scratch rather than reusing something.
//
// A pointer down on the handle starts tracking; a small movement (below
// `tapThreshold`) on release is treated as a tap and just toggles the
// current state, while a real drag past `threshold` in the expand
// direction opens it (or past `threshold` the other way closes it). Anything
// in between snaps back to whatever it already was, so a half-hearted drag
// doesn't leave the sheet in a confusing middle state.
import { ref } from 'vue';

export interface UseDragSheetOptions {
  /** Which pointer direction, in screen pixels, counts as "opening" the sheet. */
  expandDirection?: 'down' | 'up';
  /** Pixels of drag past which release commits to open/closed. */
  threshold?: number;
  /** Pixels of drag under which a release is treated as a tap (toggle) instead. */
  tapThreshold?: number;
}

export function useDragSheet(initialExpanded = false, options: UseDragSheetOptions = {}) {
  const expandDirection = options.expandDirection ?? 'down';
  const threshold = options.threshold ?? 40;
  const tapThreshold = options.tapThreshold ?? 6;

  const expanded = ref(initialExpanded);
  const dragging = ref(false);
  // Live pixel offset in the "opening" direction while dragging, for a
  // caller that wants to visually follow the finger — always 0 when idle.
  const dragOffset = ref(0);
  let startY = 0;

  function onPointerDown(event: PointerEvent) {
    dragging.value = true;
    startY = event.clientY;
    dragOffset.value = 0;
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging.value) return;
    const deltaY = event.clientY - startY;
    dragOffset.value = expandDirection === 'down' ? deltaY : -deltaY;
  }

  function onPointerUp() {
    if (!dragging.value) return;
    dragging.value = false;
    if (Math.abs(dragOffset.value) < tapThreshold) {
      expanded.value = !expanded.value;
    } else if (dragOffset.value > threshold) {
      expanded.value = true;
    } else if (dragOffset.value < -threshold) {
      expanded.value = false;
    }
    dragOffset.value = 0;
  }

  return { expanded, dragging, dragOffset, onPointerDown, onPointerMove, onPointerUp };
}
