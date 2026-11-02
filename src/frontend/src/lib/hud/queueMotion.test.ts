// @vitest-environment jsdom
//
// The phone drawer's slide-in must not hold its end frame once it has
// finished. That end frame is the drawer's closed resting offset, read when
// the column mounts; held by a forwards fill it outranks the `.is-open` CSS
// transform and the drag's inline transform, so the drawer reported itself
// open while it stayed parked off-screen. The slide-out keeps its fill: the
// column is removed right after it, and without the fill it would flash back
// to its resting place for a frame first.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installWaapi } from '../../test/waapi';
import { slideDrawer } from './queueMotion';

/** Whether a fill keeps the last keyframe applied after the animation finished. */
function holdsEndFrame(fill: FillMode | undefined): boolean {
  return fill === 'forwards' || fill === 'both';
}

describe('slideDrawer', () => {
  let waapi: ReturnType<typeof installWaapi>;
  let drawer: HTMLElement;
  beforeEach(() => {
    waapi = installWaapi();
    drawer = document.createElement('div');
    drawer.style.transform = 'translateX(-287px)';
    document.body.appendChild(drawer);
  });
  afterEach(() => {
    document.body.innerHTML = '';
    waapi.uninstall();
  });

  it('leaves no transform behind after sliding in, so opening or dragging can move the drawer', () => {
    void slideDrawer(drawer, 'in');
    const [slide] = waapi.calls;
    expect(slide.frames.at(-1)).toMatchObject({ transform: 'translateX(-287px)' });
    expect(holdsEndFrame(slide.options.fill)).toBe(false);
  });

  it('holds the off-screen frame after sliding out, until the column is removed', () => {
    void slideDrawer(drawer, 'out');
    const [slide] = waapi.calls;
    expect(slide.frames.at(-1)).toMatchObject({ transform: 'translateX(-100%)', opacity: 0 });
    expect(holdsEndFrame(slide.options.fill)).toBe(true);
  });
});
