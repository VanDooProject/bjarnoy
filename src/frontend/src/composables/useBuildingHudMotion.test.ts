// @vitest-environment jsdom
//
// The building HUD's motion: the wave delay, which tier change is which resize, the show / hide with its reversal, the box
// resize with the old rows fading out above the new ones, and the reduced-motion fade. Web Animations are a recording stand-in.
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAnimation, installFakeAnimate, type FakeAnimate } from '../test/fakeAnimate';
import { animationPreference } from '../lib/perf/animationPreference';
import { motionPreferences } from '../lib/perf/motionPreferences';
import { HUD_MOTION, boxChangeFor, createBuildingHudMotion, hudReducedMotion, motionStyleFor, waveDelayMs, waveDelays } from './useBuildingHudMotion';

describe('the wave', () => {
  it('waits 1.2 ms per px from the Longhouse and never longer than 450 ms', () => {
    expect(waveDelayMs(0)).toBe(0);
    expect(waveDelayMs(100)).toBe(120);
    expect(waveDelayMs(374)).toBe(449);
    expect(waveDelayMs(375)).toBe(450);
    expect(waveDelayMs(2000)).toBe(450);
  });

  it('measures every marker against the Longhouse marker; without one nothing waits', () => {
    const points = [
      { key: 'lh', x: 100, y: 100 },
      { key: 'a', x: 160, y: 180 },
      { key: 'b', x: 1000, y: 100 },
    ];
    const delays = waveDelays(points, points[0]!);
    expect(delays.get('lh')).toBe(0);
    expect(delays.get('a')).toBe(120);
    expect(delays.get('b')).toBe(450);
    expect([...waveDelays(points, null).values()]).toEqual([0, 0, 0]);
  });
});

describe('box change and reduced motion', () => {
  it('tells a resize by the tiers it goes between', () => {
    expect(boxChangeFor('mid', 'near')).toBe('grow');
    expect(boxChangeFor('near', 'mid')).toBe('shrink');
    expect(boxChangeFor('near', 'near')).toBe('content');
  });

  it('picks the fade only under the reduced-motion setting', () => {
    expect(motionStyleFor(true)).toBe('fade');
    expect(motionStyleFor(false)).toBe('full');
  });
});

function marker(delayMs = 0, withBox = true) {
  const dial = document.createElement('span');
  const box = withBox ? document.createElement('div') : null;
  return { key: 'k', dial, box, delayMs };
}

describe('setShown', () => {
  let fake: FakeAnimate | undefined;
  afterEach(() => fake?.restore());

  it('settles at once where Web Animations are missing', async () => {
    await expect(createBuildingHudMotion(() => false).setShown(false, [marker()])).resolves.toBeUndefined();
  });

  it('hides: the box folds first, then the dial spins away around its centre, delayed by the wave', async () => {
    fake = installFakeAnimate();
    const m = marker(200);
    const motion = createBuildingHudMotion(() => false);
    let settled = false;
    void motion.setShown(false, [m]).then(() => (settled = true));
    const [fold, spin] = fake.animations as [FakeAnimation, FakeAnimation];
    expect(fold.target).toBe(m.box);
    expect(fold.frames[1]).toMatchObject({ transform: 'scaleX(0)', opacity: 0 });
    expect(fold.timing).toMatchObject({ duration: 150, delay: 200 });
    expect(spin.target).toBe(m.dial);
    expect(spin.frames[1]).toMatchObject({ transform: 'rotate(-180deg) scale(0)', opacity: 0 });
    expect(spin.timing).toMatchObject({ duration: 300, delay: 300 });
    fold.finish();
    await Promise.resolve();
    expect(settled).toBe(false);
    spin.finish();
    await flushPromises();
    expect(settled).toBe(true);
    // The hidden marker stays hidden (last frame held) until it is taken out.
    expect(spin.playState).toBe('finished');
  });

  it('shows: the dial spins in with a small overshoot, the box unfolds after it', () => {
    fake = installFakeAnimate();
    const m = marker(100);
    void createBuildingHudMotion(() => false).setShown(true, [m]);
    const dial = fake.animations.find((a) => a.target === m.dial)!;
    const box = fake.animations.find((a) => a.target === m.box)!;
    expect(dial.frames[0]).toMatchObject({ transform: 'rotate(180deg) scale(0)', opacity: 0 });
    expect(dial.frames[1]).toMatchObject({ transform: 'rotate(-10deg) scale(1.06)', offset: 0.75 });
    expect(dial.timing).toMatchObject({ duration: 380, delay: 100 });
    expect(box.timing).toMatchObject({ duration: 220, delay: 100 + HUD_MOTION.showBoxDelay });
  });

  it('turns around cleanly: a show during a hide reverses the running animations instead of starting new ones', async () => {
    fake = installFakeAnimate();
    const m = marker();
    const motion = createBuildingHudMotion(() => false);
    const hidden = motion.setShown(false, [m]);
    const count = fake.animations.length;
    const shown = motion.setShown(true, [m]);
    expect(fake.animations).toHaveLength(count);
    expect(fake.animations.every((a) => a.reversed)).toBe(true);
    // Played back to the start, they are done: both calls settle, and the marker is left in its own state (effects dropped).
    fake.finishAll();
    await Promise.all([hidden, shown]);
    expect(fake.animations.every((a) => a.playState === 'idle')).toBe(true);
  });

  it('turns a hide around the other way too (hide during a show)', async () => {
    fake = installFakeAnimate();
    const m = marker();
    const motion = createBuildingHudMotion(() => false);
    const shown = motion.setShown(true, [m]);
    const hidden = motion.setShown(false, [m]);
    expect(fake.animations.every((a) => a.reversed)).toBe(true);
    fake.finishAll();
    await Promise.all([shown, hidden]);
    // Ended hidden: the last frame is held, not dropped.
    expect(fake.animations.every((a) => a.playState === 'finished')).toBe(true);
  });

  it('under reduced motion only fades the dial and box together: no delay, no transform', () => {
    fake = installFakeAnimate();
    const m = marker(400);
    void createBuildingHudMotion(() => true).setShown(false, [m]);
    expect(fake.animations).toHaveLength(2);
    for (const a of fake.animations) {
      expect(a.timing).toMatchObject({ duration: 150 });
      expect(a.timing.delay).toBeUndefined();
      expect(a.frames.every((f) => Object.keys(f).every((k) => k === 'opacity'))).toBe(true);
    }
  });
});

describe('morphBox', () => {
  let fake: FakeAnimate | undefined;
  afterEach(() => fake?.restore());

  /** A box with its measured size, as layout would report it (jsdom has none). */
  function sizedBox(width: number, height: number, withRows = true) {
    const box = document.createElement('div');
    Object.defineProperty(box, 'offsetWidth', { configurable: true, get: () => width });
    Object.defineProperty(box, 'offsetHeight', { configurable: true, get: () => height });
    if (withRows) {
      const rows = document.createElement('div');
      rows.className = 'hud-rows';
      box.appendChild(rows);
    }
    document.body.appendChild(box);
    return box;
  }

  it('resizes the one box in place from the old to the new size, keeping the old rows until 60 % when it grows', () => {
    fake = installFakeAnimate();
    const motion = createBuildingHudMotion(() => false);
    const box = sizedBox(80, 30);
    const from = motion.snapshotBox(box)!;
    expect(from).toMatchObject({ width: 80, height: 30 });
    // The new content is in: the box is bigger now.
    Object.defineProperty(box, 'offsetWidth', { configurable: true, get: () => 150 });
    Object.defineProperty(box, 'offsetHeight', { configurable: true, get: () => 48 });
    motion.morphBox(box, from, 'grow');

    const resize = fake.animations.find((a) => a.target === box)!;
    expect(resize.timing).toMatchObject({ duration: 300, easing: 'cubic-bezier(.4,0,.2,1)' });
    expect(resize.frames[0]).toMatchObject({ width: '80px', height: '30px' });
    expect(resize.frames[1]).toMatchObject({ width: '150px', height: '48px' });
    const ghost = box.querySelector('.hud-marker__ghost')!;
    const out = fake.animations.find((a) => a.target === ghost)!;
    expect(out.timing).toMatchObject({ duration: 80, delay: 180 });
    const rowsIn = fake.animations.find((a) => a.target === box.querySelector(':scope > .hud-rows'))!;
    expect(rowsIn.timing).toMatchObject({ duration: 140, delay: 260 });

    fake.finishAll();
    expect(box.querySelector('.hud-marker__ghost')).toBeNull();
  });

  it('swaps the text first when it shrinks and resizes at the same time', () => {
    fake = installFakeAnimate();
    const motion = createBuildingHudMotion(() => false);
    const box = sizedBox(150, 48);
    const from = motion.snapshotBox(box);
    motion.morphBox(box, from, 'shrink');
    const ghost = box.querySelector('.hud-marker__ghost')!;
    expect(fake.animations.find((a) => a.target === ghost)!.timing).toMatchObject({ duration: 80, delay: 0 });
    expect(fake.animations.find((a) => a.target === box)!.timing).toMatchObject({ duration: 300 });
  });

  it('takes 240 ms for other content at the same tier', () => {
    fake = installFakeAnimate();
    const motion = createBuildingHudMotion(() => false);
    const box = sizedBox(100, 30);
    motion.morphBox(box, motion.snapshotBox(box), 'content');
    expect(fake.animations.find((a) => a.target === box)!.timing).toMatchObject({ duration: 240 });
  });

  it('a new change while one runs drops the running one (and its ghost) first', () => {
    fake = installFakeAnimate();
    const motion = createBuildingHudMotion(() => false);
    const box = sizedBox(100, 30);
    motion.morphBox(box, motion.snapshotBox(box), 'grow');
    const first = [...fake.animations];
    motion.morphBox(box, motion.snapshotBox(box), 'shrink');
    expect(first.every((a) => a.playState === 'idle')).toBe(true);
    expect(box.querySelectorAll('.hud-marker__ghost')).toHaveLength(1);
  });

  it('only cross-fades under reduced motion: the box does not resize', () => {
    fake = installFakeAnimate();
    const motion = createBuildingHudMotion(() => true);
    const box = sizedBox(100, 30);
    motion.morphBox(box, motion.snapshotBox(box), 'grow');
    expect(fake.animations.some((a) => a.target === box)).toBe(false);
    expect(fake.animations.every((a) => a.timing.duration === 150)).toBe(true);
  });
});

describe('box and number transitions', () => {
  let fake: FakeAnimate | undefined;
  afterEach(() => fake?.restore());

  it('folds into and unfolds from the dial, calling done when it ends', () => {
    fake = installFakeAnimate();
    const motion = createBuildingHudMotion(() => false);
    const el = document.createElement('div');
    let done = 0;
    motion.foldBox(el, () => done++);
    motion.unfoldBox(el, () => done++);
    expect(fake.animations.map((a) => a.timing.duration)).toEqual([160, 220]);
    expect(done).toBe(0);
    fake.finishAll();
    expect(done).toBe(2);
  });

  it('fades the number 150 ms and finishes at once without Web Animations', () => {
    const motion = createBuildingHudMotion(() => false);
    let done = 0;
    motion.fadeLabel(document.createElement('div'), 'in', () => done++);
    expect(done).toBe(1);
    fake = installFakeAnimate();
    motion.fadeLabel(document.createElement('div'), 'out', () => done++);
    expect(fake.animations[0]!.timing.duration).toBe(150);
  });

  it('uses only a fade for the fold under reduced motion', () => {
    fake = installFakeAnimate();
    createBuildingHudMotion(() => true).foldBox(document.createElement('div'), () => {});
    expect(fake.animations[0]!.frames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
  });
});

describe("the player's HUD motion setting decides, not the device flag", () => {
  let fake: FakeAnimate | undefined;
  beforeEach(() => {
    vi.spyOn(animationPreference, 'reducedMotion', 'get').mockReturnValue(true);
  });
  afterEach(() => {
    fake?.restore();
    fake = undefined;
    motionPreferences.hud = 'auto';
    vi.restoreAllMocks();
  });

  it("HUD menus 'on' plays full motion although the device asks for reduced motion", () => {
    motionPreferences.hud = 'on';
    expect(hudReducedMotion()).toBe(false);
    fake = installFakeAnimate();
    const near = marker(0);
    const far = { ...marker(300), key: 'far' };
    void createBuildingHudMotion().setShown(true, [near, far]);
    const spins = fake.animations.filter((a) => a.target === near.dial || a.target === far.dial);
    // The spin keyframes (transform), not the 150 ms opacity fade, each waiting its own wave delay.
    expect(spins.every((a) => 'transform' in a.frames[0]!)).toBe(true);
    expect(spins.map((a) => a.timing.delay)).toEqual([0, 300]);
    expect(spins.every((a) => a.timing.duration === HUD_MOTION.showDialSpin)).toBe(true);
  });

  it("HUD menus 'auto' follows the device flag: a 150 ms fade, no wave", () => {
    motionPreferences.hud = 'auto';
    expect(hudReducedMotion()).toBe(true);
    fake = installFakeAnimate();
    const m = marker(300);
    void createBuildingHudMotion().setShown(true, [m]);
    const dial = fake.animations.find((a) => a.target === m.dial)!;
    expect(dial.frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(dial.timing.delay).toBeUndefined();
  });

  it("HUD menus 'off' is reduced whatever the device says", () => {
    motionPreferences.hud = 'off';
    vi.spyOn(animationPreference, 'reducedMotion', 'get').mockReturnValue(false);
    expect(hudReducedMotion()).toBe(true);
  });
});
