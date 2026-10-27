/**
 * The small animations of the queue feedback after a confirmed build
 * (decided motions Q1 + Q5 for the desktop CONSTRUCTION card, P2 + P4 for the
 * phone drawer handle). Plain Web Animations through lib/motion.ts, so
 * reduced motion skips every one of them (the queue count still updates).
 */
import { animate, motionEnabled, wait } from '../motion';

export interface Point {
  x: number;
  y: number;
}

export const TOKEN_MS = 450;
export const CARD_IN_MS = 260;
export const ROW_IN_MS = 200;
export const COUNT_BUMP_MS = 360;
export const PEEK_OUT_MS = 220;
export const PEEK_HOLD_MS = 1500;
export const PEEK_BACK_MS = 200;
export const COUNT_POP_MS = 320;
export const HANDLE_PULSE_MS = 500;

const GOLD = '#ffc55c';

/** A 10 px gold token that flies from `from` to `to` (viewport coordinates) and is then removed. */
export async function flyToken(from: Point, to: Point): Promise<void> {
  if (!motionEnabled()) return;
  const token = document.createElement('div');
  Object.assign(token.style, {
    position: 'fixed',
    left: `${from.x - 5}px`,
    top: `${from.y - 5}px`,
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: GOLD,
    boxShadow: '0 0 6px rgba(255,197,92,.7)',
    zIndex: '60',
    pointerEvents: 'none',
  });
  token.dataset.testid = 'queue-token';
  document.body.appendChild(token);
  try {
    await animate(
      token,
      [
        { transform: 'none', opacity: 1 },
        { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(.6)`, opacity: 0.9 },
      ],
      { duration: TOKEN_MS, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'both' },
    );
  } finally {
    token.remove();
  }
}

/** Q5: the CONSTRUCTION card was hidden (no orders): it slides in from the left edge. */
export function slideInCard(card: Element): Promise<void> {
  return animate(card, [{ opacity: 0, transform: 'translateX(-24px)' }, { opacity: 1, transform: 'none' }], {
    duration: CARD_IN_MS,
    easing: 'cubic-bezier(.2,.9,.3,1.1)',
  });
}

/** Q1: the new row slides in where the token landed. */
export function slideInRow(row: Element): Promise<void> {
  return animate(row, [{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }], { duration: ROW_IN_MS });
}

/** Q1: the "N / M slots" count bumps (scale 1.35, gold) as the row lands. */
export function bumpCount(count: Element): Promise<void> {
  return animate(
    count,
    [
      { color: GOLD, transform: 'scale(1)' },
      { color: GOLD, transform: 'scale(1.35)', offset: 0.4 },
      { transform: 'none' },
    ],
    { duration: COUNT_BUMP_MS },
  );
}

/**
 * P2: the peek panel slides out from behind the phone queue handle, stays
 * 1.5 s and slides back. Resolves once it has retracted (the handle's pop and
 * pulse, P4, wait for that). Under reduced motion it never shows.
 */
export async function peek(panel: HTMLElement): Promise<void> {
  if (!motionEnabled()) return;
  await animate(panel, [{ transform: 'translateX(-100%)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
    duration: PEEK_OUT_MS,
    easing: 'cubic-bezier(.2,.9,.3,1.1)',
  });
  await wait(PEEK_HOLD_MS);
  await animate(panel, [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-100%)', opacity: 0 }], {
    duration: PEEK_BACK_MS,
    fill: 'both',
  });
}

/** P4: the handle's count chip pops (scale .6 -> 1.5 -> 1). */
export function popCount(chip: Element): Promise<void> {
  return animate(chip, [{ transform: 'scale(.6)' }, { transform: 'scale(1.5)', offset: 0.55 }, { transform: 'scale(1)' }], {
    duration: COUNT_POP_MS,
  });
}

/** P4: one gold border pulse around the handle. */
export function pulseHandle(handle: Element): Promise<void> {
  return animate(
    handle,
    [{ boxShadow: '0 0 0 0 rgba(255,197,92,.8)' }, { boxShadow: '0 0 0 8px rgba(255,197,92,0)' }],
    { duration: HANDLE_PULSE_MS },
  );
}
