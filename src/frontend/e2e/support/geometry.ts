import type { Locator, Page } from '@playwright/test';

/**
 * Every matched element's on-screen box and visibility, read in **one**
 * round trip.
 *
 * The obvious spelling — `expect(nth(i)).toBeVisible()` then
 * `nth(i).boundingBox()` in a loop — costs two CDP round trips per element.
 * That is cheap against an idle page and expensive against this app's
 * canvas views, where a software-rendered runner can leave the main thread
 * blocked for hundreds of milliseconds at a time and every round trip waits
 * out whatever frame is in flight. `ring-menu.spec.ts`'s drill-down test
 * asserts over two rings' worth of bubbles that way and spent its whole 90s
 * budget doing it (issue #167).
 *
 * `evaluateAll` collapses that to a single call, and returns enough to make
 * the same assertions: `visible` matches what Playwright's own visibility
 * check means (a non-empty box, not `visibility: hidden` or
 * `display: none`), and the box is in the same client coordinates
 * `boundingBox()` reports.
 */
export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  text: string;
}

export function rectsOf(locator: Locator): Promise<ElementRect[]> {
  return locator.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        visible:
          r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
        text: (el.textContent ?? '').trim(),
      };
    }),
  );
}

/** Centre-to-centre distance from `(x, y)` to a rect returned by rectsOf. */
export function distanceFrom(rect: ElementRect, x: number, y: number): number {
  return Math.hypot(rect.x + rect.width / 2 - x, rect.y + rect.height / 2 - y);
}

/**
 * Every visible interactive element inside the app root (`#app`) that sits
 * partly outside the viewport, plus whether the page itself scrolls
 * sideways — read in one round trip, for the phone-viewport layout checks
 * in `mobile.spec.ts`.
 *
 * Scoped to `#app` on purpose: PixiJS appends its own accessibility touch
 * hook (a `<button>` parked at -1000,-1000) straight onto `<body>`, which is
 * deliberately off-screen and not ours to lay out. An element inside a
 * horizontally scrollable ancestor (the mobile resource strip, the tech
 * tree's wide grid) may run past that ancestor's right edge as long as the
 * ancestor really scrolls — the user swipes to it — but never past its left
 * edge: overflow to the left of a scroll container's origin is unreachable,
 * which is exactly how HudNav's links used to disappear.
 */
export async function layoutOverflow(page: Page): Promise<{ pageScrollsSideways: boolean; offscreen: string[] }> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const describe = (el: Element, r: DOMRect) =>
      `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${(el.textContent ?? '').trim().slice(0, 24)}" [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`;
    const scrollsX = (el: Element) => /(auto|scroll)/.test(getComputedStyle(el).overflowX);
    const offscreen: string[] = [];
    for (const el of document.querySelectorAll('#app button, #app a[href], #app input, #app select, #app textarea, #app [role="button"]')) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') continue;
      let scroller: Element | null = el.parentElement;
      while (scroller && scroller !== document.body && !scrollsX(scroller)) scroller = scroller.parentElement;
      const bounds = scroller && scroller !== document.body ? scroller.getBoundingClientRect() : null;
      const left = Math.max(0, bounds?.left ?? 0);
      const right = Math.min(vw, bounds?.right ?? vw);
      const canScrollRight = !!scroller && scroller !== document.body && scroller.scrollWidth > scroller.clientWidth;
      if (r.left < left - 1 || (r.right > right + 1 && !canScrollRight) || r.top < -1) offscreen.push(describe(el, r));
    }
    return { pageScrollsSideways: document.documentElement.scrollWidth > vw + 1, offscreen: [...new Set(offscreen)] };
  });
}
