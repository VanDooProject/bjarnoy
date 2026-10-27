// Test double for the Web Animations API (jsdom has none): every `animate()`
// call is recorded, and `finished` resolves after delay + duration on the
// (fake) timer clock, so a test can drive a choreography with
// `vi.advanceTimersByTimeAsync`.
import { vi } from 'vitest';

export interface RecordedAnimation {
  el: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
}

export function installWaapi(reduced = false) {
  const calls: RecordedAnimation[] = [];
  const original = Element.prototype.animate;
  const originalMatchMedia = window.matchMedia;
  Element.prototype.animate = function (this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
    calls.push({ el: this, frames, options });
    const ms = Number(options.delay ?? 0) + Number(options.duration ?? 0);
    return {
      finished: new Promise<Animation>((resolve) => setTimeout(() => resolve({} as Animation), ms)),
      playState: 'running',
      effect: {},
      cancel() {},
    } as unknown as Animation;
  } as typeof Element.prototype.animate;
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  return {
    calls,
    /** Frames recorded for animations on elements matching `selector`. */
    on(selector: string) {
      return calls.filter((c) => c.el.matches(selector));
    },
    uninstall() {
      Element.prototype.animate = original;
      window.matchMedia = originalMatchMedia;
      vi.useRealTimers();
    },
  };
}
