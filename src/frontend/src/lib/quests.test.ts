import { describe, expect, it } from 'vitest';
import { evaluateDemoQuests, questBit, rewardOverflows } from './quests';

const done = (list: ReturnType<typeof evaluateDemoQuests>) => list.filter((q) => q.completed).map((q) => q.id);

describe('demo quests', () => {
  it('lists the eight quests in tutorial order', () => {
    const list = evaluateDemoQuests({ level: 1, counts: { longhouse: 1 } }, 0);
    expect(list.map((q) => q.id)).toEqual([
      'producers3', 'longhouse2', 'storagehouse1', 'producers6', 'longhouse3', 'longhouse5', 'spearmen5', 'hunt1',
    ]);
    expect(list.every((q) => !q.completed && !q.claimed)).toBe(true);
    expect(list[1].reward).toEqual({ wood: 250, stone: 200, food: 150, iron: 0 });
  });

  it('counts only resource producers toward the producer quests', () => {
    const counts = { longhouse: 1, lumberjack: 1, farm: 1, storagehouse: 2, tower: 3 };
    expect(done(evaluateDemoQuests({ level: 1, counts }, 0))).toEqual(['storagehouse1']);
    expect(done(evaluateDemoQuests({ level: 1, counts: { ...counts, quarry: 1 } }, 0))).toContain('producers3');
    expect(done(evaluateDemoQuests({ level: 1, counts: { reindeerherder: 3, fishinghut: 3 } }, 0))).toContain('producers6');
  });

  it('follows the longhouse level and reads the claimed mask bit by bit', () => {
    const list = evaluateDemoQuests({ level: 3, counts: {} }, 1 << questBit('longhouse2'));
    expect(done(list)).toEqual(['longhouse2', 'longhouse3']);
    expect(list.filter((q) => q.claimed).map((q) => q.id)).toEqual(['longhouse2']);
  });

  it('completes the spearmen quest from five fighting land units at home', () => {
    expect(done(evaluateDemoQuests({ level: 1, counts: {} }, 0))).not.toContain('spearmen5');
    expect(done(evaluateDemoQuests({ level: 1, counts: {}, fightingLandUnits: 4 }, 0))).not.toContain('spearmen5');
    const list = evaluateDemoQuests({ level: 1, counts: {}, fightingLandUnits: 5 }, 0);
    expect(done(list)).toEqual(['spearmen5']);
    expect(list.find((q) => q.id === 'spearmen5')?.reward).toEqual({ wood: 500, stone: 400, food: 300, iron: 0 });
    expect(questBit('spearmen5')).toBe(6);
  });

  it('completes the hunt quest only once a hunt was started', () => {
    expect(done(evaluateDemoQuests({ level: 1, counts: {} }, 0))).not.toContain('hunt1');
    const list = evaluateDemoQuests({ level: 1, counts: {}, huntStarted: true }, 0);
    expect(done(list)).toEqual(['hunt1']);
    expect(list.find((q) => q.id === 'hunt1')?.reward).toEqual({ wood: 400, stone: 300, food: 300, iron: 0 });
    expect(questBit('hunt1')).toBe(7);
  });

  it('flags a reward that would not fit in storage', () => {
    const cap = { wood: 500, stone: 500, food: 500, iron: 500 };
    const reward = { wood: 250, stone: 200, food: 150, iron: 0 };
    expect(rewardOverflows(reward, { wood: 250, stone: 300, food: 350, iron: 0 }, cap)).toBe(false);
    expect(rewardOverflows(reward, { wood: 251, stone: 0, food: 0, iron: 0 }, cap)).toBe(true);
  });
});
