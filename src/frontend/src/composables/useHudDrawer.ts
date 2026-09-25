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
  let capturedTarget: Element | null = null;
  let armed = false; // past the intent threshold — a real drag, not a stray touch
  let startY = 0;
  let startOffset = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0; // px/ms, positive = towards open
  // A real mouse/touch drag that started on an interactive element (a nav
  // link inside the open drawer, or the grip/a resource pill on the
  // collapsed bar) still gets a compatibility `click` dispatched on
  // mouseup/touchend by the browser afterward, hit-tested at wherever the
  // pointer ends up — which can land back on another clickable element and
  // fire ITS handler (e.g. re-toggling the grip, cycling a pill, navigating
  // away) even though the user's intent was clearly "drag", not "tap this".
  // `consumeClickSuppression` lets the caller swallow exactly that one
  // synthetic click, and only that one.
  //
  // Finding #5: a *touch* drag never actually fires that compatibility
  // click at all (only a real mouse drag does) — so nothing ever calls
  // `consumeClickSuppression` to clear this flag, and it sat there true
  // until it happened to swallow some entirely unrelated *later* tap (e.g.
  // "Reports" inside the drawer, well after the drag that set it). Cleared
  // on the very next pointerdown below (a real gesture started, so any
  // stale suppression from a previous one is definitely no longer wanted),
  // and as a backstop, one macrotask after pointerup — long enough for a
  // real compatibility click (dispatched synchronously by the browser
  // before that macrotask runs) to still consume it first, but short
  // enough that no genuine later tap could land inside that window.
  let suppressNextClick = false;
  let suppressClickBackstop: ReturnType<typeof setTimeout> | null = null;

  function clearSuppressBackstop() {
    if (suppressClickBackstop !== null) {
      clearTimeout(suppressClickBackstop);
      suppressClickBackstop = null;
    }
  }

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

  function releaseCapture() {
    if (capturedTarget && pointerId !== null) {
      // Guarded: the capture may already be gone (finding #7's own
      // `lostpointercapture` path calls into teardown after the browser has
      // already released it) — releasePointerCapture on an id the element
      // no longer holds throws (DOMException), so check first.
      const el = capturedTarget as Element & { hasPointerCapture?: (id: number) => boolean; releasePointerCapture?: (id: number) => void };
      if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture?.(pointerId);
    }
    capturedTarget = null;
  }

  function onPointerDown(e: PointerEvent) {
    // Finding #5: a fresh gesture starting clears any suppression left over
    // from a previous one — see the flag's own comment above.
    suppressNextClick = false;
    clearSuppressBackstop();
    // Finding #17: a drag is already in progress (or mid-capture) — a
    // second finger, or a mouse button pressed while a touch drag is still
    // resolving, must not steal `pointerId` out from under it (that would
    // silently orphan the first drag: no more pointermove/pointerup ever
    // matches its id again).
    if (pointerId !== null) return;
    // Finding #17: only the primary pointer for its input source, and for a
    // mouse specifically the left button — a secondary touch point still
    // dispatches pointerdown as non-primary, and a right/middle mouse
    // button click should never start a drawer drag.
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
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
      // Finding #6: capture on `e.currentTarget` (the element the listener
      // is actually attached to — the bar or the drawer, both stable for
      // the gesture's whole lifetime), not `e.target` (whatever specific
      // child — a grip icon, a nav link's inner span — happened to be under
      // the finger at the *first* qualifying move, which is a coincidence
      // of hit-testing, not something guaranteed to still exist or stay
      // capture-capable for the rest of the drag).
      capturedTarget = e.currentTarget as Element | null;
      capturedTarget?.setPointerCapture?.(pointerId);
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
    releaseCapture();
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
    if (!wasArmed) return; // a tap, not a drag — the chevron/pill/link handles taps separately
    suppressNextClick = true;
    clearSuppressBackstop();
    suppressClickBackstop = setTimeout(() => {
      suppressNextClick = false;
      suppressClickBackstop = null;
    }, 0);
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

  /**
   * Finding #7: the drawer's own capture target can be torn down mid-drag —
   * ResourceBar swaps its whole pill markup the instant `isOpen` commits
   * (compact <-> expanded are different elements), and *that* used to be
   * driven by "open OR dragging" (see TopBar.vue's old `isHudDrawerOpen`
   * wiring), so a drag could commit-open, cause that swap, and lose its own
   * captured element mid-gesture. Now that the expanded layout only follows
   * the *committed* `isOpen`, this should no longer happen in practice —
   * but a lost capture from any other cause (devtools, a browser quirk)
   * must still not leave the drag permanently "stuck" with a `pointerId`
   * nothing will ever move or release again. Treated exactly like a cancel:
   * springs back, commits nothing.
   */
  function onLostPointerCapture(e: PointerEvent) {
    if (pointerId === null || e.pointerId !== pointerId) return;
    teardown();
  }

  /** Finding #18: called when the breakpoint/slot crossing makes dragging no longer available at all. */
  function cancelDrag() {
    if (pointerId === null) return;
    teardown();
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
    clearSuppressBackstop();
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
    onLostPointerCapture,
    cancelDrag,
    toggle,
    close,
    consumeClickSuppression,
  };
}
