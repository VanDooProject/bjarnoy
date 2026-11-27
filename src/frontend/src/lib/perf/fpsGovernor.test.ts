import { beforeEach, describe, expect, it } from 'vitest';
import { FpsGovernor, type GovernorGates } from './fpsGovernor';

const open: GovernorGates = { up: true, down: true };

// Frame intervals below use fps values whose interval is an exact binary
// fraction (100fps -> 10ms, 20fps -> 50ms, 128fps, 64fps, 32fps), so summing
// frames never drifts below the 1000ms bucket boundary by float error alone.
function feed(governor: FpsGovernor, fps: number, seconds: number, gates: GovernorGates = open): void {
  const frameMs = 1000 / fps;
  const frames = Math.round(fps * seconds);
  for (let i = 0; i < frames; i++) governor.sample(frameMs, gates);
}

describe('FpsGovernor with two levels (the animation setting)', () => {
  let governor: FpsGovernor;

  beforeEach(() => {
    governor = new FpsGovernor(2);
  });

  it('starts at level 0 with nothing failed', () => {
    expect(governor.getLevel()).toBe(0);
    expect(governor.hasFailures()).toBe(false);
  });

  it('does not climb before 10s of sustained >= 30fps', () => {
    feed(governor, 100, 9);
    expect(governor.getLevel()).toBe(0);
  });

  it('climbs after 10s of sustained >= 30fps', () => {
    feed(governor, 100, 10);
    expect(governor.getLevel()).toBe(1);
  });

  it('counts a bucket just over 30fps as good', () => {
    feed(governor, 32, 10);
    expect(governor.getLevel()).toBe(1);
  });

  it('a bucket under 30fps does not count', () => {
    feed(governor, 20, 30);
    expect(governor.getLevel()).toBe(0);
  });

  it('reports the last bucket fps and the up window progress', () => {
    expect(governor.getProgress()).toEqual({ fps: null, window: 'up', goodMs: 0, requiredMs: 10_000, thresholdFps: 30 });
    feed(governor, 100, 4);
    expect(governor.getProgress()).toMatchObject({ fps: 100, goodMs: 4000 });
    feed(governor, 20, 1);
    expect(governor.getProgress()).toMatchObject({ fps: 20, goodMs: 0 });
  });

  it('a single hitch within a bucket does not block climbing', () => {
    for (let bucket = 0; bucket < 10; bucket++) {
      for (let frame = 0; frame < 100; frame++) {
        governor.sample(bucket === 5 && frame === 0 ? 100 : 10, open);
      }
    }
    expect(governor.getLevel()).toBe(1);
  });

  it('a slow bucket resets the streak', () => {
    feed(governor, 100, 8);
    feed(governor, 20, 1);
    feed(governor, 100, 8);
    expect(governor.getLevel()).toBe(0);
    feed(governor, 100, 2);
    expect(governor.getLevel()).toBe(1);
  });

  it('drops after 5s sustained under 30fps and records the failure', () => {
    feed(governor, 100, 10);
    expect(governor.getLevel()).toBe(1);
    feed(governor, 20, 4);
    expect(governor.getLevel()).toBe(1);
    expect(governor.getProgress()).toMatchObject({ window: 'down', goodMs: 4000, requiredMs: 5000 });
    feed(governor, 20, 1);
    expect(governor.getLevel()).toBe(0);
    expect(governor.failures(1)).toBe(1);
    expect(governor.hasFailures()).toBe(true);
  });

  it('reset() keeps level and failures but restarts the running window', () => {
    feed(governor, 100, 10);
    feed(governor, 20, 5);
    expect(governor.getLevel()).toBe(0);
    governor.reset();
    expect(governor.failures(1)).toBe(1);
    feed(governor, 100, 8);
    governor.reset();
    feed(governor, 100, 8);
    expect(governor.getLevel()).toBe(0);
  });

  it('ignores non-positive frame intervals', () => {
    governor.sample(0, open);
    governor.sample(-5, open);
    expect(governor.getProgress().fps).toBeNull();
    expect(governor.getLevel()).toBe(0);
  });
});

describe('FpsGovernor retry and latch', () => {
  it('after one failure the step needs 30s at >= 60fps; 45fps for 60s does not climb', () => {
    const governor = new FpsGovernor(2);
    feed(governor, 100, 10);
    feed(governor, 20, 5);
    expect(governor.getLevel()).toBe(0);
    expect(governor.canClimbNormally()).toBe(false);
    expect(governor.getProgress()).toMatchObject({ window: 'retry', requiredMs: 30_000, thresholdFps: 60 });
    feed(governor, 40, 60);
    expect(governor.getLevel()).toBe(0);
    feed(governor, 64, 29);
    expect(governor.getLevel()).toBe(0);
    feed(governor, 64, 1);
    expect(governor.getLevel()).toBe(1);
  });

  it('a second failure at a level latches it for the session', () => {
    const governor = new FpsGovernor(2);
    feed(governor, 100, 10);
    feed(governor, 20, 5);
    feed(governor, 128, 30);
    expect(governor.getLevel()).toBe(1);
    feed(governor, 20, 5);
    expect(governor.getLevel()).toBe(0);
    expect(governor.failures(1)).toBe(2);
    feed(governor, 128, 120);
    expect(governor.getLevel()).toBe(0);
    expect(governor.getProgress().window).toBeNull();
  });
});

describe('FpsGovernor with several levels', () => {
  it('climbs one step per window with a fresh window after each step', () => {
    const governor = new FpsGovernor(3);
    feed(governor, 100, 10);
    expect(governor.getLevel()).toBe(1);
    feed(governor, 100, 9);
    expect(governor.getLevel()).toBe(1);
    feed(governor, 100, 1);
    expect(governor.getLevel()).toBe(2);
    feed(governor, 100, 60);
    expect(governor.getLevel()).toBe(2);
    expect(governor.getProgress().window).toBeNull();
  });

  it('drops one step per window', () => {
    const governor = new FpsGovernor(3);
    feed(governor, 100, 20);
    expect(governor.getLevel()).toBe(2);
    feed(governor, 20, 5);
    expect(governor.getLevel()).toBe(1);
    feed(governor, 20, 4);
    expect(governor.getLevel()).toBe(1);
    feed(governor, 20, 1);
    expect(governor.getLevel()).toBe(0);
  });

  it('every level that was dropped out of needs its own retry', () => {
    const governor = new FpsGovernor(3);
    feed(governor, 100, 20);
    feed(governor, 20, 5);
    expect(governor.getLevel()).toBe(1);
    expect(governor.canClimbNormally()).toBe(false);
    feed(governor, 20, 5);
    expect(governor.getLevel()).toBe(0);
    expect(governor.failures(1)).toBe(1);
    expect(governor.failures(2)).toBe(1);
    expect(governor.canClimbNormally()).toBe(false);
  });
});

describe('FpsGovernor gates', () => {
  it('a closed up gate blocks climbing and restarts the window once open', () => {
    const governor = new FpsGovernor(2);
    feed(governor, 100, 8);
    feed(governor, 100, 5, { up: false, down: true });
    expect(governor.getLevel()).toBe(0);
    feed(governor, 100, 9);
    expect(governor.getLevel()).toBe(0);
    feed(governor, 100, 1);
    expect(governor.getLevel()).toBe(1);
  });

  it('a closed down gate blocks dropping and restarts the window once open', () => {
    const governor = new FpsGovernor(2);
    feed(governor, 100, 10);
    feed(governor, 20, 4);
    feed(governor, 20, 10, { up: true, down: false });
    expect(governor.getLevel()).toBe(1);
    feed(governor, 20, 4);
    expect(governor.getLevel()).toBe(1);
    feed(governor, 20, 1);
    expect(governor.getLevel()).toBe(0);
  });
});
