import { describe, expect, it } from 'vitest';
import { unlockLadder } from './unlocks';
import { def, group } from './testFixtures';

function lh(max: number) {
  return Array.from({ length: max }, (_, i) => def('longhouse', i + 1));
}

describe('unlockLadder', () => {
  it('lists types by the Longhouse level their level-1 definition requires, with prerequisites', () => {
    const ladder = unlockLadder(
      group([
        ...lh(4),
        def('farm', 1, { reqLh: 1 }),
        def('farm', 2, { reqLh: 3 }), // level 2 must not count as an unlock
        def('mill', 1, { reqLh: 2, prereqs: [{ type: 'farm', level: 5 }] }),
      ]),
    );
    expect(ladder.map((l) => l.level)).toEqual([1, 2, 3, 4]);
    expect(ladder[0].unlocks.map((u) => u.type)).toEqual(['farm', 'longhouse']);
    expect(ladder[1].unlocks).toEqual([{ type: 'mill', prerequisites: [{ type: 'farm', level: 5 }] }]);
    expect(ladder[2].unlocks).toEqual([]);
  });

  it('flags bulk levels (more than two unlocks)', () => {
    const ladder = unlockLadder(
      group([...lh(3), def('a', 1, { reqLh: 2 }), def('b', 1, { reqLh: 2 }), def('c', 1, { reqLh: 2 }), def('d', 1, { reqLh: 3 })]),
    );
    expect(ladder.map((l) => l.bulk)).toEqual([false, true, false]);
  });

  it('flags only runs of three or more empty levels as gaps', () => {
    const ladder = unlockLadder(group([...lh(8), def('a', 1, { reqLh: 4 }), def('b', 1, { reqLh: 5 }), def('c', 1, { reqLh: 8 })]));
    // level 1: longhouse; 2,3 empty (run of 2); 4,5 unlocks; 6,7 empty (run of 2); 8 unlock
    expect(ladder.some((l) => l.gap)).toBe(false);

    const gappy = unlockLadder(group([...lh(7), def('a', 1, { reqLh: 5 })]));
    expect(gappy.map((l) => l.gap)).toEqual([false, true, true, true, false, false, false]); // 6-7 is a run of only 2
  });
});
