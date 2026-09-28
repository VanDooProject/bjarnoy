import { ref, type Ref } from 'vue';
import { clampOffset, shouldOpenOnRelease, splitDrawerDragDelta } from '../lib/hud/drawerDrag';
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

export function useHudDrawer(
  edge: Ref<HudBarPosition>,
  drawerHeight: Ref<number>,
  // Optional getter for the open drawer's own scroll container (see
  // TopBar.vue's `.hud-drawer-scroll`). When set, a gesture that starts
  // while the drawer is already open scrolls this element before it drags
  // the drawer closed — see the "content scrolling" block in onPointerMove
  // and drawerDrag.ts's `splitDrawerDragDelta`. Omitted entirely by
  // callers/tests that don't care about scrolling (e.g. useHudDrawer.test.ts's
  // plain-number gestures), which keeps the drag-only behaviour untouched.
  scrollEl?: () => HTMLElement | null,
) {
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
  // Set once per gesture, at arm time: whether this gesture began on an
  // already fully-open drawer (as opposed to opening it from the collapsed
  // bar) — only then is there a scroll container to give priority to. See
  // the spec comment on the `scrollEl` param above.
  let scrollPriority = false;
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
      // Scroll-vs-drag routing only ever applies to a gesture that begins on
      // an already fully-open drawer (`startOffset > 0` — see the spec's own
      // "gestures that start on the collapsed bar are unaffected" carve-out).
      scrollPriority = startOffset > 0;
      // Seeds the running offset that every branch below now accumulates
      // onto incrementally (move-by-move), rather than recomputing from
      // `startOffset` + the *total* delta since gesture start each time —
      // the scroll-priority branch has to work incrementally regardless (it
      // splits against the scroll container's *current* scrollTop, which
      // itself changes move-by-move), and once scroll priority disengages
      // for a gesture that used it, the plain path has to pick up
      // incrementally from wherever that left `dragOffset`, not jump back to
      // a value computed from the raw total finger movement (which would
      // ignore the portion of it already spent on scrolling).
      dragOffset.value = startOffset;
    }
    const dt = e.timeStamp - lastT;
    // This move's own incremental, *raw* (screen-space, unflipped) delta —
    // as opposed to the total delta since gesture start, and as opposed to
    // useHudDrawer's own "opening direction is positive" convention.
    // splitDrawerDragDelta needs the raw form (natural scrolling moves
    // content with the finger regardless of which edge the bar docks to —
    // see its own comment); the plain-drag fallback below converts it with
    // the same sign flip `directionalDelta` used to.
    const rawStep = e.clientY - lastY;
    lastY = e.clientY;
    lastT = e.timeStamp;

    let appliedDelta = rawStep * (edge.value === 'top' ? 1 : -1);
    if (scrollPriority) {
      const el = scrollEl?.() ?? null;
      if (el) {
        const { scrollDelta, dragDelta } = splitDrawerDragDelta(rawStep, el.scrollTop, el.scrollHeight, el.clientHeight, edge.value);
        if (scrollDelta !== 0) el.scrollTop += scrollDelta;
        appliedDelta = dragDelta;
        // The instant any of this gesture's motion actually moves the
        // drawer itself (dragDelta !== 0), the player is dragging the sheet,
        // not scrolling its content — every later step of this same
        // gesture (even one that reverses direction) drags it from here on.
        // Re-splitting on a later step would otherwise read the scroll
        // container's own `clientHeight`, which is `.hud-drawer`'s current
        // (now-shrinking, mid-close) height — that grows `maxScrollTop` out
        // from under the split maths as the drag itself proceeds, which
        // stalled the close indefinitely (confirmed while testing this fix:
        // the close drag's own container kept "gaining" scroll room exactly
        // as fast as it was being consumed).
        if (dragDelta !== 0) scrollPriority = false;
      } else {
        // No scroll element at all — behaves exactly like a plain drag.
        scrollPriority = false;
      }
    }
    dragOffset.value = clampOffset(dragOffset.value + appliedDelta, drawerHeight.value);
    // A fast flick's release velocity (see shouldOpenOnRelease/onPointerUp
    // below) has to be measured against how far the *drawer* actually moved,
    // not the raw finger speed — a fast swipe that's entirely absorbed by
    // scrolling the content (appliedDelta 0) must not register as a closing
    // flick just because the finger itself moved quickly.
    if (dt > 0) velocity = appliedDelta / dt;
  }

  function teardown() {
    releaseCapture();
    pointerId = null;
    armed = false;
    scrollPriority = false;
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
