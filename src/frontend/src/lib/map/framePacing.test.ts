import { Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { FramePacer, GAP_SHARE, PACE_ABOVE_MS, PACE_BELOW_MS, attachFramePacing, type PacedTicker } from './framePacing';

function feed(pacer: FramePacer, ms: number, frames: number): number {
  let cap = 0;
  for (let i = 0; i < frames; i++) cap = pacer.record(ms);
  return cap;
}

describe('FramePacer', () => {
  it('leaves a loop that holds its frame budget uncapped', () => {
    expect(feed(new FramePacer(), 8, 200)).toBe(0);
    expect(feed(new FramePacer(), PACE_ABOVE_MS, 200)).toBe(0);
  });

  it('caps a loop whose frames are expensive so a gap is left after each one', () => {
    const cap = feed(new FramePacer(), 300, 50);
    expect(cap).toBeCloseTo(1000 / (300 * (1 + GAP_SHARE)), 1);
    // The period the cap allows is longer than the frame itself: that is the gap input and timers get.
    expect(1000 / cap).toBeGreaterThan(300 * 1.5);
  });

  it('keeps the cap until the frames are clearly cheap again, not just under the threshold', () => {
    const pacer = new FramePacer();
    feed(pacer, 300, 50);
    expect(feed(pacer, (PACE_ABOVE_MS + PACE_BELOW_MS) / 2, 200)).toBeGreaterThan(0);
    expect(feed(pacer, PACE_BELOW_MS - 10, 200)).toBe(0);
  });

  it('does not let one slow frame (a texture upload) pace a fast loop', () => {
    const pacer = new FramePacer();
    feed(pacer, 8, 100);
    expect(pacer.record(250)).toBe(0);
    expect(feed(pacer, 8, 20)).toBe(0);
  });

  it('forgets a stale measurement on reset', () => {
    const pacer = new FramePacer();
    feed(pacer, 300, 50);
    pacer.reset();
    expect(pacer.record(8)).toBe(0);
  });
});

describe('against Pixi\'s real Ticker', () => {
  it('survives every cap the pacer can ask for, in any order, without overflowing the maxFPS/minFPS setters', () => {
    // Regression: a cap below minFPS made Pixi's two setters call each other until the stack ran out
    // ("Maximum call stack size exceeded" in the page).
    const ticker = new Ticker();
    ticker.autoStart = false;
    const clock = { t: 1 };
    const watcher: { fn: ((frameStart: number) => void) | null } = { fn: null };
    const detach = attachFramePacing(ticker, {
      now: () => clock.t,
      requestFrame: (fn) => {
        watcher.fn = fn;
        return 1;
      },
      cancelFrame: () => {},
    });
    ticker.add(() => {}); // something to tick, so the pacing's own listeners are not alone
    let sawCap = false;
    // Frames whose cost sweeps up through every magnitude and back down, three times over.
    const costs = [...Array.from({ length: 140 }, (_, i) => 20 + i * 7), ...Array.from({ length: 90 }, (_, i) => 1000 - i * 11)];
    for (let pass = 0; pass < 3; pass++) {
      for (const ms of costs) {
        for (let i = 0; i < 30; i++) {
          clock.t += ms;
          watcher.fn?.(clock.t);
          ticker.update(clock.t);
          if (ticker.maxFPS > 0) sawCap = true;
        }
      }
    }
    detach();
    expect(sawCap).toBe(true);
    expect(ticker.maxFPS).toBe(0);
  });

  it('puts the ticker back as it found it when the pacing is detached', () => {
    const ticker = new Ticker();
    const minBefore = ticker.minFPS;
    const detach = attachFramePacing(ticker, {
      now: () => 0,
      requestFrame: () => 1,
      cancelFrame: () => {},
    });
    ticker.maxFPS = 2;
    expect(ticker.minFPS).toBeLessThan(minBefore);
    detach();
    expect(ticker.maxFPS).toBe(0);
    expect(ticker.minFPS).toBeCloseTo(minBefore, 6);
  });
});

describe('attachFramePacing', () => {
  /** A ticker whose frame costs `renderMs` of ticker work and then `stallMs` before the browser delivers the next frame. */
  function rig() {
    const clock = { t: 0 };
    const listeners: { fn: () => void; priority: number }[] = [];
    let frameCallback: ((frameStart: number) => void) | null = null;
    const ticker: PacedTicker = {
      maxFPS: 0,
      minFPS: 10,
      add: (fn, _ctx, priority = 0) => {
        listeners.push({ fn, priority });
      },
      remove: (fn) => {
        const i = listeners.findIndex((l) => l.fn === fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
    const env = {
      now: () => clock.t,
      requestFrame: (fn: (frameStart: number) => void) => {
        frameCallback = fn;
        return 1;
      },
      cancelFrame: () => {
        frameCallback = null;
      },
    };
    /** One animation frame: it starts `stallMs` after the last one ended, our watcher runs first (it is registered ahead of Pixi's own callback), then Pixi's ticker. */
    const frame = (workMs: number, stallMs: number) => {
      clock.t += stallMs;
      const frameStart = clock.t;
      const watcher = frameCallback;
      watcher?.(frameStart);
      // Pixi runs higher priorities first; the render sits between the two ends.
      for (const l of [...listeners].sort((a, b) => b.priority - a.priority)) {
        if (l.priority === 0) clock.t += workMs;
        l.fn();
      }
    };
    return { ticker, env, frame, listeners, clock, hasFrameCallback: () => frameCallback !== null };
  }

  it('counts the stall after a render, not just the ticker work, and caps an expensive frame', () => {
    const { ticker, env, frame } = rig();
    ticker.add(() => {}, undefined, 0);
    attachFramePacing(ticker, env);
    for (let i = 0; i < 30; i++) frame(3, 300);
    expect(ticker.maxFPS).toBeGreaterThan(0);
    expect(ticker.maxFPS).toBeLessThan(1000 / 300);
  });

  it('leaves a device that keeps up alone', () => {
    const { ticker, env, frame } = rig();
    ticker.add(() => {}, undefined, 0);
    attachFramePacing(ticker, env);
    for (let i = 0; i < 100; i++) frame(4, 12);
    expect(ticker.maxFPS).toBe(0);
  });

  it('does not take a long gap (a hidden tab) for a frame cost', () => {
    const { ticker, env, frame } = rig();
    ticker.add(() => {}, undefined, 0);
    attachFramePacing(ticker, env);
    for (let i = 0; i < 100; i++) frame(4, 12);
    frame(4, 5 * 60_000);
    for (let i = 0; i < 20; i++) frame(4, 12);
    expect(ticker.maxFPS).toBe(0);
  });

  it('lifts the cap and removes its listeners on detach', () => {
    const { ticker, env, frame, listeners, hasFrameCallback } = rig();
    ticker.add(() => {}, undefined, 0);
    const detach = attachFramePacing(ticker, env);
    for (let i = 0; i < 30; i++) frame(3, 300);
    detach();
    expect(ticker.maxFPS).toBe(0);
    expect(listeners).toHaveLength(1);
    expect(hasFrameCallback()).toBe(false);
  });
});
