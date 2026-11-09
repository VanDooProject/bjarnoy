// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useQuestSeen } from './useQuestSeen';
describe('useQuestSeen', () => {
    beforeEach(() => localStorage.clear());
    it('reports keys as unseen until they are marked', () => {
        const { hasUnseen, markSeen } = useQuestSeen(ref('s1'));
        expect(hasUnseen(['a:open'])).toBe(true);
        markSeen(['a:open']);
        expect(hasUnseen(['a:open'])).toBe(false);
        expect(hasUnseen(['a:open', 'a:ready'])).toBe(true);
    });
    it('persists per settlement and survives a new instance', () => {
        useQuestSeen(ref('s1')).markSeen(['a:open']);
        expect(JSON.parse(localStorage.getItem('quests.seen.s1'))).toEqual(['a:open']);
        expect(useQuestSeen(ref('s1')).hasUnseen(['a:open'])).toBe(false);
        expect(useQuestSeen(ref('s2')).hasUnseen(['a:open'])).toBe(true);
    });
    it('reloads when the settlement changes', async () => {
        localStorage.setItem('quests.seen.s2', JSON.stringify(['b:ready']));
        const id = ref('s1');
        const { hasUnseen } = useQuestSeen(id);
        expect(hasUnseen(['b:ready'])).toBe(true);
        id.value = 's2';
        await nextTick();
        expect(hasUnseen(['b:ready'])).toBe(false);
    });
    it('ignores corrupt stored data and works when storage throws', () => {
        localStorage.setItem('quests.seen.s1', '{nope');
        expect(useQuestSeen(ref('s1')).hasUnseen(['a:open'])).toBe(true);
        const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        const { hasUnseen, markSeen } = useQuestSeen(ref('s1'));
        markSeen(['a:open']);
        expect(hasUnseen(['a:open'])).toBe(false);
        get.mockRestore();
        set.mockRestore();
    });
    it('keeps seen keys in memory only without a settlement', () => {
        const { hasUnseen, markSeen } = useQuestSeen(ref(null));
        markSeen(['a:open']);
        expect(hasUnseen(['a:open'])).toBe(false);
        expect(localStorage.length).toBe(0);
    });
});
