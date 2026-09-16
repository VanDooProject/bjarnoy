import { ref, type Ref } from 'vue';
import { clampOffset, shouldOpenOnRelease } from '../lib/hud/drawerDrag';
import type { HudBarPosition } from '../stores/hudPrefs';

// Android-notification-shade-style pull-down for the mobile-only HUD bar
// (see components/hud/TopBar.vue). Drag the collapsed bar to open a full
// drawer revealing everything that doesn't fit collapsed (full resource
// detail + nav links — components/hud/MobileHudDrawer.vue); drag it back to
// close. Open/closed is transient UI state, never persisted — only the
// top/bottom docking edge (hudPrefs.barPosition) is a real preference.
const DRAG_INTENT_PX = 8;
const OPEN_THRESHOLD_RATIO = 0.3;
const FLICK_VELOCITY_PX_MS = 0.5;

export function useHudDrawer(edge: Ref<HudBarPosition>, drawerHeight: Ref<number>) {
  const isOpen = ref(false);
  const dragging = ref(false);
  const dragOffset = ref(0); // 0 = closed .. drawerHeight = open; only meaningful while dragging.value is true

  let pointerId: number | null = null;
  let armed = false; // past the intent threshold — a real drag, not a stray touch
  let startY = 0;
  let startOffset = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0; // px/ms, positive = towards open
  // A real mouse/touch drag that started on an interactive element (a nav
  // link inside the open drawer, say) still gets a compatibility `click`
  // dispatched on mouseup/touchend by the browser afterward, hit-tested at
  // wherever the pointer ends up — which can land back on another
  // clickable element and fire ITS handler (e.g. navigating away) even
  // though the user's intent was clearly "drag to close", not "tap this".
  // `consumeClickSuppression` lets the caller swallow exactly that one
  // synthetic click, and only that one.
  let suppressNextClick = false;

  function restingOffset(): number {
    return isOpen.value ? drawerHeight.value : 0;
  }

  /** The offset to render at right now, whether dragging or at rest. */
  function currentOffset(): number {
    return dragging.value ? dragOffset.value : restingOffset();
  }

  function directionalDelta(clientY: number): number {
    const raw = clientY - startY;
    // Pulling down opens a top-docked bar; pulling up opens a bottom-docked one.
    return edge.value === 'top' ? raw : -raw;
  }

  function onPointerDown(e: PointerEvent) {
    pointerId = e.pointerId;
    startY = e.clientY;
    lastY = e.clientY;
    lastT = e.timeStamp;
    startOffset = restingOffset();
    velocity = 0;
    armed = false;
  }

  function onPointerMove(e: PointerEvent) {
    if (pointerId === null || e.pointerId !== pointerId) return;
    if (!armed) {
      if (Math.abs(e.clientY - startY) < DRAG_INTENT_PX) return;
      armed = true;
      dragging.value = true;
      (e.target as Element | null)?.setPointerCapture?.(pointerId);
    }
    const dt = e.timeStamp - lastT;
    if (dt > 0) {
      velocity = ((e.clientY - lastY) / dt) * (edge.value === 'top' ? 1 : -1);
    }
    lastY = e.clientY;
    lastT = e.timeStamp;
    dragOffset.value = clampOffset(startOffset + directionalDelta(e.clientY), drawerHeight.value);
  }

  function teardown() {
    pointerId = null;
    armed = false;
    dragging.value = false;
    dragOffset.value = 0;
  }

  function onPointerUp(e: PointerEvent) {
    if (pointerId === null || e.pointerId !== pointerId) return;
    const wasArmed = armed;
    const finalOffset = dragOffset.value;
    const finalVelocity = velocity;
    teardown();
    if (!wasArmed) return; // a tap, not a drag — the chevron handles taps separately
    suppressNextClick = true;
    isOpen.value = shouldOpenOnRelease(
      finalOffset,
      drawerHeight.value,
      finalVelocity,
      OPEN_THRESHOLD_RATIO,
      FLICK_VELOCITY_PX_MS,
    );
  }

  function onPointerCancel(e: PointerEvent) {
    if (pointerId === null || e.pointerId !== pointerId) return;
    teardown(); // always springs back to whatever isOpen already was — nothing commits
  }

  function toggle() {
    isOpen.value = !isOpen.value;
  }
  function close() {
    isOpen.value = false;
  }

  /** Call from a capture-phase click handler; returns true if this click should be swallowed. */
  function consumeClickSuppression(): boolean {
    const should = suppressNextClick;
    suppressNextClick = false;
    return should;
  }

  return {
    isOpen,
    dragging,
    currentOffset,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    toggle,
    close,
    consumeClickSuppression,
  };
}
