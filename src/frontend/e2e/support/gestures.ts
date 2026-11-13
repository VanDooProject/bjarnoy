import type { Page } from '@playwright/test';
import { cdpSessionFor } from './cdp';

/**
 * Drives a real two-finger pinch via CDP's `Input.dispatchTouchEvent` —
 * `page.touchscreen` only exposes single-finger `tap`, and HexMapRenderer's
 * pinch handling (see docs/design/zoom-transition.md §9.2) is keyed on
 * genuinely distinct `pointerId`s reaching the canvas, which only a real
 * multi-touch-point dispatch produces.
 *
 * Spreads (or closes) two touch points symmetrically around `centre` from
 * `fromGap` to `toGap` px apart over `steps` intermediate `touchMove`s, then
 * lifts both. Each touch point's `id` stays fixed across the whole gesture
 * so the renderer's `pointerId`-keyed `PinchTracker` sees one continuous
 * pair rather than a new pair each step.
 */
export async function pinch(
  page: Page,
  centre: { x: number; y: number },
  fromGap: number,
  toGap: number,
  steps = 8,
): Promise<void> {
  const session = await cdpSessionFor(page);
  const pointsAt = (gap: number) => [
    { x: centre.x - gap / 2, y: centre.y, id: 0 },
    { x: centre.x + gap / 2, y: centre.y, id: 1 },
  ];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pointsAt(fromGap) });
  for (let i = 1; i <= steps; i++) {
    const gap = fromGap + ((toGap - fromGap) * i) / steps;
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pointsAt(gap) });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * A single-finger touch drag via the same `Input.dispatchTouchEvent` CDP
 * path `pinch` uses — `page.touchscreen` has no drag primitive (only
 * `tap`), and this is what a pinch spec needs to prove a lone finger still
 * pans the map after HexMapRenderer's pointer handling became pointerId-
 * keyed (see docs/design/zoom-transition.md §9.2) rather than assuming a
 * single global pointer.
 */
export async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 10,
): Promise<void> {
  const session = await cdpSessionFor(page);
  const pointAt = (x: number, y: number) => [{ x, y, id: 0 }];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pointAt(from.x, from.y) });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pointAt(x, y) });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * A touch double tap at `p` via CDP, sent the way a finger produces it:
 * all four touch events go out back to back. `page.touchscreen.tap` twice
 * would wait for the page to acknowledge each event before sending the
 * next, which on a slow runner spaces the taps seconds apart — far past
 * the renderer's double-tap window (src/lib/map/doubleTap.ts).
 */
export async function doubleTap(page: Page, p: { x: number; y: number }): Promise<void> {
  const session = await cdpSessionFor(page);
  const point = [{ x: p.x, y: p.y, id: 0 }];
  await Promise.all([
    session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point }),
    session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point }),
    session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
  ]);
}
