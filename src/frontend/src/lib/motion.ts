/**
 * Shared helpers for the HUD's small UI animations (ring menu choreography,
 * queue feedback, resource tick-down). Everything funnels through `animate`,
 * a thin Web Animations wrapper, so that `prefers-reduced-motion: reduce` is
 * honoured in exactly one place: by default a reduced-motion animation is
 * skipped (the element simply ends in its resting state), and a caller that
 * wants a quiet stand-in instead passes `reduced` frames (played as a short
 * fade, never longer than REDUCED_MAX_MS) or `always` for feedback that is
 * not motion at all (a colour flash).
 */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/** Longest a reduced-motion stand-in may run. */
export const REDUCED_MAX_MS = 120;

/** Whether the user asked the OS / browser for less motion. False where matchMedia is missing (jsdom). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_QUERY).matches;
  } catch {
    return false;
  }
}

/** Whether the Web Animations API exists here at all (not in jsdom). */
export function supportsWaapi(): boolean {
  return typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
}

/** Whether a motion animation would actually play: WAAPI available and no reduced-motion preference. */
export function motionEnabled(): boolean {
  return supportsWaapi() && !prefersReducedMotion();
}

export interface AnimateOptions extends KeyframeAnimationOptions {
  /** Play even under reduced motion, at full length: for feedback that is not movement (a colour flash). */
  always?: boolean;
  /** Reduced-motion stand-in frames, played as a fade of at most REDUCED_MAX_MS. Without them the animation is skipped. */
  reduced?: Keyframe[];
}

/** An animation that ran, plus its promise: resolves when it finishes or is cancelled, never rejects. */
export interface Playing {
  animation: Animation | null;
  finished: Promise<void>;
}

/**
 * Starts a Web Animation and returns it with a promise that resolves once it
 * has finished (or been cancelled). Defaults to `fill: 'backwards'` so an
 * entrance holds its first frame through its delay but leaves NO inline
 * transform behind afterwards — a lingering fill would block the CSS hover
 * transform on the same element.
 */
export function play(el: Element, frames: Keyframe[], options: AnimateOptions = {}): Playing {
  const { always, reduced, ...timing } = options;
  if (!supportsWaapi()) return { animation: null, finished: Promise.resolve() };
  if (prefersReducedMotion() && !always) {
    if (!reduced) return { animation: null, finished: Promise.resolve() };
    const duration = Math.min(REDUCED_MAX_MS, Number(timing.duration ?? REDUCED_MAX_MS));
    const animation = el.animate(reduced, { fill: 'backwards', duration, easing: 'linear' });
    return { animation, finished: animation.finished.then(() => undefined, () => undefined) };
  }
  const animation = el.animate(frames, { fill: 'backwards', ...timing });
  return { animation, finished: animation.finished.then(() => undefined, () => undefined) };
}

/** `play(...).finished` for callers that only want to await it. */
export function animate(el: Element, frames: Keyframe[], options: AnimateOptions = {}): Promise<void> {
  return play(el, frames, options).finished;
}

/** Resolves after `ms` (a plain timer, so fake timers drive it in tests). */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
