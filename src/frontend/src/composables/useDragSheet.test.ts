// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useDragSheet } from './useDragSheet';

function pointerEvent(coord: number, axis: 'x' | 'y' = 'y', currentTarget: EventTarget | null = null): PointerEvent {
  const event = new Event('pointer') as unknown as PointerEvent;
  Object.defineProperty(event, axis === 'x' ? 'clientX' : 'clientY', { value: coord });
  Object.defineProperty(event, 'currentTarget', { value: currentTarget });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

describe('useDragSheet', () => {
  it('starts collapsed by default and can start expanded', () => {
    expect(useDragSheet().expanded.value).toBe(false);
    expect(useDragSheet(true).expanded.value).toBe(true);
  });

  it('toggles on a tap (movement under the tap threshold)', () => {
    const sheet = useDragSheet(false);
    sheet.onPointerDown(pointerEvent(100));
    sheet.onPointerMove(pointerEvent(102));
    sheet.onPointerUp();
    expect(sheet.expanded.value).toBe(true);

    sheet.onPointerDown(pointerEvent(100));
    sheet.onPointerMove(pointerEvent(99));
    sheet.onPointerUp();
    expect(sheet.expanded.value).toBe(false);
  });

  it('expands on a real drag past the threshold in the opening direction (default: increasing coordinate)', () => {
    const sheet = useDragSheet(false, { threshold: 40 });
    sheet.onPointerDown(pointerEvent(100));
    sheet.onPointerMove(pointerEvent(160));
    expect(sheet.dragOffset.value).toBe(60);
    sheet.onPointerUp();
    expect(sheet.expanded.value).toBe(true);
    expect(sheet.dragOffset.value).toBe(0);
  });

  it('collapses on a real drag past the threshold the other way', () => {
    const sheet = useDragSheet(true, { threshold: 40 });
    sheet.onPointerDown(pointerEvent(160));
    sheet.onPointerMove(pointerEvent(100));
    sheet.onPointerUp();
    expect(sheet.expanded.value).toBe(false);
  });

  it('snaps back to the current state on a drag that never clears the threshold', () => {
    const sheet = useDragSheet(false, { threshold: 40 });
    sheet.onPointerDown(pointerEvent(100));
    sheet.onPointerMove(pointerEvent(120));
    sheet.onPointerUp();
    expect(sheet.expanded.value).toBe(false);
  });

  it('inverts the opening direction to "up" for a bottom-pinned bar', () => {
    const sheet = useDragSheet(false, { invert: true, threshold: 40 });
    sheet.onPointerDown(pointerEvent(160));
    sheet.onPointerMove(pointerEvent(100));
    expect(sheet.dragOffset.value).toBe(60);
    sheet.onPointerUp();
    expect(sheet.expanded.value).toBe(true);
  });

  it('reads the horizontal coordinate for axis: "x" (a sidebar hinged on the right edge)', () => {
    const sheet = useDragSheet(false, { axis: 'x', invert: true, threshold: 40 });
    sheet.onPointerDown(pointerEvent(300, 'x'));
    // Dragging left (decreasing clientX) opens a sidebar hinged on the right.
    sheet.onPointerMove(pointerEvent(240, 'x'));
    expect(sheet.dragOffset.value).toBe(60);
    sheet.onPointerUp();
    expect(sheet.expanded.value).toBe(true);

    // Dragging back right past the threshold closes it again.
    sheet.onPointerDown(pointerEvent(240, 'x'));
    sheet.onPointerMove(pointerEvent(300, 'x'));
    sheet.onPointerUp();
    expect(sheet.expanded.value).toBe(false);
  });

  it('ignores pointermove/pointerup before any pointerdown', () => {
    const sheet = useDragSheet(false);
    sheet.onPointerMove(pointerEvent(200));
    sheet.onPointerUp();
    expect(sheet.expanded.value).toBe(false);
    expect(sheet.dragging.value).toBe(false);
  });
});
