/**
 * Choreography for the tile ring menu (RingMenu.vue): bloom on open, layer
 * swaps through the hub, the blocked-building shake, the hub press, the
 * close retract and the build "drop". Pure DOM + Web Animations, kept out of
 * the SFC so it stays readable; timings and easings are the decided motion
 * prototype's ("Round 5 · final").
 *
 * Conventions:
 *  - The ring positions its bubbles with `left`/`top` (their centre, via a
 *    negative margin), so `transform` is free for these animations and for the
 *    CSS hover lift. Entrances use `fill: 'backwards'` (see lib/motion.ts), so
 *    nothing is left behind inline once they end and the hover transform is
 *    never blocked.
 *  - Exits use `fill: 'both'` and are meant to be followed by the element
 *    being removed (or by `release`).
 *  - Under prefers-reduced-motion every function resolves at once without
 *    touching the DOM (except `flashReason`, a colour flash, which still plays).
 */
import { animate, motionEnabled, wait } from '../motion';

export interface Point {
  x: number;
  y: number;
}

/** Overshoot easing shared by the hub grow and every bloom. */
export const OVERSHOOT = 'cubic-bezier(.2,.9,.3,1.25)';
export const HUB_IN_MS = 160;
export const BLOOM_MS = 240;
export const BLOOM_STAGGER_MS = 35;
export const PULL_MS = 170;
export const PULL_STAGGER_MS = 12;
export const PULL_KIDS_MS = 150;
export const LINK_MS = 220;
export const HUB_OUT_MS = 120;
export const DROP_MS = 300;
export const DROP_EASING = 'cubic-bezier(.5,0,.8,.4)';
/** Marks the bubble a confirmed build is dropping from (see RingMenu's onBuildingClick). */
export const DROPPING_ATTR = 'data-dropping';

const BUBBLES = '.ring-bubble';

function centreOf(el: HTMLElement): Point {
  return { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 };
}

function all(root: ParentNode, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

/** The ring hub's centre, in the backdrop's coordinate space. */
export function hubCentre(root: HTMLElement): Point | null {
  const hub = root.querySelector<HTMLElement>('.ring-hub');
  return hub ? centreOf(hub) : null;
}

const toward = (el: HTMLElement, to: Point) => {
  const c = centreOf(el);
  return `translate(${to.x - c.x}px, ${to.y - c.y}px) scale(.3)`;
};

/** Bubbles flying out of a point, one after another. `delay` lets a hub grow finish first. */
function bloomBubbles(els: HTMLElement[], from: Point, delay = 0): Promise<void>[] {
  return els.map((el, i) =>
    animate(
      el,
      [{ opacity: 0, transform: toward(el, from) }, { opacity: 1, transform: 'none' }],
      { duration: BLOOM_MS, delay: delay + i * BLOOM_STAGGER_MS, easing: OVERSHOOT },
    ),
  );
}

/**
 * O1: the hub scales in first, then each lane-1 bubble flies out of the hub
 * centre in turn (invisible until its own turn: the backwards fill holds the
 * first frame through the delay).
 */
export function openRing(root: HTMLElement): Promise<void> {
  if (!motionEnabled()) return Promise.resolve();
  const hub = root.querySelector<HTMLElement>('.ring-hub');
  const from = hub ? centreOf(hub) : null;
  if (!hub || !from) return Promise.resolve();
  const pending: Promise<void>[] = [
    animate(hub, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'none' }], { duration: HUB_IN_MS, easing: OVERSHOOT }),
    ...all(root, '.ring-track').map((t) =>
      animate(t, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], { duration: BLOOM_MS, easing: 'ease-out' }),
    ),
    ...bloomBubbles(all(root, `${BUBBLES}:not(.child)`), from, HUB_IN_MS),
  ];
  return Promise.all(pending).then(() => undefined);
}

export type Layer = 'lane1' | 'kids';

/** What a layer swap pulls in before the DOM changes. Resolves when the pull has finished. */
export function layerOut(root: HTMLElement, layer: Layer, to: Point): Promise<void> {
  if (!motionEnabled()) return Promise.resolve();
  const sel = layer === 'lane1' ? `${BUBBLES}:not(.child)` : `${BUBBLES}.child`;
  const dur = layer === 'lane1' ? PULL_MS : PULL_KIDS_MS;
  const pulls = all(root, sel).map((el, i) =>
    animate(
      el,
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: toward(el, to) }],
      { duration: dur, delay: i * PULL_STAGGER_MS, easing: 'ease-in', fill: 'both' },
    ),
  );
  if (layer === 'kids') {
    for (const link of all(root, '.ring-link')) animate(link, [{ opacity: 0.45 }, { opacity: 0 }], { duration: 140, fill: 'both' });
    for (const track of all(root, '.ring-track.faint')) animate(track, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'both' });
  }
  return Promise.all(pulls).then(() => undefined);
}

/** After the DOM has swapped: the new layer blooms out of `from` (the hub, or the category bubble). */
export function layerIn(root: HTMLElement, layer: Layer, from: Point): Promise<void> {
  if (!motionEnabled()) return Promise.resolve();
  if (layer === 'lane1') return Promise.all(bloomBubbles(all(root, `${BUBBLES}:not(.child)`), from)).then(() => undefined);
  const links = all(root, '.ring-link').map((link, i) => {
    const base = link.style.transform;
    return animate(link, [{ transform: `${base} scaleX(0)` }, { transform: `${base} scaleX(1)` }], {
      duration: LINK_MS,
      delay: i * BLOOM_STAGGER_MS,
      easing: 'ease-out',
    });
  });
  const tracks = all(root, '.ring-track.faint').map((t) => animate(t, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 }));
  return Promise.all([...links, ...tracks, ...bloomBubbles(all(root, `${BUBBLES}.child`), from)]).then(() => undefined);
}

/** Cancels any exit animation still holding an element in its final frame (for elements that outlive a swap). */
export function release(root: HTMLElement): void {
  for (const el of all(root, '*')) for (const a of el.getAnimations?.() ?? []) if (a.effect && a.playState === 'finished') a.cancel();
}

/**
 * X1: a blocked building (or root action) shakes sideways via the `translate`
 * property, so it does not fight the CSS `transform` hover lift; its lock /
 * clock badge wobbles and the reason line flashes amber. Under reduced motion
 * only the reason flash plays.
 */
export function shake(bubble: HTMLElement, reason?: HTMLElement | null): Promise<void> {
  flashReason(reason);
  if (!motionEnabled()) return Promise.resolve();
  const badge = bubble.querySelector<HTMLElement>('.ring-badge');
  if (badge) {
    animate(badge, [{ transform: 'rotate(0)' }, { transform: 'rotate(-28deg)' }, { transform: 'rotate(24deg)' }, { transform: 'rotate(0)' }], {
      duration: 300,
    });
  }
  return animate(
    bubble,
    ['0 0', '-5px 0', '5px 0', '-3px 0', '2px 0', '0 0'].map((translate) => ({ translate })),
    { duration: 280 },
  );
}

/** The reason line (card status footer / hint chip) flashes amber: a colour change, so it plays under reduced motion too. */
export function flashReason(reason?: HTMLElement | null): Promise<void> {
  if (!reason) return Promise.resolve();
  return animate(reason, [{ background: 'rgba(240,166,74,.35)' }, { background: 'rgba(240,166,74,0)' }], { duration: 520, always: true });
}

/** X11: the hub / ‹ BACK squish before going back. */
export function press(el: HTMLElement): Promise<void> {
  return animate(el, [{ transform: 'none' }, { transform: 'scale(.9)' }, { transform: 'scale(1.04)' }, { transform: 'none' }], { duration: 220 });
}

/** Stops the retracting ring from catching pointer events, so a map drag started on it goes straight through. */
function makeInert(root: HTMLElement): void {
  root.style.pointerEvents = 'none';
  for (const el of all(root, '*')) el.style.pointerEvents = 'none';
}

/**
 * X3 (and X2 for a build): the ring leaves. Every bubble is pulled into the
 * hub (170 ms), then the hub scales to .3 and fades (120 ms). If a bubble is
 * marked `data-dropping` (a confirmed build) it drops onto the hex instead
 * (300 ms) while the rest retract at the same time. Resolves when it is safe
 * to remove the element; always resolves at once under reduced motion.
 */
export async function retractRing(root: HTMLElement): Promise<void> {
  if (!motionEnabled()) return;
  const hub = root.querySelector<HTMLElement>('.ring-hub');
  const to = hub ? centreOf(hub) : null;
  if (!hub || !to) return;
  makeInert(root);

  const dropping = root.querySelector<HTMLElement>(`[${DROPPING_ATTR}]`);
  const others = all(root, BUBBLES).filter((el) => el !== dropping);
  const chrome = all(root, '.ring-track, .ring-leader, .ring-link, .ring-card, .ring-hint, .ring-note');
  for (const el of chrome) animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: dropping ? 160 : PULL_MS, easing: 'ease-in', fill: 'both' });

  if (dropping) {
    const c = centreOf(dropping);
    const drop = animate(
      dropping,
      [{ opacity: 1, transform: 'none' }, { opacity: 0.9, transform: `translate(${to.x - c.x}px, ${to.y - c.y}px) scale(.35)` }],
      { duration: DROP_MS, easing: DROP_EASING, fill: 'both' },
    );
    for (const el of others) {
      animate(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: toward(el, to) }], { duration: 190, easing: 'ease-in', fill: 'both' });
    }
    animate(hub, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.4)' }], { duration: 200, delay: 80, easing: 'ease-in', fill: 'both' });
    await drop;
    return;
  }

  await Promise.all(
    others.map((el, i) =>
      animate(
        el,
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: toward(el, to) }],
        { duration: PULL_MS, delay: Math.min(i, 8) * PULL_STAGGER_MS, easing: 'ease-in', fill: 'both' },
      ),
    ),
  );
  await animate(hub, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.3)' }], { duration: HUB_OUT_MS, easing: 'ease-in', fill: 'both' });
}

/** Re-exported so callers that sequence a retract with a timer share one clock. */
export { wait };
