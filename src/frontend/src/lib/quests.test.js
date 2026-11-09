import { describe, expect, it } from 'vitest';
import { evaluateDemoQuests, questBit, rewardOverflows } from './quests';
const done = (list) => list.filter((q) => q.completed).map((q) => q.id);
describe('demo quests', () => {
    it('lists the nine quests in tutorial order', () => {
        const list = evaluateDemoQuests({ level: 1, counts: { longhouse: 1 } }, 0);
        expect(list.map((q) => q.id)).toEqual([
            'producers3', 'longhouse2', 'storagehouse1', 'producers6', 'longhouse3', 'tower3', 'longhouse5', 'spearmen5', 'hunt1',
        ]);
        expect(list.every((q) => !q.completed && !q.claimed)).toBe(true);
        expect(list[1].reward).toEqual({ wood: 250, stone: 200, food: 150, iron: 0 });
    });
    it('gives every quest its own explicit bit, tower3 on bit 8, without renumbering the old ones', () => {
        const ids = ['producers3', 'longhouse2', 'storagehouse1', 'producers6', 'longhouse3', 'longhouse5', 'spearmen5', 'hunt1'];
        expect(ids.map(questBit)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(questBit('tower3')).toBe(8);
        expect(questBit('nope')).toBe(-1);
        const list = evaluateDemoQuests({ level: 1, counts: {} }, 1 << 8);
        expect(list.filter((q) => q.claimed).map((q) => q.id)).toEqual(['tower3']);
    });
    it('completes the tower quest from a Tower at level 3', () => {
        const base = { level: 1, counts: { tower: 1 } };
        expect(done(evaluateDemoQuests({ ...base, towerLevel: 2 }, 0))).not.toContain('tower3');
        const list = evaluateDemoQuests({ ...base, towerLevel: 3 }, 0);
        expect(done(list)).toEqual(['tower3']);
        expect(list.find((q) => q.id === 'tower3')?.reward).toEqual({ wood: 400, stone: 300, food: 200, iron: 0 });
    });
    it('reports counted progress clamped to the target, and none for hunt and storage house', () => {
        const p = (state, id) => evaluateDemoQuests(state, 0).find((q) => q.id === id)?.progress;
        expect(p({ level: 1, counts: { farm: 2 } }, 'producers3')).toEqual({ current: 2, target: 3 });
        expect(p({ level: 1, counts: { farm: 9 } }, 'producers3')).toEqual({ current: 3, target: 3 });
        expect(p({ level: 1, counts: { farm: 4 } }, 'producers6')).toEqual({ current: 4, target: 6 });
        expect(p({ level: 1, counts: {} }, 'longhouse2')).toEqual({ current: 1, target: 2 });
        expect(p({ level: 7, counts: {} }, 'longhouse5')).toEqual({ current: 5, target: 5 });
        expect(p({ level: 1, counts: {} }, 'tower3')).toEqual({ current: 0, target: 3 });
        expect(p({ level: 1, counts: {}, towerLevel: 2 }, 'tower3')).toEqual({ current: 2, target: 3 });
        expect(p({ level: 1, counts: {}, fightingLandUnits: 3 }, 'spearmen5')).toEqual({ current: 3, target: 5 });
        expect(p({ level: 1, counts: {}, troopsTrained: true }, 'spearmen5')).toEqual({ current: 5, target: 5 });
        expect(p({ level: 1, counts: {} }, 'hunt1')).toBeNull();
        expect(p({ level: 1, counts: {} }, 'storagehouse1')).toBeNull();
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
    it('keeps the spearmen quest completed once the troops were trained', () => {
        const list = evaluateDemoQuests({ level: 1, counts: {}, troopsTrained: true, fightingLandUnits: 0 }, 0);
        expect(done(list)).toEqual(['spearmen5']);
    });
    it('completes the hunt quest only with trained troops and a started hunt', () => {
        expect(done(evaluateDemoQuests({ level: 1, counts: {} }, 0))).not.toContain('hunt1');
        expect(done(evaluateDemoQuests({ level: 1, counts: {}, huntStarted: true }, 0))).not.toContain('hunt1');
        expect(done(evaluateDemoQuests({ level: 1, counts: {}, troopsTrained: true }, 0))).not.toContain('hunt1');
        const list = evaluateDemoQuests({ level: 1, counts: {}, troopsTrained: true, huntStarted: true }, 0);
        expect(done(list)).toContain('hunt1');
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
describe('quest hints', () => {
    // The Quarry can't be placed any more (newPlacementDisabled); a hint that sends players to build one is a dead end.
    it('never tell the player to build a Quarry', async () => {
        const en = (await import('../i18n/locales/en/quests.json')).default;
        const de = (await import('../i18n/locales/de/quests.json')).default;
        const hints = [...Object.values(en.items), ...Object.values(de.items)].map((item) => item.hint);
        expect(hints.filter((h) => /quarr|steinbr/i.test(h))).toEqual([]);
    });
});
