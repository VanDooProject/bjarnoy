import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useHudDrawer } from './useHudDrawer';
import type { HudBarPosition } from '../stores/hudPrefs';

function fakeEvent(clientY: number, timeStamp: number, pointerId = 1, withCapture = false) {
  return {
    pointerId,
    clientY,
    timeStamp,
    target: withCapture ? { setPointerCapture: () => {} } : null,
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
});
