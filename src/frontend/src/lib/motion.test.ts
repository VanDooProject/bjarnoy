// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MAX_MS, animate, motionEnabled, play, prefersReducedMotion } from './motion';

function stubMatchMedia(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query }));
  window.matchMedia = globalThis.matchMedia;
}

function stubAnimate() {
  const calls: { frames: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
  Element.prototype.animate = function (frames: Keyframe[], options: KeyframeAnimationOptions) {
    calls.push({ frames, options });
    return { finished: Promise.resolve() } as unknown as Animation;
  } as typeof Element.prototype.animate;
  return calls;
}

describe('motion helper', () => {
  const original = Element.prototype.animate;
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => {
    delete (Element.prototype as { animate?: unknown }).animate;
  });
  afterEach(() => {
    Element.prototype.animate = original;
    window.matchMedia = originalMatchMedia;
    vi.unstubAllGlobals();
  });

  it('is a no-op without the Web Animations API (jsdom) and says motion is off', async () => {
    const el = document.createElement('div');
    await expect(animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 })).resolves.toBeUndefined();
    expect(motionEnabled()).toBe(false);
  });

  it('plays the frames with a backwards fill by default', async () => {
    stubMatchMedia(false);
    const calls = stubAnimate();
    await animate(document.createElement('div'), [{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toMatchObject({ fill: 'backwards', duration: 240 });
    expect(motionEnabled()).toBe(true);
  });

  describe('under prefers-reduced-motion: reduce', () => {
    beforeEach(() => stubMatchMedia(true));

    it('detects the preference', () => {
      expect(prefersReducedMotion()).toBe(true);
      expect(motionEnabled()).toBe(false);
    });

    it('skips an animation that has no stand-in', async () => {
      const calls = stubAnimate();
      const playing = play(document.createElement('div'), [{ transform: 'scale(.3)' }, { transform: 'none' }], { duration: 300 });
      await playing.finished;
      expect(calls).toHaveLength(0);
      expect(playing.animation).toBeNull();
    });

    it('plays the reduced stand-in as a short fade instead, capped at the reduced maximum', async () => {
      const calls = stubAnimate();
      await animate(document.createElement('div'), [{ transform: 'scale(.3)' }], {
        duration: 900,
        reduced: [{ opacity: 0 }, { opacity: 1 }],
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
      expect(calls[0].options.duration).toBe(REDUCED_MAX_MS);
    });

    it('still plays feedback marked `always` (a colour flash is not movement), at full length', async () => {
      const calls = stubAnimate();
      await animate(document.createElement('div'), [{ background: 'red' }, { background: 'transparent' }], {
        duration: 520,
        always: true,
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].options.duration).toBe(520);
    });
  });
});
