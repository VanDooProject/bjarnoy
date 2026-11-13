import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_MS, LONG_PRESS_SLOP_PX, LongPressTracker } from './longPress';

describe('LongPressTracker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function make() {
    const onStart = vi.fn();
    const onCancel = vi.fn();
    const onFire = vi.fn();
    return { tracker: new LongPressTracker({ onStart, onCancel, onFire }), onStart, onCancel, onFire };
  }

  it('fires once after LONG_PRESS_MS with the point it started at, and does not report a cancel', () => {
    const { tracker, onStart, onCancel, onFire } = make();
    tracker.start({ x: 10, y: 20 });
    expect(onStart).toHaveBeenCalledWith({ x: 10, y: 20 });
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire).toHaveBeenCalledWith({ x: 10, y: 20 });
    expect(onCancel).not.toHaveBeenCalled();
    expect(tracker.holding).toBe(false);
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('a release before the time cancels the hold and never fires', () => {
    const { tracker, onCancel, onFire } = make();
    tracker.start({ x: 0, y: 0 });
    vi.advanceTimersByTime(LONG_PRESS_MS - 10);
    tracker.cancel();
    vi.advanceTimersByTime(1000);
    expect(onFire).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('drifting within the slop keeps the hold, drifting past it cancels it', () => {
    const { tracker, onCancel, onFire } = make();
    tracker.start({ x: 100, y: 100 });
    tracker.move({ x: 100 + LONG_PRESS_SLOP_PX - 1, y: 100 });
    expect(tracker.holding).toBe(true);
    tracker.move({ x: 100 + LONG_PRESS_SLOP_PX, y: 100 });
    expect(tracker.holding).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('cancel and move without a running hold do nothing', () => {
    const { tracker, onCancel } = make();
    tracker.cancel();
    tracker.move({ x: 500, y: 500 });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('starting again restarts the clock', () => {
    const { tracker, onFire } = make();
    tracker.start({ x: 0, y: 0 });
    vi.advanceTimersByTime(LONG_PRESS_MS - 100);
    tracker.start({ x: 5, y: 5 });
    vi.advanceTimersByTime(200);
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire).toHaveBeenCalledWith({ x: 5, y: 5 });
  });
});
