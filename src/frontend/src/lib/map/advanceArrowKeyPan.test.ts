import { describe, expect, it } from 'vitest';
import { advanceArrowKeyPan, KEY_REPEAT_PAIR_MS, KEY_STEP_PX, pressArrowKey, type ArrowKey, type ArrowKeyState } from './HexMapRenderer';

/** Runs the pan in `px`-sized frames until no key is left (or `maxFrames`), returning the summed offset. */
function run(keys: Map<ArrowKey, ArrowKeyState>, px: number, maxFrames = 1000) {
  const total = { x: 0, y: 0 };
  for (let i = 0; i < maxFrames && keys.size > 0; i++) {
    const o = advanceArrowKeyPan(keys, px);
    if (o) {
      total.x += o.x;
      total.y += o.y;
    }
  }
  return total;
}

describe('advanceArrowKeyPan', () => {
  it('pans one full step for a press released before the first frame', () => {
    const keys = new Map<ArrowKey, ArrowKeyState>([['ArrowRight', { down: false, owedPx: KEY_STEP_PX }]]);
    const total = run(keys, 11.7);
    expect(total.x).toBeCloseTo(KEY_STEP_PX);
    expect(total.y).toBe(0);
    expect(keys.size).toBe(0);
  });

  it('gives n quick presses n steps, whatever the frame size', () => {
    for (const px of [5, 11.7, 70, 175]) {
      const keys = new Map<ArrowKey, ArrowKeyState>([['ArrowUp', { down: false, owedPx: 4 * KEY_STEP_PX }]]);
      expect(run(keys, px).y).toBeCloseTo(-4 * KEY_STEP_PX);
    }
  });

  it('keeps panning a full frame per frame while the key is down, past its step', () => {
    const keys = new Map<ArrowKey, ArrowKeyState>([['ArrowLeft', { down: true, owedPx: KEY_STEP_PX }]]);
    for (let i = 0; i < 50; i++) expect(advanceArrowKeyPan(keys, 12)).toEqual({ x: -12, y: 0 });
    expect(keys.get('ArrowLeft')).toEqual({ down: true, owedPx: 0 });
    keys.get('ArrowLeft')!.down = false;
    expect(advanceArrowKeyPan(keys, 12)).toBeNull();
    expect(keys.size).toBe(0);
  });

  it('normalises diagonals and cancels opposite keys', () => {
    const diagonal = new Map<ArrowKey, ArrowKeyState>([
      ['ArrowLeft', { down: true, owedPx: 0 }],
      ['ArrowDown', { down: true, owedPx: 0 }],
    ]);
    const o = advanceArrowKeyPan(diagonal, 10)!;
    expect(o.x).toBeCloseTo(-10 * Math.SQRT1_2);
    expect(o.y).toBeCloseTo(10 * Math.SQRT1_2);
    const opposite = new Map<ArrowKey, ArrowKeyState>([
      ['ArrowLeft', { down: true, owedPx: 0 }],
      ['ArrowRight', { down: true, owedPx: 0 }],
    ]);
    expect(advanceArrowKeyPan(opposite, 10)).toBeNull();
  });
});

describe('pressArrowKey', () => {
  it('adds one step per press, also while earlier steps are still owed', () => {
    const keys = new Map<ArrowKey, ArrowKeyState>();
    pressArrowKey(keys, 'ArrowRight', 0, false, undefined);
    keys.get('ArrowRight')!.down = false;
    pressArrowKey(keys, 'ArrowRight', 80, false, 60);
    expect(keys.get('ArrowRight')).toEqual({ down: true, owedPx: 2 * KEY_STEP_PX });
  });

  it('keeps a key down through auto-repeat sent as keyup+keydown pairs, without adding steps', () => {
    const keys = new Map<ArrowKey, ArrowKeyState>();
    pressArrowKey(keys, 'ArrowDown', 0, false, undefined);
    // Held past its step: the step is used up and the key keeps panning.
    advanceArrowKeyPan(keys, KEY_STEP_PX);
    for (let t = 500; t < 2000; t += 33) {
      keys.get('ArrowDown')!.down = false; // the pair's keyup at t
      advanceArrowKeyPan(keys, 1); // a frame between the two events must not drop the key
      pressArrowKey(keys, 'ArrowDown', t + 1, false, t);
      expect(keys.get('ArrowDown')).toEqual({ down: true, owedPx: 0 });
    }
    // The same with the repeat flag set, after the key was dropped.
    keys.clear();
    pressArrowKey(keys, 'ArrowDown', 3000, true, 2999);
    expect(keys.get('ArrowDown')).toEqual({ down: true, owedPx: 0 });
  });

  it('counts a keydown later than the repeat window after its keyup as a new press', () => {
    const keys = new Map<ArrowKey, ArrowKeyState>();
    pressArrowKey(keys, 'ArrowUp', 100 + KEY_REPEAT_PAIR_MS, false, 100);
    expect(keys.get('ArrowUp')!.owedPx).toBe(KEY_STEP_PX);
  });

  it('ignores a keydown for a key that is already down', () => {
    const keys = new Map<ArrowKey, ArrowKeyState>([['ArrowLeft', { down: true, owedPx: 40 }]]);
    pressArrowKey(keys, 'ArrowLeft', 10, false, undefined);
    expect(keys.get('ArrowLeft')).toEqual({ down: true, owedPx: 40 });
  });
});
