// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { motionPreferences } from './perf/motionPreferences';
import { installHudMotionAttribute } from './perf/hudMotionAttribute';
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

describe('HUD motion setting', () => {
  const original = Element.prototype.animate;
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    motionPreferences.hud = 'auto';
    Element.prototype.animate = original;
    window.matchMedia = originalMatchMedia;
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.hudMotion;
  });

  it("'on' plays full motion even when the OS asks for reduced motion", () => {
    stubMatchMedia(true);
    stubAnimate();
    motionPreferences.hud = 'on';
    expect(prefersReducedMotion()).toBe(false);
    expect(motionEnabled()).toBe(true);
  });

  it("'off' reduces motion even when the OS does not ask for it", () => {
    stubMatchMedia(false);
    stubAnimate();
    motionPreferences.hud = 'off';
    expect(prefersReducedMotion()).toBe(true);
    expect(motionEnabled()).toBe(false);
  });

  it("'auto' follows the live OS query", () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('mirrors the setting onto <html data-hud-motion>', async () => {
    const stop = installHudMotionAttribute();
    motionPreferences.hud = 'on';
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.dataset.hudMotion).toBe('full');
    motionPreferences.hud = 'off';
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.dataset.hudMotion).toBe('reduced');
    stop.stop();
  });
});
