import { ref, watch } from 'vue';
const storageKey = (settlementId) => `quests.seen.${settlementId}`;
function load(settlementId) {
    if (!settlementId)
        return new Set();
    try {
        const raw = localStorage.getItem(storageKey(settlementId));
        const parsed = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : []);
    }
    catch {
        return new Set();
    }
}
function save(settlementId, keys) {
    if (!settlementId)
        return;
    try {
        localStorage.setItem(storageKey(settlementId), JSON.stringify([...keys]));
    }
    catch {
        // Private window / blocked storage: the dot just re-lights after a reload.
    }
}
/**
 * Which quest notices (`${id}:open`, `${id}:ready`) the player has already seen
 * in the opened quest card, kept per settlement in localStorage.
 */
export function useQuestSeen(settlementId) {
    const seen = ref(load(settlementId.value));
    watch(settlementId, (id) => {
        seen.value = load(id);
    });
    /** Whether any of `keys` has not been seen yet. */
    function hasUnseen(keys) {
        return keys.some((k) => !seen.value.has(k));
    }
    /** Marks `keys` as seen and persists them. */
    function markSeen(keys) {
        if (!hasUnseen(keys))
            return;
        const next = new Set(seen.value);
        for (const k of keys)
            next.add(k);
        seen.value = next;
        save(settlementId.value, next);
    }
    return { hasUnseen, markSeen };
}
