import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useHudDrawer } from './useHudDrawer';
import type { HudBarPosition } from '../stores/hudPrefs';

function fakeEvent(
  clientY: number,
  timeStamp: number,
  pointerId = 1,
  opts: { isPrimary?: boolean; pointerType?: string; button?: number } = {},
) {
  const currentTarget = { setPointerCapture: () => {}, hasPointerCapture: () => true, releasePointerCapture: () => {} };
  return {
    pointerId,
    clientY,
    timeStamp,
    isPrimary: opts.isPrimary ?? true,
    pointerType: opts.pointerType ?? 'touch',
    button: opts.button ?? 0,
    currentTarget,
    target: currentTarget,
  } as unknown as PointerEvent;
}

describe('useHudDrawer', () => {
  it('does nothing below the drag-intent threshold', () => {
    const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
    drawer.onPointerDown(fakeEvent(0, 0));
    drawer.onPointerMove(fakeEvent(4, 10)); // < 8px
    expect(drawer.dragging.value).toBe(false);
    drawer.onPointerUp(fakeEvent(4, 10));
    expect(drawer.isOpen.value).toBe(false);
  });

  it('opens when dragged past the distance threshold on a top-docked bar', () => {
    const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
    drawer.onPointerDown(fakeEvent(0, 0));
    drawer.onPointerMove(fakeEvent(150, 50)); // past 8px, and past 30% of 300
    expect(drawer.dragging.value).toBe(true);
    drawer.onPointerUp(fakeEvent(150, 50));
    expect(drawer.isOpen.value).toBe(true);
    expect(drawer.dragging.value).toBe(false);
  });

  it('snaps back closed when released short of the threshold, with no flick', () => {
    const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
    drawer.onPointerDown(fakeEvent(0, 0));
    drawer.onPointerMove(fakeEvent(10, 20)); // arms the drag
    // A slow second move settles velocity near zero before release, so only
    // the (short-of-threshold) distance decides the outcome.
    drawer.onPointerMove(fakeEvent(30, 100));
    drawer.onPointerUp(fakeEvent(30, 100)); // 30/300 = 10%, well short of the 30% threshold
    expect(drawer.isOpen.value).toBe(false);
  });

  it('opens on a fast downward flick even far short of the distance threshold', () => {
    const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
    drawer.onPointerDown(fakeEvent(0, 0));
    drawer.onPointerMove(fakeEvent(20, 5)); // 20px in 5ms => 4 px/ms, well past the flick threshold
    drawer.onPointerUp(fakeEvent(20, 5));
    expect(drawer.isOpen.value).toBe(true);
  });

  it('inverts drag direction for a bottom-docked bar — dragging up opens it', () => {
    const drawer = useHudDrawer(ref<HudBarPosition>('bottom'), ref(300));
    drawer.onPointerDown(fakeEvent(300, 0));
    drawer.onPointerMove(fakeEvent(150, 50)); // dragged up 150px
    drawer.onPointerUp(fakeEvent(150, 50));
    expect(drawer.isOpen.value).toBe(true);
  });

  it('pointercancel snaps back without committing any change', () => {
    const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
    drawer.onPointerDown(fakeEvent(0, 0));
    drawer.onPointerMove(fakeEvent(250, 50)); // would have opened
    drawer.onPointerCancel(fakeEvent(250, 50));
    expect(drawer.isOpen.value).toBe(false);
    expect(drawer.dragging.value).toBe(false);
    expect(drawer.currentOffset()).toBe(0);
  });

  it('resize/height change never leaves the drawer offset out of range', () => {
    const height = ref(300);
    const drawer = useHudDrawer(ref<HudBarPosition>('top'), height);
    drawer.onPointerDown(fakeEvent(0, 0));
    drawer.onPointerMove(fakeEvent(280, 50));
    height.value = 100; // e.g. orientation change mid-drag
    drawer.onPointerMove(fakeEvent(280, 60));
    expect(drawer.currentOffset()).toBeLessThanOrEqual(100);
  });

  it('toggle() flips open state directly, e.g. for a chevron tap', () => {
    const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
    expect(drawer.isOpen.value).toBe(false);
    drawer.toggle();
    expect(drawer.isOpen.value).toBe(true);
    drawer.close();
    expect(drawer.isOpen.value).toBe(false);
  });

  it('ignores pointer events from a different pointer than the one that started the drag', () => {
    const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
    drawer.onPointerDown(fakeEvent(0, 0, 1));
    drawer.onPointerMove(fakeEvent(150, 50, 2)); // different pointerId
    expect(drawer.dragging.value).toBe(false);
  });

  describe('consumeClickSuppression', () => {
    it('flags exactly one click to suppress after a real drag, e.g. one that started on a nav link', () => {
      const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
      drawer.onPointerDown(fakeEvent(500, 0));
      drawer.onPointerMove(fakeEvent(150, 50)); // a real drag (past 8px)
      drawer.onPointerUp(fakeEvent(50, 100));

      expect(drawer.consumeClickSuppression()).toBe(true);
      // Only the one synthetic click that follows this specific drag —
      // a later, unrelated click must not still be swallowed.
      expect(drawer.consumeClickSuppression()).toBe(false);
    });

    it('does not suppress a click after a plain tap (below the drag threshold)', () => {
      const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
      drawer.onPointerDown(fakeEvent(0, 0));
      drawer.onPointerMove(fakeEvent(3, 10)); // below the 8px intent threshold
      drawer.onPointerUp(fakeEvent(3, 10));

      expect(drawer.consumeClickSuppression()).toBe(false);
    });

    it('does not suppress a click after a cancelled drag', () => {
      const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
      drawer.onPointerDown(fakeEvent(0, 0));
      drawer.onPointerMove(fakeEvent(150, 50));
      drawer.onPointerCancel(fakeEvent(150, 50));

      expect(drawer.consumeClickSuppression()).toBe(false);
    });

    it('finding #5: a touch drag (no compatibility click ever fires) does not swallow a later, unrelated tap', () => {
      const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
      // A real drag opens the drawer — on a touch device this never
      // dispatches a `click` at all, so nothing ever calls
      // consumeClickSuppression() for it.
      drawer.onPointerDown(fakeEvent(0, 0, 1, { pointerType: 'touch' }));
      drawer.onPointerMove(fakeEvent(150, 50, 1, { pointerType: 'touch' }));
      drawer.onPointerUp(fakeEvent(150, 50, 1, { pointerType: 'touch' }));

      // The very next gesture — e.g. a genuine tap on "Reports" inside the
      // now-open drawer — must not still be swallowed by the stale flag.
      drawer.onPointerDown(fakeEvent(10, 200, 1, { pointerType: 'touch' }));
      expect(drawer.consumeClickSuppression()).toBe(false);
    });
  });

  it('finding #17: ignores a second pointerdown while a drag is already active', () => {
    const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
    drawer.onPointerDown(fakeEvent(0, 0, 1));
    drawer.onPointerMove(fakeEvent(50, 20, 1)); // arms pointer 1's drag
    drawer.onPointerDown(fakeEvent(500, 0, 2)); // a second finger lands mid-drag
    // Pointer 1's drag must still be the live one — its own move/up keep working.
    drawer.onPointerMove(fakeEvent(150, 50, 1));
    drawer.onPointerUp(fakeEvent(150, 50, 1));
    expect(drawer.isOpen.value).toBe(true);
  });

  it('finding #17: ignores a non-primary pointer (a second touch point)', () => {
    const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
    drawer.onPointerDown(fakeEvent(0, 0, 1, { isPrimary: false }));
    drawer.onPointerMove(fakeEvent(150, 50, 1, { isPrimary: false }));
    expect(drawer.dragging.value).toBe(false);
  });

  it('finding #17: ignores a non-left mouse button', () => {
    const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
    drawer.onPointerDown(fakeEvent(0, 0, 1, { pointerType: 'mouse', button: 2 })); // right-click
    drawer.onPointerMove(fakeEvent(150, 50, 1, { pointerType: 'mouse', button: 2 }));
    expect(drawer.dragging.value).toBe(false);
  });

  it('finding #7: a lost pointer capture mid-drag cancels it without committing any change', () => {
    const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
    drawer.onPointerDown(fakeEvent(0, 0));
    drawer.onPointerMove(fakeEvent(250, 50)); // would have opened
    drawer.onLostPointerCapture(fakeEvent(250, 50));
    expect(drawer.isOpen.value).toBe(false);
    expect(drawer.dragging.value).toBe(false);
    expect(drawer.currentOffset()).toBe(0);
  });

  it('finding #18: cancelDrag() tears down an in-flight drag without committing it', () => {
    const drawer = useHudDrawer(ref<HudBarPosition>('top'), ref(300));
    drawer.onPointerDown(fakeEvent(0, 0));
    drawer.onPointerMove(fakeEvent(250, 50)); // would have opened
    drawer.cancelDrag();
    expect(drawer.dragging.value).toBe(false);
    expect(drawer.currentOffset()).toBe(0);
    // A stray pointerup for the now-torn-down pointer is a no-op.
    drawer.onPointerUp(fakeEvent(250, 50));
    expect(drawer.isOpen.value).toBe(false);
  });
});
