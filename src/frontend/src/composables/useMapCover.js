import { computed, onScopeDispose, ref, toValue, watch } from 'vue';
/**
 * How many surfaces currently hide the settlement map completely (today: the
 * opaque fullscreen route modal on phones). While any does, nobody can see
 * the map, so `useHexMapRenderer` stops its Pixi ticker instead of spending
 * CPU/GPU/battery on frames behind an opaque panel.
 */
const coverCount = ref(0);
export const mapCovered = computed(() => coverCount.value > 0);
/**
 * Registers the calling component as covering the map while `active` is
 * true. Each caller holds at most one contribution and gives it back when
 * `active` turns false or its scope is disposed.
 */
export function useCoversMap(active) {
    let holding = false;
    const set = (on) => {
        if (on === holding)
            return;
        holding = on;
        coverCount.value += on ? 1 : -1;
    };
    watch(() => toValue(active), set, { immediate: true });
    onScopeDispose(() => set(false));
}
